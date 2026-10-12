// -----------------------------------------------------------------------------
// The synchronization: for every user who enabled the integration ("My
// calendars"), download each feed of their account, then mirror it into ONE
// Gladys calendar of theirs.
//
//   - a download is conditional (ETag / Last-Modified) within a day; the
//     first one of the day is a full one, because the rolling range moves
//     (occurrences enter the horizon, old ones leave the history);
//   - nothing is written when nothing changed: the core allows 30 calendar
//     writes per minute for the whole integration (src/limiter.js);
//   - a calendar whose address left the account is deleted from Gladys;
//   - a calendar the user switched off (`sync: false`) is neither downloaded
//     nor written: the core emptied it and refuses its events;
//   - only SHARED calendars reach the scenes and the dashboard (the core's
//     own rule for its calendar triggers): the household chose to see them.
// -----------------------------------------------------------------------------

import { GladysApiError, createLogger } from '@gladysassistant/integration-sdk';
import { parseAccount } from './config.js';
import { fetchFeed } from './fetcher.js';
import { parseCalendar, expandEvents } from './ics.js';
import {
  HISTORY_DAYS,
  keptRange,
  plainText,
  selectOccurrences,
  splitWindows,
  toGladysEvent,
  truncate,
} from './events.js';
import { MAX_CHANGES_PER_DOWNLOAD, diffSnapshots, snapshotOf } from './changes.js';
import { REPORT_TEXT, TEXT, allLanguages, errorText, pick } from './i18n.js';
import { feedId, hostOf, maskUrl, normalizeFeedUrl, digest } from './url.js';
import { addDays, addMonths, localDate, localMidnight } from './time.js';
import { ERROR_CODES, FeedError } from './fetcher.js';

const logger = createLogger({ name: 'sync' });

// Colors of the calendars, by slot, when the feed declares none.
export const SLOT_COLORS = ['#3174ad', '#e67c73', '#33b679', '#f6bf26', '#8e24aa'];
// Upcoming occurrences kept in memory per feed (widget, scene action).
const MAX_UPCOMING = 1000;

export class Syncer {
  /**
   * @param {object} options
   * @param {import('@gladysassistant/integration-sdk').GladysIntegration} options.gladys
   * @param {ReturnType<import('./store.js').createStore>} options.store
   * @param {ReturnType<import('./limiter.js').createLimiter>} options.limiter
   * @param {() => object} options.getConfig the normalized admin config
   * @param {typeof fetch} [options.fetchImpl]
   * @param {() => number} [options.now]
   * @param {string} [options.userAgent]
   * @param {(ms: number) => Promise<void>} [options.sleep]
   * @param {(state: object, changes: object[]) => Promise<void>} [options.onChanges]
   * @param {(state: object) => Promise<void>} [options.onUnreachable]
   */
  constructor(options) {
    this.gladys = options.gladys;
    this.store = options.store;
    this.limiter = options.limiter;
    this.getConfig = options.getConfig;
    this.fetchImpl = options.fetchImpl;
    this.now = options.now ?? Date.now;
    this.userAgent = options.userAgent;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.onChanges = options.onChanges ?? (async () => {});
    this.onUnreachable = options.onUnreachable ?? (async () => {});
    /** @type {Map<string, object>} feed states by `<user>:<feed id>` */
    this.feeds = new Map();
    this.ready = false;
    this.running = Promise.resolve();
  }

  /** Run `fn` after the synchronization in progress: one at a time. */
  exclusive(fn) {
    const run = this.running.then(fn);
    this.running = run.catch(() => {});
    return run;
  }

  /** Every enabled user, every feed. */
  syncAll({ force = false } = {}) {
    return this.exclusive(async () => {
      const accounts = await this.gladys.getCalendarAccounts();
      const calendars = await this.gladys.getCalendars();
      const enabled = new Set(accounts.map((account) => account.user.selector));
      for (const state of [...this.feeds.values()]) {
        if (!enabled.has(state.user)) {
          this.forget(state);
        }
      }
      for (const account of accounts) {
        const own = calendars.filter((calendar) => calendar.user === account.user.selector);
        await this.syncAccount(account, own, { force });
      }
      this.ready = true;
      await this.store.save();
      await this.publishStatus();
      return this.report(accounts.length);
    });
  }

