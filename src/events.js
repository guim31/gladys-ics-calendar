// -----------------------------------------------------------------------------
// From occurrences to the Gladys calendar contract (host API
// `POST /calendar/event`, capabilities/calendar-type.md of the core):
//
//   - user-scoped ids: `ext:<selector>:<user>:<feed>:<uid digest>[@<date>]`,
//     at most 255 characters whatever the length of the provider UID;
//   - bounded texts (name 1-200, location 500, description 1000, url 500);
//   - full-day events as calendar dates, `end` exclusive;
//   - ONE window per request, at most 500 events each: the content of a
//     calendar is replaced by a series of DISJOINT sub-windows covering
//     [SYNC_FROM, SYNC_TO), every event sent in each sub-window it overlaps.
//
// The whole timeline is replaced on every publication, so an event deleted
// from the feed, an occurrence that fell more than HISTORY_DAYS in the past
// or one beyond a shortened horizon disappears from Gladys without any
// bookkeeping.
// -----------------------------------------------------------------------------

import { digest } from './url.js';
import { addDays, localDate, localNoon } from './time.js';

export const MAX_EVENTS_PER_REQUEST = 500;
// The core caps a calendar at 10 000 events: stay clear of it.
export const MAX_EVENTS_PER_CALENDAR = 9000;
// How far back occurrences are kept in Gladys (the calendar view, the
// history of what happened): older ones are pruned.
export const HISTORY_DAYS = 90;
// Bounds of the replaced timeline: everything the integration ever pushed.
export const SYNC_FROM = Date.UTC(1970, 0, 1);
export const SYNC_TO = Date.UTC(2200, 0, 1);

const LIMITS = { name: 200, location: 500, description: 1000, url: 500 };

/** Shorten a text to `max` characters (UTF-16 units, as the core counts), with an ellipsis. */
export function truncate(text, max) {
  if (text.length <= max) {
    return text;
  }
  let cut = text.slice(0, max - 1);
  // Never split a surrogate pair (an emoji) in two.
  if (/[\uD800-\uDBFF]$/.test(cut)) {
    cut = cut.slice(0, -1);
  }
  return `${cut.trimEnd()}…`;
}

/**
 * Google and Outlook put HTML in some descriptions (`<br>`, links): the core
 * renders plain text, so keep the text and the line breaks only.
 */
export function plainText(text) {
  if (!/<\/?[a-z][^>]*>/i.test(text)) {
    return text.trim();
  }
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * The id of one occurrence: the provider UID is digested (some are 150
 * characters long, all must fit in the core's 255), the occurrence date is
 * kept readable.
 */
export function eventSuffix(occurrenceId) {
  const at = occurrenceId.lastIndexOf('@');
  const recurrence = at > 0 ? occurrenceId.slice(at + 1) : '';
  const isOccurrence = /^\d{8}(T\d{6}Z)?$/.test(recurrence);
  const uid = isOccurrence ? occurrenceId.slice(0, at) : occurrenceId;
  return isOccurrence ? `${digest(uid, 24)}@${recurrence}` : digest(uid, 24);
}

/**
 * One occurrence in the shape `publishCalendarEvents` expects.
 * @param {object} occurrence from expandEvents()
 * @param {(suffix: string) => string} eventId builds the user-scoped id
 * @param {string} untitled name of an event without SUMMARY
 */
export function toGladysEvent(occurrence, eventId, untitled) {
  const name = truncate(occurrence.name.replace(/\s+/g, ' ').trim() || untitled, LIMITS.name);
  const event = {
    external_id: eventId(eventSuffix(occurrence.id)),
    name,
    ...(occurrence.fullDay
      ? { start: occurrence.startDate, end: occurrence.endDate, full_day: true }
      : {
          start: new Date(occurrence.startMs).toISOString(),
          end: new Date(occurrence.endMs).toISOString(),
        }),
  };
  const location = occurrence.location.replace(/\s+/g, ' ').trim();
  if (location) {
    event.location = truncate(location, LIMITS.location);
  }
  const description = plainText(occurrence.description);
  if (description) {
    event.description = truncate(description, LIMITS.description);
  }
  if (/^https?:\/\/\S+$/i.test(occurrence.url) && occurrence.url.length <= LIMITS.url) {
    event.url = occurrence.url;
  }
  return event;
}

/** The core's overlap rule: `start < to` and (`end > from` or `start >= from`). */
export function overlaps(occurrence, from, to) {
  return occurrence.startMs < to && (occurrence.endMs > from || occurrence.startMs >= from);
}

/**
 * The range of occurrences kept in Gladys, from the local date `today`:
 * HISTORY_DAYS back, `horizonEnd` (a `YYYY-MM-DD`) ahead.
 */
export function keptRange(today, horizonEnd) {
  return { from: localNoon(addDays(today, -HISTORY_DAYS)), to: localNoon(horizonEnd) };
}

/**
 * Keep the occurrences of the kept range, the upcoming ones first when the
 * calendar is too large for the core.
 * @returns {{ kept: object[], dropped: number }}
 */
export function selectOccurrences(occurrences, { from, to, now }) {
  const inRange = occurrences.filter((occurrence) => overlaps(occurrence, from, to));
  if (inRange.length <= MAX_EVENTS_PER_CALENDAR) {
    return { kept: inRange, dropped: 0 };
  }
  const upcoming = inRange.filter((occurrence) => occurrence.endMs > now);
  const past = inRange.filter((occurrence) => occurrence.endMs <= now).reverse();
  const kept = [...upcoming, ...past].slice(0, MAX_EVENTS_PER_CALENDAR);
  kept.sort((a, b) => a.startMs - b.startMs);
  return { kept, dropped: inRange.length - kept.length };
}

/**
 * Split a timeline into publication requests: disjoint windows covering
 * [SYNC_FROM, SYNC_TO), at most `max` events each. Inner boundaries sit at a
 * local NOON: a full-day event (midnight to midnight) never ends exactly on
 * one, so it lands in the same windows whether the core reads its dates in
 * this time zone or one up to 11 hours away.
 * @param {object[]} occurrences sorted by start, with `startMs`/`endMs`
 * @returns {{ requests: { from: number, to: number, occurrences: object[] }[], dropped: number }}
 */
export function splitWindows(occurrences, max = MAX_EVENTS_PER_REQUEST) {
  const requests = [];
  let dropped = 0;
  let from = SYNC_FROM;
  while (true) {
    // Sorted by start, and all overlapping [from, +inf): the events of
    // [from, to) are exactly the prefix starting before `to`.
    const live = occurrences.filter((occurrence) => overlaps(occurrence, from, SYNC_TO));
    if (live.length <= max) {
      requests.push({ from, to: SYNC_TO, occurrences: live });
      return { requests, dropped };
    }
    let day = localDate(new Date(Math.max(live[0].startMs, from)));
    let to = localNoon(day);
    while (to <= from) {
      day = addDays(day, 1);
      to = localNoon(day);
    }
    let count = countStartingBefore(live, to);
    if (count > max) {
      // More than `max` events within half a day: the core cannot take them
      // in one window, keep the first ones.
      dropped += count - max;
    } else {
      while (true) {
        const next = localNoon(addDays(day, 1));
        const nextCount = countStartingBefore(live, next);
        if (nextCount > max) {
          break;
        }
        day = addDays(day, 1);
        to = next;
        count = nextCount;
      }
    }
    requests.push({ from, to, occurrences: live.slice(0, Math.min(count, max)) });
    from = to;
  }
}

/** Number of leading entries of a start-sorted list starting before `time`. */
function countStartingBefore(sorted, time) {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (sorted[middle].startMs < time) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}
