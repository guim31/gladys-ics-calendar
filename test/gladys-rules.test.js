// -----------------------------------------------------------------------------
// Conformity with the calendar contract of the Gladys core
// (docs/specs/external-integrations/capabilities/calendar-type.md, Gladys
// 5.2.0), on every fixture feed (real Google, Apple, Outlook / Exchange,
// national education feeds and the test files of node-ical, ical and Home
// Assistant), synchronized end to end.
//
// This integration publishes no device: the device table of
// test/fixtures/gladys-feature-table.json does not apply. What the core
// checks here instead: user-scoped ids, text bounds, full-day dates, the
// window rules (every event overlaps its window, one window per request,
// at most 500 events), the 50 calendars per user and 10 000 events per
// calendar caps. A breach is a 400 that drops a whole request.
// Do not loosen this test to make it pass: fix the integration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { account, createWorld, feed } from './helpers/world.js';
import { localMidnight } from '../src/time.js';
import { SLOT_COUNT } from '../src/config.js';

const FEEDS = readdirSync(new URL('./fixtures/feeds/', import.meta.url)).filter((name) =>
  name.endsWith('.ics'),
);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const URL_RULE = /^https?:\/\/\S+$/i;

function isCalendarDate(value) {
  if (!DATE.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day
  );
}

/** How the core stores an event: full-day dates at the midnights of its time zone. */
function instants(event, offsetMs = 0) {
  if (event.full_day) {
    const start = localMidnight(event.start) + offsetMs;
    const end =
      event.end && event.end > event.start
        ? localMidnight(event.end) + offsetMs
        : start + 86_400_000;
    return { start, end };
  }
  const start = Date.parse(event.start);
  return { start, end: event.end ? Date.parse(event.end) : start };
}

const overlaps = ({ start, end }, from, to) => start < to && (end > from || start >= from);

async function syncEverything() {
  const accounts = [];
  const routes = {};
  FEEDS.forEach((name, index) => {
    const user = `user${Math.floor(index / SLOT_COUNT)}`;
    let entry = accounts.find((candidate) => candidate.user.selector === user);
    if (!entry) {
      entry = account(user, {});
      accounts.push(entry);
    }
    const slot = (index % SLOT_COUNT) + 1;
    const url = `https://feeds.example/${name}?token=secret-${index}`;
    entry.config[`url_${slot}`] = url;
    routes[url] = feed(name);
  });
  const world = await createWorld({ accounts, routes });
  // Share everything and move a day on: a second, full publication, with
  // the change triggers armed.
  for (const calendar of world.fake.calendars) {
    calendar.shared = true;
  }
  for (const entry of accounts) {
    await world.accountUpdated(entry.user.selector);
  }
  world.clock.now += 86_400_000;
  await world.sync();
  return world;
}

test('every fixture feed becomes a calendar', async () => {
  const world = await syncEverything();
  assert.equal(world.fake.calendars.length, FEEDS.length);
  assert.ok(world.syncer.failing().length === 0, 'no feed failed');
});