  /** One user, after they enabled, disabled or changed their account. */
  syncUser(selector, { force = true } = {}) {
    return this.exclusive(async () => {
      const accounts = await this.gladys.getCalendarAccounts();
      const account = accounts.find((candidate) => candidate.user.selector === selector);
      if (!account) {
        // Disabled: the core already destroyed their calendars.
        for (const state of this.feedsOf(selector)) {
          this.forget(state);
        }
      } else {
        await this.syncAccount(account, await this.gladys.getCalendars(selector), { force });
      }
      await this.store.save();
      await this.publishStatus();
    });
  }

  feedsOf(user) {
    return [...this.feeds.values()].filter((state) => state.user === user);
  }

  forget(state) {
    this.feeds.delete(state.key);
    this.store.set(state.key, undefined);
  }

  /**
   * @param {{ user: { selector: string, first_name?: string }, config: object }} account
   * @param {object[]} calendars the user's calendars of this integration (GET /calendar)
   */
  async syncAccount(account, calendars, { force }) {
    const user = account.user.selector;
    const wanted = [];
    for (const slot of parseAccount(account.config ?? {})) {
      const state = this.stateFor(account, slot);
      if (!wanted.some((other) => other.key === state.key)) {
        wanted.push(state);
      }
    }
    for (const state of this.feedsOf(user)) {
      if (!wanted.includes(state)) {
        this.forget(state);
      }
    }

    // A calendar whose address left the account (or changed) goes away.
    const wantedIds = new Set(wanted.map((state) => state.calendarId).filter(Boolean));
    for (const calendar of calendars) {
      if (!wantedIds.has(calendar.external_id)) {
        logger.info(
          `Deleting calendar "${calendar.name}" of ${user}: its address left the account`,
        );
        await this.write(() => this.gladys.deleteCalendar(calendar.external_id)).catch((err) =>
          logger.warn(`Could not delete a calendar of ${user}: ${describe(err)}`),
        );
      }
    }
    for (const state of wanted) {
      const calendar = calendars.find((candidate) => candidate.external_id === state.calendarId);
      state.exists = Boolean(calendar);
      state.sync = calendar ? calendar.sync !== false : true;
      state.shared = calendar ? calendar.shared === true : false;
      if (!state.shared) {
        // Scenes only see shared calendars: no baseline to keep for them.
        state.snapshot = null;
      }
    }

    const fresh = [];
    for (const state of wanted) {
      if (!state.sync) {
        continue;
      }
      if (await this.download(state, { force })) {
        fresh.push(state);
      }
    }
    if (fresh.length === 0) {
      return;
    }
    try {
      await this.write(() =>
        this.gladys.publishCalendars(
          user,
          fresh.map((state) => this.calendarOf(state)),
        ),
      );
    } catch (err) {
      logger.error(`Could not publish the calendars of ${user}: ${describe(err)}`);
      for (const state of fresh) {
        state.pending = null;
      }
      return;
    }
    for (const state of fresh) {
      state.exists = true;
      await this.publishEvents(state);
    }
  }

  /** The feed state of one account slot, created or refreshed. */
  stateFor(account, slot) {
    const user = account.user.selector;
    const normalized = normalizeFeedUrl(slot.url);
    const id = normalized ? feedId(normalized) : `x${digest(slot.url)}`;
    const key = `${user}:${id}`;
    let state = this.feeds.get(key);
    if (!state) {
      const saved = this.store.get(key) ?? {};
      state = {
        key,
        user,
        feedId: id,
        feed: normalized,
        calendarId: normalized ? this.gladys.externalId(`${user}:${id}`) : null,
        failingSince: saved.failingSince ?? null,
        alerted: saved.alerted === true,
        lastError: null,
        lastSuccessAt: null,
        etag: undefined,
        lastModified: undefined,
        contentHash: null,
        publishedDay: null,
        publishedHorizon: null,
        title: null,
        upcoming: [],
        snapshot: null,
        pending: null,
      };
      this.feeds.set(key, state);
    }
    state.slot = slot.slot;
    state.name = slot.name;
    state.userName = account.user.first_name || user;
    return state;
  }

  /** The name shown for a feed in messages: never its address. */
  displayName(state) {
    return state.title || state.name || (state.feed ? hostOf(state.feed.url) : `#${state.slot}`);
  }

