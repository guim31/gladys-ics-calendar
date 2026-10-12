// -----------------------------------------------------------------------------
// iCalendar parsing and recurrence expansion, with node-ical (Apache-2.0):
// VEVENT, full-day events, VTIMEZONE / TZID (Windows names of Exchange and
// Outlook included), RRULE / RDATE / EXDATE / RECURRENCE-ID, SEQUENCE.
//
// Gladys stores occurrences only (its core has no RRULE engine): every
// recurring event is expanded here, over a bounded range. Cancelled events and
// cancelled occurrences (STATUS:CANCELLED) are dropped: in Gladys, they must
// disappear, not wait to trigger a scene.
// -----------------------------------------------------------------------------

import ical from 'node-ical';
import { ERROR_CODES, FeedError } from './fetcher.js';
import { addDays, localDate, localMidnight } from './time.js';

/**
 * node-ical reports what it repairs (an older SEQUENCE, an unknown TZID…) on
 * console.warn, once per event and per download: count it instead of letting
 * a large feed flood the integration logs every 30 minutes.
 */
function quietly(fn) {
  const original = console.warn;
  let warnings = 0;
  console.warn = () => {
    warnings += 1;
  };
  try {
    return { result: fn(), warnings };
  } finally {
    console.warn = original;
  }
}

/** A property value as text: node-ical gives `{ params, val }` when the line has parameters. */
export function textOf(value) {
  if (Array.isArray(value)) {
    return textOf(value[0]);
  }
  if (value && typeof value === 'object' && 'val' in value) {
    return textOf(value.val);
  }
  return typeof value === 'string' ? value : '';
}

const COLOR = /^#[0-9a-f]{6}$/i;

/**
 * Parse a feed.
 * @param {string} text the iCalendar document
 * @returns {{ name: string, description: string, color?: string, events: object[], warnings: number }}
 */
export function parseCalendar(text) {
  let parsed;
  let warnings;
  try {
    ({ result: parsed, warnings } = quietly(() => ical.sync.parseICS(text)));
  } catch {
    ({ parsed, warnings } = parseEventByEvent(text));
  }
  const calendar = parsed.vcalendar ?? {};
  const events = Object.values(parsed).filter(
    (component) => component?.type === 'VEVENT' && component.start instanceof Date,
  );
  const color = textOf(calendar['APPLE-CALENDAR-COLOR']).slice(0, 7);
  return {
    name: textOf(calendar['WR-CALNAME']).trim(),
    description: textOf(calendar['WR-CALDESC']).trim(),
    ...(COLOR.test(color) ? { color: color.toLowerCase() } : {}),
    events,
    warnings,
    skipped: parsed.skipped ?? 0,
  };
}

/**
 * node-ical gives up on the whole file for one broken event (an RRULE it
 * cannot read): parse again UID by UID — a recurring event and its
 * overrides together —, keeping what can be read. Only a file where nothing
 * can be read is an error.
 */
function parseEventByEvent(text) {
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const start = unfolded.search(/^BEGIN:VEVENT/m);
  if (start < 0) {
    throw new FeedError(ERROR_CODES.PARSE, 'no event');
  }
  const header = unfolded.slice(0, start);
  const blocks = unfolded.match(/^BEGIN:VEVENT[\s\S]*?^END:VEVENT\s*$/gm) ?? [];
  const byUid = new Map();
  for (const block of blocks) {
    const uid = block.match(/^UID[^:]*:(.*)$/m)?.[1]?.trim() ?? block;
    byUid.set(uid, `${byUid.get(uid) ?? ''}${block}\n`);
  }
  const parsed = { skipped: 0 };
  let warnings = 0;
  let readable = 0;
  for (const group of byUid.values()) {
    try {
      const result = quietly(() => ical.sync.parseICS(`${header}${group}END:VCALENDAR\n`));
      warnings += result.warnings;
      readable += 1;
      for (const [key, component] of Object.entries(result.result)) {
        if (key === 'vcalendar') {
          parsed.vcalendar ??= component;
        } else if (component?.type === 'VEVENT') {
          parsed[`${readable}:${key}`] = component;
        }
      }
    } catch {
      parsed.skipped += 1;
    }
  }
  if (readable === 0) {
    throw new FeedError(ERROR_CODES.PARSE, 'unreadable');
  }
  return { parsed, warnings };
}

