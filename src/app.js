// -----------------------------------------------------------------------------
// Wiring between the Gladys SDK and the synchronization: the handlers, the
// periodic refresh, the scene events. Takes the SDK client as a parameter so
// the tests drive it with the SDK's fake Gladys.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig, refreshMs } from './config.js';
import { createLimiter } from './limiter.js';
import { createStore } from './store.js';
import { Syncer, describe } from './syncer.js';
import { SCENE_ACTIONS, TRIGGERS, changeEventData, unreachableEventData } from './scenes.js';
import { UPCOMING_WIDGET, upcomingAction, upcomingContent } from './widgets.js';

const logger = createLogger({ name: 'app' });

export const ACTIONS = { SYNC_NOW: 'sync_now' };

/**
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {object} [deps] test seams
 * @param {typeof fetch} [deps.fetchImpl]
 * @param {() => number} [deps.now]
 * @param {ReturnType<typeof createStore>} [deps.store]
 * @param {ReturnType<typeof createLimiter>} [deps.limiter]
 * @param {(ms: number) => Promise<void>} [deps.sleep]
 * @param {boolean} [deps.timers] false: no periodic refresh (tests)
 * @param {string} [deps.userAgent]
 */
export function registerHandlers(gladys, deps = {}) {
  const now = deps.now ?? Date.now;
  const store = deps.store ?? createStore();
  const useTimers = deps.timers !== false;
  let config = normalizeConfig();
  let timer = null;
  let stopped = false;
  let loaded = null;
  let pending = Promise.resolve();

  const syncer = new Syncer({
    gladys,
    store,
    limiter: deps.limiter ?? createLimiter(),
    getConfig: () => config,
    fetchImpl: deps.fetchImpl,
    now,
    sleep: deps.sleep,
    userAgent: deps.userAgent,
    onChanges: async (state, changes) => {
      for (const change of changes) {
        await gladys.publishSceneEvent(
          TRIGGERS.EVENT_CHANGED,
          changeEventData(change, syncer.displayName(state), config.language, now()),
        );
      }
      logger.info(`${changes.length} change(s) in ${syncer.displayName(state)} sent to the scenes`);
    },
    onUnreachable: async (state) => {
      await gladys.publishSceneEvent(
        TRIGGERS.CALENDAR_UNREACHABLE,
        unreachableEventData(state, syncer.displayName(state), config.language, now()),
      );
      logger.info(`${syncer.displayName(state)} unreachable: scene trigger fired`);
    },
  });

  const refreshWidget = () => gladys.requestWidgetRefresh(UPCOMING_WIDGET);

  async function run(label, fn) {
    try {
      const result = await fn();
      refreshWidget();
      return result;
    } catch (err) {
      logger.error(`${label} failed: ${describe(err)}`);
      return undefined;
    }
  }

  function schedule() {
    clearTimeout(timer);
    if (!useTimers || stopped) {
      return;
    }
    timer = setTimeout(async () => {
      if (gladys.connected !== false) {
        await run('Periodic synchronization', () => syncer.syncAll({ force: false }));
      }
      schedule();
    }, refreshMs(config));
    timer.unref?.();
  }

  gladys.on('connected', async () => {
    loaded ??= store.load();
    await loaded;
    try {
      config = normalizeConfig(await gladys.getConfig());
    } catch (err) {
      logger.error(`Could not read the configuration: ${describe(err)}`);
    }
    // The resync contract of the calendar type: what was missed while
    // disconnected (an account enabled, a calendar switched back on) is only
    // known by re-reading everything, and republishing it.
    schedule();
    pending = run('Synchronization', () => syncer.syncAll({ force: true }));
  });

  gladys.on('disconnected', () => clearTimeout(timer));

  gladys.onConfigUpdated(async (newConfig) => {
    const previous = config;
    config = normalizeConfig(newConfig);
    logger.info('Configuration updated');
    if (previous.refresh_minutes !== config.refresh_minutes) {
      schedule();
    }
    if (previous.horizon_months !== config.horizon_months) {
      pending = run('Synchronization', () => syncer.syncAll({ force: true }));
    }
  });

  gladys.onCalendarAccountUpdated(async (userSelector) => {
    logger.info(`Account of ${userSelector} updated`);
    pending = run('Synchronization', () => syncer.syncUser(userSelector, { force: true }));
  });

  gladys.onAction(ACTIONS.SYNC_NOW, async () => {
    const report = await syncer.syncAll({ force: true });
    refreshWidget();
    return report;
  });

  gladys.onSceneAction('next_event', (fields) =>
    SCENE_ACTIONS.next_event({ syncer, config, now: now() }, fields),
  );

  gladys.onWidgetGet(UPCOMING_WIDGET, async ({ settings, language }) =>
    upcomingContent(syncer, { settings, language, now: now() }),
  );
  gladys.onWidgetAction(UPCOMING_WIDGET, async (actionKey) =>
    upcomingAction(syncer, { actionKey, config }),
  );

  return {
    syncer,
    /** Resolves once the synchronization in progress is over (tests). */
    idle: async () => {
      await pending;
      await syncer.running;
    },
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await store.save();
    },
  };
}