  calendarOf(state) {
    const { parsed } = state.pending;
    const name = truncate(state.name || parsed.name || hostOf(state.feed.url) || 'iCalendar', 100);
    state.title = name;
    const calendar = {
      external_id: state.calendarId,
      name,
      color: parsed.color ?? SLOT_COLORS[(state.slot - 1) % SLOT_COLORS.length],
    };
    if (parsed.description) {
      calendar.description = truncate(parsed.description, 500);
    }
    return calendar;
  }

  /**
   * Download and parse a feed when it may have changed. Resolves true when
   * there is something new to publish (left in `state.pending`).
   */
  async download(state, { force }) {
    if (!state.feed) {
      await this.failed(state, new FeedError(ERROR_CODES.INVALID_URL));
      return false;
    }
    const config = this.getConfig();
    const today = localDate(new Date(this.now()));
    const upToDate =
      !force &&
      state.contentHash !== null &&
      state.publishedDay === today &&
      state.publishedHorizon === config.horizon_months;
    let result;
    try {
      result = await fetchFeed(state.feed, {
        etag: upToDate ? state.etag : undefined,
        lastModified: upToDate ? state.lastModified : undefined,
        fetchImpl: this.fetchImpl,
        userAgent: this.userAgent,
      });
    } catch (err) {
      await this.failed(state, err);
      return false;
    }
    if (result.notModified) {
      await this.succeeded(state);
      return false;
    }
    state.etag = result.etag;
    state.lastModified = result.lastModified;
    const hash = digest(result.text, 32);
    if (upToDate && hash === state.contentHash) {
      await this.succeeded(state);
      return false;
    }
    let parsed;
    try {
      parsed = parseCalendar(result.text);
    } catch (err) {
      await this.failed(state, err);
      return false;
    }
    await this.succeeded(state);
    state.pending = { parsed, hash };
    logger.info(
      `Downloaded ${this.displayName(state)} of ${state.user} (${maskUrl(state.feed.url)}): ${parsed.events.length} event(s)`,
    );
    return true;
  }

  async succeeded(state) {
    state.lastSuccessAt = this.now();
    state.lastError = null;
    if (state.failingSince !== null || state.alerted) {
      logger.info(`${this.displayName(state)} of ${state.user} is reachable again`);
      state.failingSince = null;
      state.alerted = false;
      this.store.set(state.key, undefined);
    }
  }

  async failed(state, err) {
    const now = this.now();
    state.lastError =
      err instanceof FeedError ? err : new FeedError(ERROR_CODES.NETWORK, err?.name);
    if (state.failingSince === null) {
      state.failingSince = now;
    }
    logger.warn(
      `Could not download ${this.displayName(state)} of ${state.user} (${state.feed ? maskUrl(state.feed.url) : 'invalid address'}): ${state.lastError.message}`,
    );
    const hours = this.getConfig().unreachable_hours;
    if (!state.alerted && state.shared && now - state.failingSince >= hours * 3_600_000) {
      state.alerted = true;
      try {
        await this.onUnreachable(state);
      } catch (error) {
        logger.warn(`Could not fire the unreachable trigger: ${describe(error)}`);
      }
    }
    this.store.set(state.key, { failingSince: state.failingSince, alerted: state.alerted });
  }

