// -----------------------------------------------------------------------------
// Scene triggers and actions (manifest `scene_triggers` / `scene_actions`).
//
// The core already provides the calendar trigger "an event is coming" and the
// actions "is an event running" and "get the events of today / tomorrow /
// the next hours": nothing here repeats them. What the integration adds:
//
//   - trigger `event_changed`: an occurrence of the coming days was added,
//     cancelled, rescheduled or renamed in a feed (a class cancelled in the
//     school timetable, a waste collection moved by a bank holiday);
//   - trigger `calendar_unreachable`: a feed has been failing for hours (an
//     expired Pronote link, a regenerated Google secret address);
//   - action `next_event`: the next event matching a text, however far, with
//     the number of days until it ("bulky waste in 12 days"). `found` is a
//     number (1/0): the core's "condition on variables" compares strictly,
//     and what the user types there is never a boolean.
//
// Like the core's calendar scenes, only SHARED calendars are involved: a
// scene is household business, a private calendar stays private.
// -----------------------------------------------------------------------------

import { TEXT, errorText, pick } from './i18n.js';
import { daysUntil, formatStart } from './format.js';

export const TRIGGERS = {
  EVENT_CHANGED: 'event_changed',
  CALENDAR_UNREACHABLE: 'calendar_unreachable',
};

export const SCENE_TRIGGER_KEYS = Object.values(TRIGGERS);

/** Lowercase, without accents nor extra blanks: "Déchets  verts" matches "dechets verts". */
export function fold(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * The data of an `event_changed` event.
 * @param {{ change: string, occurrence: object }} change from diffSnapshots()
 * @param {string} calendar the calendar name
 * @param {string} language the `language` setting
 * @param {number} now
 */
export function changeEventData({ change, occurrence }, calendar, language, now) {
  const text = pick(TEXT, language);
  return {
    calendar,
    change,
    change_label: text[change],
    name: (occurrence.name || text.untitled).slice(0, 1000),
    start: formatStart(occurrence, language),
    days_until: daysUntil(occurrence, now),
    location: (occurrence.location || '').slice(0, 1000),
  };
}

/**
 * The data of a `calendar_unreachable` event.
 * @param {object} state feed state (src/syncer.js)
 * @param {string} calendar the calendar name
 * @param {string} language
 * @param {number} now
 */
export function unreachableEventData(state, calendar, language, now) {
  return {
    calendar,
    user: state.userName,
    error: errorText(state.lastError, language),
    hours: Math.floor((now - state.failingSince) / 3_600_000),
  };
}

/**
 * The next shared occurrence whose calendar and title match, running ones
 * included (a full-day collection is "today" all day long).
 * @param {{ occurrence: object, calendar: string }[]} upcoming sorted by start
 * @param {{ calendar?: string, contains?: string }} fields
 */
export function findNext(upcoming, fields) {
  const calendar = fold(fields.calendar);
  const contains = fold(fields.contains);
  return upcoming.find(
    (entry) =>
      (!calendar || fold(entry.calendar) === calendar) &&
      (!contains || fold(entry.occurrence.name).includes(contains)),
  );
}

export const SCENE_ACTIONS = {
  /**
   * @param {{ syncer: import('./syncer.js').Syncer, config: object, now: number }} context
   * @param {{ calendar?: string, contains?: string }} fields
   */
  async next_event({ syncer, config, now }, fields) {
    const found = findNext(syncer.sharedUpcoming(), fields);
    if (!found) {
      return { found: 0, name: '', start: '', days_until: -1, location: '', calendar: '' };
    }
    const language = config.language;
    return {
      found: 1,
      name: found.occurrence.name || pick(TEXT, language).untitled,
      start: formatStart(found.occurrence, language),
      days_until: daysUntil(found.occurrence, now),
      location: found.occurrence.location || '',
      calendar: found.calendar,
    };
  },
};