const VALID_ZONES = new Map();
function isTimeZone(zone) {
  if (typeof zone !== 'string' || zone === '') {
    return false;
  }
  if (!VALID_ZONES.has(zone)) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: zone });
      VALID_ZONES.set(zone, true);
    } catch {
      VALID_ZONES.set(zone, false);
    }
  }
  return VALID_ZONES.get(zone);
}

/**
 * The calendar date of a full-day value, as the feed wrote it. node-ical
 * builds a date-only value at the local midnight of this process, unless the
 * line carried a TZID (then at that zone's midnight).
 */
export function calendarDate(date) {
  if (isTimeZone(date.tz)) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: date.tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
    return parts.slice(0, 10);
  }
  return localDate(date);
}

/** `20261019T063000Z` or `20261019`: the original date of an occurrence. */
function occurrenceKey(date, fullDay) {
  if (fullDay) {
    return calendarDate(date).replaceAll('-', '');
  }
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/[-:]/g, '');
}

function isCancelled(component) {
  return textOf(component?.status).toUpperCase() === 'CANCELLED';
}

/**
 * Expand the events of a parsed feed into occurrences overlapping
 * [from, to]. Each occurrence is identified by its UID and, for a recurring
 * event, its ORIGINAL date (RECURRENCE-ID): moving one occurrence keeps its
 * identity.
 * @param {object[]} events `parseCalendar(...).events`
 * @param {{ from: Date, to: Date }} range
 * @returns {{ occurrences: object[], skipped: number, warnings: number }}
 */
export function expandEvents(events, { from, to }) {
  const occurrences = [];
  let skipped = 0;
  const { warnings } = quietly(() => {
    for (const event of events) {
      let instances;
      try {
        instances = ical.expandRecurringEvent(event, { from, to, expandOngoing: true });
      } catch {
        // A broken RRULE must not take the whole calendar down.
        skipped += 1;
        continue;
      }
      for (const instance of instances) {
        const source = instance.event ?? event;
        if (isCancelled(source) || isCancelled(event)) {
          continue;
        }
        const occurrence = toOccurrence(event, source, instance);
        if (occurrence) {
          occurrences.push(occurrence);
        }
      }
    }
  });
  occurrences.sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
  return { occurrences: dedupe(occurrences), skipped, warnings };
}

function toOccurrence(event, source, instance) {
  if (!(instance.start instanceof Date) || Number.isNaN(instance.start.getTime())) {
    return null;
  }
  const fullDay = instance.isFullDay === true;
  const uid = textOf(event.uid) || `${textOf(event.summary)}|${event.start.toISOString()}`;
  let key = '';
  if (instance.isRecurring) {
    const original = source.recurrenceid instanceof Date ? source.recurrenceid : instance.start;
    key = occurrenceKey(original, fullDay);
  }
  const common = {
    id: key ? `${uid}@${key}` : uid,
    name: textOf(source.summary ?? event.summary).trim(),
    location: textOf(source.location ?? event.location).trim(),
    description: textOf(source.description ?? event.description).trim(),
    url: textOf(source.url ?? event.url).trim(),
    fullDay,
  };
  const end =
    instance.end instanceof Date && !Number.isNaN(instance.end.getTime()) ? instance.end : null;
  if (fullDay) {
    const startDate = calendarDate(instance.start);
    let endDate = end ? calendarDate(end) : '';
    // RFC 5545: a DTEND on (or before) the start date covers the start day.
    if (!endDate || endDate <= startDate) {
      endDate = addDays(startDate, 1);
    }
    return {
      ...common,
      startDate,
      endDate,
      startMs: localMidnight(startDate),
      endMs: localMidnight(endDate),
    };
  }
  const startMs = instance.start.getTime();
  // A DTEND before DTSTART is a broken feed: keep the event, without duration.
  const endMs = end && end.getTime() >= startMs ? end.getTime() : startMs;
  return { ...common, startMs, endMs };
}

/** Two VEVENTs can expand to one occurrence id (a duplicated UID): keep the first. */
function dedupe(occurrences) {
  const seen = new Set();
  return occurrences.filter((occurrence) => {
    if (seen.has(occurrence.id)) {
      return false;
    }
    seen.add(occurrence.id);
    return true;
  });
}