test('calendars: user-scoped ids, bounded names, colors, 50 per user at most', async () => {
  const world = await syncEverything();
  const perUser = new Map();
  for (const batch of world.fake.publishedCalendars) {
    assert.ok(batch.calendars.length <= 50);
    for (const calendar of batch.calendars) {
      assert.ok(calendar.external_id.startsWith(`ext:test-integration:${batch.user}:`));
      assert.ok(calendar.external_id.length <= 255);
      assert.ok(calendar.name.length >= 1 && calendar.name.length <= 100, calendar.name);
      assert.ok(calendar.description === undefined || calendar.description.length <= 500);
      assert.match(calendar.color, /^#[0-9a-f]{6}$/);
      perUser.set(batch.user, new Set([...(perUser.get(batch.user) ?? []), calendar.external_id]));
    }
  }
  for (const ids of perUser.values()) {
    assert.ok(ids.size <= 50);
  }
});

test('events: ids, texts, dates and windows the core accepts', async () => {
  const world = await syncEverything();
  const calendars = new Map(
    world.fake.calendars.map((calendar) => [calendar.external_id, calendar]),
  );
  assert.ok(world.fake.publishedCalendarEvents.length >= FEEDS.length * 2);
  for (const body of world.fake.publishedCalendarEvents) {
    const calendar = calendars.get(body.calendar_external_id);
    assert.ok(calendar, 'events of a published calendar');
    assert.ok(body.events.length <= 500, 'at most 500 events per request');
    assert.ok(body.window, 'every publication replaces a window');
    const from = Date.parse(body.window.from);
    const to = Date.parse(body.window.to);
    assert.ok(from < to);
    const ids = new Set();
    for (const event of body.events) {
      const where = `${calendar.name} / ${event.name}`;
      assert.ok(event.external_id.startsWith(`ext:test-integration:${calendar.user}:`), where);
      assert.ok(event.external_id.length <= 255, where);
      assert.ok(!ids.has(event.external_id), `${where}: duplicate in the batch`);
      ids.add(event.external_id);
      assert.ok(event.name.length >= 1 && event.name.length <= 200, where);
      assert.ok(
        event.location === undefined || (event.location.length > 0 && event.location.length <= 500),
        where,
      );
      assert.ok(
        event.description === undefined ||
          (event.description.length > 0 && event.description.length <= 1000),
        where,
      );
      assert.ok(
        event.url === undefined || (URL_RULE.test(event.url) && event.url.length <= 500),
        where,
      );
      if (event.full_day) {
        assert.equal(event.full_day, true);
        assert.ok(isCalendarDate(event.start) && isCalendarDate(event.end), where);
        assert.ok(event.end > event.start, `${where}: a full-day event covers at least its day`);
      } else {
        assert.equal(event.full_day, undefined);
        assert.ok(
          !Number.isNaN(Date.parse(event.start)) && !Number.isNaN(Date.parse(event.end)),
          where,
        );
        assert.ok(Date.parse(event.end) >= Date.parse(event.start), where);
      }
      // Overlaps its window, even if the core reads the dates in a zone
      // up to 11 hours away from the container's.
      for (const offset of [0, -11 * 3_600_000, 11 * 3_600_000]) {
        assert.ok(overlaps(instants(event, offset), from, to), `${where}: outside its window`);
      }
    }
  }
});

test('one publication covers the whole timeline with disjoint windows', async () => {
  const world = await syncEverything();
  const byCalendar = new Map();
  for (const body of world.fake.publishedCalendarEvents) {
    const list = byCalendar.get(body.calendar_external_id) ?? [];
    list.push(body.window);
    byCalendar.set(body.calendar_external_id, list);
  }
  for (const windows of byCalendar.values()) {
    // Publications follow each other: each starts at 1970 and ends at 2200.
    let expectedFrom = '1970-01-01T00:00:00.000Z';
    for (const window of windows) {
      assert.equal(window.from, expectedFrom);
      expectedFrom =
        window.to === '2200-01-01T00:00:00.000Z' ? '1970-01-01T00:00:00.000Z' : window.to;
    }
    assert.equal(expectedFrom, '1970-01-01T00:00:00.000Z', 'the last window ends in 2200');
  }
});

test('no calendar exceeds 10 000 events, no event is left behind by a prune', async () => {
  const world = await syncEverything();
  const counts = new Map();
  for (const event of world.fake.calendarEvents) {
    counts.set(event.calendar_external_id, (counts.get(event.calendar_external_id) ?? 0) + 1);
  }
  for (const count of counts.values()) {
    assert.ok(count <= 10_000);
  }
  // What the last publication of each calendar sent is exactly what is stored.
  const last = new Map();
  for (const body of world.fake.publishedCalendarEvents) {
    if (body.window.from === '1970-01-01T00:00:00.000Z') {
      last.set(body.calendar_external_id, new Set());
    }
    for (const event of body.events) {
      last.get(body.calendar_external_id).add(event.external_id);
    }
  }
  for (const [calendar, sent] of last) {
    const stored = new Set(world.eventsOf(calendar).map((event) => event.external_id));
    assert.deepEqual([...stored].sort(), [...sent].sort());
  }
});

test('scene events: declared keys, flat data within the core bounds', async () => {
  const world = await syncEverything();
  for (const event of world.fake.sceneEvents) {
    assert.ok(['event_changed', 'calendar_unreachable'].includes(event.key));
    assert.ok(Object.keys(event.data).length <= 30);
    for (const value of Object.values(event.data)) {
      assert.ok(
        typeof value === 'number'
          ? Number.isFinite(value)
          : typeof value === 'string' && value.length <= 1000,
      );
    }
  }
});
