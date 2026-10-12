// -----------------------------------------------------------------------------
// iCalendar parsing and expansion on real feeds (Google, Apple, the French
// national education, Outlook / Exchange) and on the test files of node-ical,
// ical (allenporter, the library of Home Assistant) and Home Assistant.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { feed } from './helpers/world.js';
import { calendarDate, expandEvents, parseCalendar, textOf } from '../src/ics.js';
import { FeedError } from '../src/fetcher.js';

const FEEDS = readdirSync(new URL('./fixtures/feeds/', import.meta.url)).filter((name) =>
  name.endsWith('.ics'),
);
const ALL_TIME = { from: new Date('2000-01-01T00:00:00Z'), to: new Date('2030-01-01T00:00:00Z') };

function expand(name, range = ALL_TIME) {
  return expandEvents(parseCalendar(feed(name)).events, range).occurrences;
}

function withTimeZone(zone, fn) {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    return fn();
  } finally {
    process.env.TZ = previous;
  }
}

test('every fixture parses and expands to well-formed occurrences', () => {
  assert.ok(FEEDS.length >= 15);
  for (const name of FEEDS) {
    const parsed = parseCalendar(feed(name));
    const { occurrences, skipped } = expandEvents(parsed.events, ALL_TIME);
    assert.ok(occurrences.length > 0, `${name}: no occurrence`);
    assert.equal(skipped, 0, `${name}: unreadable events`);
    for (const occurrence of occurrences) {
      assert.ok(
        occurrence.endMs >= occurrence.startMs,
        `${name}: ${occurrence.id} ends before it starts`,
      );
      if (occurrence.fullDay) {
        assert.match(occurrence.startDate, /^\d{4}-\d{2}-\d{2}$/);
        assert.ok(
          occurrence.endDate > occurrence.startDate,
          `${name}: ${occurrence.id} has no day`,
        );
      }
    }
    assert.equal(
      new Set(occurrences.map((occurrence) => occurrence.id)).size,
      occurrences.length,
      name,
    );
  }
});

test('calendar metadata: X-WR-CALNAME, X-WR-CALDESC, X-APPLE-CALENDAR-COLOR', () => {
  const zone = parseCalendar(feed('education-zone-c.ics'));
  assert.equal(zone.name, 'Calendrier scolaire - Zone C');
  assert.equal(zone.description, "Congés scolaires de la zone C depuis l'année 2017-2018");
  const colored = parseCalendar(
    'BEGIN:VCALENDAR\r\nX-APPLE-CALENDAR-COLOR:#FF2968FF\r\nEND:VCALENDAR\r\n',
  );
  assert.equal(colored.color, '#ff2968');
  assert.equal(
    parseCalendar('BEGIN:VCALENDAR\r\nX-APPLE-CALENDAR-COLOR:red\r\nEND:VCALENDAR\r\n').color,
    undefined,
  );
});

test('Apple: recurring holidays without DTEND last one day', () => {
  const occurrences = expand('apple-fr-holidays.ics', {
    from: new Date('2026-01-01T00:00:00Z'),
    to: new Date('2026-12-31T00:00:00Z'),
  });
  const newYear = occurrences.find(
    (occurrence) => occurrence.name === "Jour de l'An" && occurrence.startDate === '2026-01-01',
  );
  assert.equal(newYear.endDate, '2026-01-02');
  assert.match(newYear.id, /@20260101$/);
});

test('the national education feed: same-day DTEND covers the day', () => {
  const summer = expand('education-zone-c.ics').find(
    (occurrence) =>
      occurrence.name === "Début des Vacances d'Été" && occurrence.startDate === '2028-07-04',
  );
  assert.equal(summer.endDate, '2028-07-05');
});

test('full-day dates do not depend on the time zone of the container', () => {
  const run = () =>
    expand('google-fr-holidays.ics')
      .concat(expand('node-ical-whole-day-moved-dst.ics'))
      .concat(expand('node-ical-exchange-whole-day-moved.ics'))
      // Away from the bounds of the range, which are instants.
      .filter(
        (occurrence) =>
          occurrence.fullDay &&
          occurrence.startDate > '2000-01-02' &&
          occurrence.startDate < '2029-12-30',
      )
      .map((occurrence) => `${occurrence.id} ${occurrence.startDate} ${occurrence.endDate}`);
  const paris = run();
  for (const zone of ['UTC', 'America/Los_Angeles', 'Pacific/Auckland', 'Asia/Kolkata']) {
    assert.deepEqual(withTimeZone(zone, run), paris, zone);
  }
  assert.ok(
    paris.includes(paris.find((line) => line.endsWith('2024-10-30 2024-10-31'))),
    'moved whole day',
  );
});

