// -----------------------------------------------------------------------------
// Dashboard widget "Upcoming events": the agenda of the coming days, from the
// SHARED calendars (a dashboard is seen by the whole household and can hang
// on a wall), optionally restricted to some of them by name. The core only
// offers a one-line "next event" chip: this is the list, with the place, the
// description and the link of each event behind a tap.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { REPORT_TEXT, TEXT, pick } from './i18n.js';
import { formatWhen } from './format.js';
import { fold } from './scenes.js';
import { truncate } from './events.js';

export const UPCOMING_WIDGET = 'upcoming_events';
export const WIDGET_ACTIONS = { SYNC: 'sync' };
export const WIDGET_DAYS = ['1', '3', '7', '14', '31'];
const MAX_ITEMS = 8;
// Past this delay, the "Sync now" button answers before the end of the sync.
const ACTION_WAIT_MS = 25_000;

/** Texts of the widget that depend on a number of days. */
export const WIDGET_TEXT = {
  en: {
    empty: (days) => (days === 1 ? 'Nothing today.' : `Nothing in the next ${days} days.`),
    started: 'Synchronization started.',
  },
  fr: {
    empty: (days) => (days === 1 ? "Rien aujourd'hui." : `Rien dans les ${days} prochains jours.`),
    started: 'Synchronisation lancée.',
  },
  de: {
    empty: (days) => (days === 1 ? 'Heute nichts.' : `Nichts in den nächsten ${days} Tagen.`),
    started: 'Synchronisierung gestartet.',
  },
  es: {
    empty: (days) => (days === 1 ? 'Nada hoy.' : `Nada en los próximos ${days} días.`),
    started: 'Sincronización iniciada.',
  },
};

/** The calendar names of the `calendars` setting, folded. */
export function parseCalendarFilter(setting) {
  return String(setting ?? '')
    .split(/[,;\n]/)
    .map(fold)
    .filter(Boolean);
}

function syncButton(language) {
  return {
    type: 'button',
    label: pick(TEXT, language).syncButton,
    icon: 'refresh-cw',
    style: 'secondary',
    action: { key: WIDGET_ACTIONS.SYNC },
  };
}

/**
 * The widget content.
 * @param {import('./syncer.js').Syncer} syncer
 * @param {{ settings?: object, language?: string, now: number }} request
 */
export function upcomingContent(syncer, { settings = {}, language = 'en', now }) {
  const text = pick(TEXT, language);
  if (!syncer.ready) {
    return {
      ttl_seconds: 30,
      components: [{ type: 'text', variant: 'caption', text: text.loading }],
    };
  }
  const days = Number(WIDGET_DAYS.includes(String(settings.days)) ? settings.days : '7');
  const wanted = parseCalendarFilter(settings.calendars);
  const selected = (name) => wanted.length === 0 || wanted.includes(fold(name));
  const feeds = syncer.sharedFeeds().filter((state) => selected(syncer.displayName(state)));
  if (feeds.length === 0) {
    return {
      ttl_seconds: 300,
      components: [{ type: 'text', variant: 'body', text: text.noSharedCalendar }],
    };
  }

  // The coming days, counted in calendar days: "7 days" ends at the midnight
  // that closes the 7th day, today included.
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + days);
  const entries = syncer
    .sharedUpcoming()
    .filter((entry) => selected(entry.calendar) && entry.occurrence.startMs < end.getTime())
    .slice(0, MAX_ITEMS);
  const severalCalendars = new Set(entries.map((entry) => entry.calendar)).size > 1;

  const components = [];
  if (entries.length === 0) {
    components.push({
      type: 'text',
      variant: 'body',
      text: pick(WIDGET_TEXT, language).empty(days),
    });
  } else {
    components.push({
      type: 'card-list',
      display: 'list',
      items: entries.map(({ occurrence, calendar }) => {
        const details = [occurrence.location, occurrence.description].filter(Boolean).join('\n\n');
        return {
          title: truncate(occurrence.name || text.untitled, 60),
          subtitle: truncate(formatWhen(occurrence, language, now), 60),
          ...(severalCalendars
            ? { badge: { text: truncate(calendar, 16), color: WIDGET_COLORS.INFO } }
            : {}),
          ...(details ? { description: truncate(details, 2000) } : {}),
          ...(/^https:\/\/\S+$/i.test(occurrence.url)
            ? { links: [{ url: occurrence.url, label: truncate(occurrence.name || 'Link', 24) }] }
            : {}),
        };
      }),
    });
  }
  const failing = feeds.filter((state) => state.lastError).slice(0, 10);
  if (failing.length > 0) {
    components.push({
      type: 'status',
      items: failing.map((state) => ({
        label: truncate(syncer.displayName(state), 40),
        value: text.unreachable,
        icon: 'alert-triangle',
        color: WIDGET_COLORS.DANGER,
      })),
    });
  }
  components.push(syncButton(language));
  return { ttl_seconds: 300, components };
}

/**
 * "Sync now" from the dashboard: answers with the result, or with "started"
 * when the synchronization takes longer (many calendars, rate limit).
 */
export async function upcomingAction(syncer, { actionKey, config, waitMs = ACTION_WAIT_MS }) {
  if (actionKey !== WIDGET_ACTIONS.SYNC) {
    throw new Error(`Unknown widget action: ${actionKey}`);
  }
  const language = config.language;
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), waitMs);
  });
  const sync = syncer.syncAll({ force: true }).then(
    () => {
      const failing = syncer.failing().length;
      return pick(REPORT_TEXT, language).synced(syncer.feeds.size - failing, syncer.feeds.size);
    },
    () => null,
  );
  const result = await Promise.race([sync, timeout]);
  clearTimeout(timer);
  return result ?? pick(WIDGET_TEXT, language).started;
}