  /** Expand the pending download and replace the calendar's events with it. */
  async publishEvents(state) {
    const { parsed, hash } = state.pending;
    state.pending = null;
    const config = this.getConfig();
    const now = this.now();
    const today = localDate(new Date(now));
    const horizonEnd = addMonths(today, Number(config.horizon_months));
    const { occurrences, skipped: unexpanded } = expandEvents(parsed.events, {
      from: new Date(localMidnight(addDays(today, -HISTORY_DAYS - 1))),
      to: new Date(localMidnight(addDays(horizonEnd, 1))),
    });
    const { kept, dropped } = selectOccurrences(occurrences, {
      ...keptRange(today, horizonEnd),
      now,
    });
    const { requests, dropped: crowded } = splitWindows(kept);
    const skipped = unexpanded + parsed.skipped;
    if (skipped + dropped + crowded > 0) {
      logger.warn(
        `${this.displayName(state)} of ${state.user}: ${skipped} unreadable event(s), ${dropped + crowded} occurrence(s) over the limits left out`,
      );
    }
    const language = config.language;
    const untitled = pick(TEXT, language).untitled;
    const eventId = (suffix) => this.gladys.externalId(`${state.user}:${state.feedId}:${suffix}`);
    for (const request of requests) {
      const events = request.occurrences.map((occurrence) =>
        toGladysEvent(occurrence, eventId, untitled),
      );
      const window = {
        from: new Date(request.from).toISOString(),
        to: new Date(request.to).toISOString(),
      };
      try {
        await this.write(() => this.gladys.publishCalendarEvents(state.calendarId, events, window));
      } catch (err) {
        if (err instanceof GladysApiError && err.status === 403) {
          // Switched off by the user while we were writing.
          state.sync = false;
          return;
        }
        logger.error(
          `Could not publish the events of ${this.displayName(state)} of ${state.user}: ${describe(err)}`,
        );
        return;
      }
    }
    state.contentHash = hash;
    state.publishedDay = today;
    state.publishedHorizon = config.horizon_months;
    state.upcoming = kept
      .filter((occurrence) => occurrence.endMs > now)
      .slice(0, MAX_UPCOMING)
      .map((occurrence) => ({
        ...occurrence,
        description: truncate(plainText(occurrence.description), 1000),
      }));
    logger.info(
      `Published ${kept.length} occurrence(s) of ${this.displayName(state)} of ${state.user} in ${requests.length} request(s)`,
    );

    if (state.shared && state.sync) {
      const snapshot = snapshotOf(kept);
      if (state.snapshot) {
        const changes = diffSnapshots(state.snapshot, snapshot, {
          now,
          until: now + config.change_days * 86_400_000,
        });
        if (changes.length > MAX_CHANGES_PER_DOWNLOAD) {
          logger.info(
            `${changes.length} changes in ${this.displayName(state)} at once: a rewritten feed, no scene fired`,
          );
        } else if (changes.length > 0) {
          await this.onChanges(state, changes).catch((err) =>
            logger.warn(`Could not fire the change triggers: ${describe(err)}`),
          );
        }
      }
      state.snapshot = snapshot;
    }
  }

  /** A calendar write, through the rate limiter, retried once after a 429. */
  async write(fn) {
    try {
      return await this.limiter.schedule(fn);
    } catch (err) {
      if (err instanceof GladysApiError && err.status === 429) {
        logger.warn('Calendar write rate limit reached, waiting a minute');
        await this.sleep(60_000);
        return this.limiter.schedule(fn);
      }
      throw err;
    }
  }

  /** The feeds that currently fail, with their owner. */
  failing() {
    return [...this.feeds.values()].filter((state) => state.lastError);
  }

  /** Connection status of the Configuration screen. */
  async publishStatus() {
    const failing = this.failing();
    const total = this.feeds.size;
    try {
      if (failing.length === 0) {
        await this.gladys.setConnectionStatus(true);
      } else {
        await this.gladys.setConnectionStatus(
          failing.length < total,
          allLanguages((language) => pick(REPORT_TEXT, language).statusFailing(failing.length)),
        );
      }
    } catch (err) {
      logger.warn(`Could not update the connection status: ${describe(err)}`);
    }
  }

  /** What the "Sync now" action shows, in every language (the admin reads theirs). */
  report(accountCount) {
    const failing = this.failing();
    return allLanguages((language) => {
      const text = pick(REPORT_TEXT, language);
      if (accountCount === 0) {
        return text.noAccount;
      }
      const lines = [text.synced(this.feeds.size - failing.length, this.feeds.size)];
      for (const state of failing) {
        lines.push(
          text.failed(
            this.displayName(state),
            state.userName,
            errorText(state.lastError, language),
          ),
        );
      }
      return lines.join('\n');
    });
  }

  /** Upcoming occurrences of the shared, synchronized calendars. */
  sharedUpcoming() {
    const now = this.now();
    const entries = [];
    for (const state of this.feeds.values()) {
      if (!state.shared || !state.sync) {
        continue;
      }
      for (const occurrence of state.upcoming) {
        if (occurrence.endMs > now || occurrence.startMs >= now) {
          entries.push({ occurrence, calendar: this.displayName(state), state });
        }
      }
    }
    return entries.sort((a, b) => a.occurrence.startMs - b.occurrence.startMs);
  }

  /** The shared calendars, for the widget's status rows. */
  sharedFeeds() {
    return [...this.feeds.values()].filter((state) => state.shared && state.sync);
  }
}

/** An error, in a log line, without anything secret. */
export function describe(err) {
  if (err instanceof GladysApiError) {
    return `HTTP ${err.status} ${err.code ?? ''} ${err.message ?? ''}`.trim();
  }
  return err?.message || err?.name || 'error';
}