test('timed events keep their instant whatever the container time zone', () => {
  const run = () =>
    expand('school-timetable.ics')
      .filter((occurrence) => !occurrence.fullDay)
      .map((occurrence) => `${occurrence.id} ${occurrence.startMs} ${occurrence.endMs}`);
  assert.deepEqual(withTimeZone('America/New_York', run), run());
});

test('RRULE, EXDATE, RECURRENCE-ID and STATUS:CANCELLED, across the change to winter time', () => {
  const occurrences = expand('school-timetable.ics', {
    from: new Date('2026-10-01T00:00:00Z'),
    to: new Date('2026-11-15T00:00:00Z'),
  });
  const maths = occurrences.filter((occurrence) => occurrence.id.startsWith('maths-6b'));
  assert.deepEqual(
    maths.map((occurrence) => [
      occurrence.id.split('@').pop(),
      new Date(occurrence.startMs).toISOString(),
      occurrence.name,
    ]),
    [
      ['20261005T063000Z', '2026-10-05T06:30:00.000Z', 'MATHEMATIQUES - M. Martin'],
      // 12 October cancelled, 19 and 26 excluded (EXDATE), 2 November moved to the 3rd.
      ['20261102T073000Z', '2026-11-03T13:00:00.000Z', 'MATHEMATIQUES - M. Martin (rattrapage)'],
      ['20261109T073000Z', '2026-11-09T07:30:00.000Z', 'MATHEMATIQUES - M. Martin'],
    ],
  );
  const sport = occurrences.find((occurrence) => occurrence.id.endsWith('20261013T080000Z'));
  assert.equal(sport.endMs - sport.startMs, 2 * 3_600_000, 'DURATION instead of DTEND');
  assert.ok(!occurrences.some((occurrence) => occurrence.name === 'Conseil de classe'));
  const photo = occurrences.find((occurrence) => occurrence.name === 'Photo de classe');
  assert.deepEqual([photo.startDate, photo.endDate], ['2026-10-13', '2026-10-14']);
});

test('Outlook and Exchange time zones: Windows names, custom and invalid TZID', () => {
  // "Customized Time Zone" with a W. Europe VTIMEZONE: 14:00 in Paris (Home Assistant fixture).
  const [ha] = expand('ha-office365-invalid-tzid.ics');
  assert.equal(new Date(ha.startMs).toISOString(), '2024-04-26T12:00:00.000Z');
  // New Zealand Standard Time.
  const nz = expand('ical-office365-nz-timezone.ics');
  assert.ok(nz.length > 10);
  for (const name of [
    'node-ical-ms-timezones.ics',
    'node-ical-office-2012-owa.ics',
    'ical-office365-extended-timezone.ics',
  ]) {
    assert.ok(
      expand(name).every((occurrence) => Number.isFinite(occurrence.startMs)),
      name,
    );
  }
});

test('an override with DTEND before DTSTART keeps the event, without duration', () => {
  const moved = expand('node-ical-exdate-recurrence-id.ics').find(
    (occurrence) => occurrence.name === 'More Treasure Hunting',
  );
  assert.equal(moved.endMs, moved.startMs);
});

test('property values with parameters are read as text', () => {
  assert.equal(textOf({ params: { LANGUAGE: 'fr' }, val: 'Épiphanie' }), 'Épiphanie');
  assert.equal(textOf(['a', 'b']), 'a');
  assert.equal(textOf(undefined), '');
  assert.equal(
    calendarDate(Object.assign(new Date('2026-08-14T22:00:00Z'), { tz: 'Europe/Paris' })),
    '2026-08-15',
  );
});

test('a broken RRULE only skips its event, garbage is a parse error', () => {
  const broken = parseCalendar(
    [
      'BEGIN:VCALENDAR',
      'X-WR-CALNAME:Partly broken',
      'BEGIN:VEVENT',
      'UID:ok',
      'DTSTART:20261012T080000Z',
      'SUMMARY:Fine',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:broken',
      'DTSTART:20261012T080000Z',
      'RRULE:FREQ=SOMETIMES;COUNT=x',
      'SUMMARY:Broken',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n'),
  );
  assert.equal(broken.name, 'Partly broken');
  assert.equal(broken.skipped, 1);
  const { occurrences } = expandEvents(broken.events, ALL_TIME);
  assert.deepEqual(
    occurrences.map((occurrence) => occurrence.name),
    ['Fine'],
  );

  assert.deepEqual(parseCalendar('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n').events, []);
  assert.throws(
    () =>
      parseCalendar(
        'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:x\r\nDTSTART:20261012T080000Z\r\nRRULE:FREQ=NEVER;COUNT=x\r\nEND:VEVENT\r\nEND:VCALENDAR',
      ),
    (err) => err instanceof FeedError && err.code === 'parse',
  );
});
