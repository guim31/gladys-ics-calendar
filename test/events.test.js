import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/world.js';
import {
  MAX_EVENTS_PER_CALENDAR,
  SYNC_FROM,
  SYNC_TO,
  eventSuffix,
  overlaps,
  plainText,
  selectOccurrences,
  splitWindows,
  toGladysEvent,
  truncate,
} from '../src/events.js';
import { localMidnight } from '../src/time.js';

const id = (suffix) => `ext:test-integration:alice:f0123456789abcdef:${suffix}`;

function timed(index, startMs, durationMs = 3_600_000) {
  return {
    id: `e${index}`,
    name: `Event ${index}`,
    location: '',
    description: '',
    url: '',
    fullDay: false,
    startMs,
    endMs: startMs + durationMs,
  };
}

function fullDay(index, startDate, endDate) {
  return {
    id: `d${index}`,
    name: `Day ${index}`,
    location: '',
    description: '',
    url: '',
    fullDay: true,
    startDate,
    endDate,
    startMs: localMidnight(startDate),
    endMs: localMidnight(endDate),
  };
}

test('an occurrence in the shape of the host API', () => {
  const event = toGladysEvent(
    {
      id: 'abc@google.com@20261019T063000Z',
      name: '  Swimming\n pool ',
      location: 'Pool',
      description: 'Bring a <b>towel</b>',
      url: 'https://example.com/e',
      fullDay: false,
      startMs: Date.parse('2026-10-19T06:30:00Z'),
      endMs: Date.parse('2026-10-19T07:30:00Z'),
    },
    id,
    '(no title)',
  );
  assert.deepEqual(event, {
    external_id: id(`${eventSuffix('abc@google.com@20261019T063000Z')}`),
    name: 'Swimming pool',
    start: '2026-10-19T06:30:00.000Z',
    end: '2026-10-19T07:30:00.000Z',
    location: 'Pool',
    description: 'Bring a towel',
    url: 'https://example.com/e',
  });
  assert.match(event.external_id, /:[0-9a-f]{24}@20261019T063000Z$/);
  const day = toGladysEvent(
    { ...fullDay(1, '2026-10-24', '2026-10-27'), name: '', url: 'javascript:x' },
    id,
    '(no title)',
  );
  assert.deepEqual(day, {
    external_id: day.external_id,
    name: '(no title)',
    start: '2026-10-24',
    end: '2026-10-27',
    full_day: true,
  });
});

test('texts are cut to the core bounds without breaking a character', () => {
  const event = toGladysEvent(
    {
      ...timed(1, 0),
      name: '🎉'.repeat(150),
      location: 'x'.repeat(600),
      description: 'y'.repeat(1200),
      url: `https://e.com/${'z'.repeat(600)}`,
    },
    id,
    '-',
  );
  assert.ok(event.name.length <= 200);
  assert.ok(!/[\uD800-\uDBFF]…$/.test(event.name));
  assert.equal(event.location.length, 500);
  assert.equal(event.description.length, 1000);
  assert.equal(event.url, undefined, 'an address over 500 characters is dropped');
  assert.equal(truncate('short', 10), 'short');
});

test('ids: the UID is digested, the occurrence date kept', () => {
  assert.equal(eventSuffix('x@example.com'), eventSuffix('x@example.com'));
  assert.notEqual(eventSuffix('x@example.com@20261019'), eventSuffix('x@example.com@20261020'));
  assert.match(eventSuffix('x@example.com@20261019'), /^[0-9a-f]{24}@20261019$/);
  assert.match(eventSuffix('x@example.com'), /^[0-9a-f]{24}$/);
});

test('HTML descriptions become text', () => {
  assert.equal(
    plainText('<p>One &amp; two</p><p>Three<br/>Four&nbsp;!</p>'),
    'One & two\nThree\nFour !',
  );
  assert.equal(plainText('a < b and c > d'), 'a < b and c > d');
});

test('windows are disjoint, contiguous, bounded and hold every overlapping event', () => {
  const base = Date.parse('2026-10-01T06:00:00Z');
  const occurrences = [];
  for (let index = 0; index < 1730; index += 1) {
    occurrences.push(
      timed(index, base + index * 5 * 3_600_000, index % 50 === 0 ? 3 * 86_400_000 : 3_600_000),
    );
  }
  occurrences.push(fullDay(9000, '2026-10-20', '2026-10-25'));
  occurrences.sort((a, b) => a.startMs - b.startMs);
  const { requests, dropped } = splitWindows(occurrences);
  assert.equal(dropped, 0);
  assert.equal(requests[0].from, SYNC_FROM);
  assert.equal(requests.at(-1).to, SYNC_TO);
  for (const [index, request] of requests.entries()) {
    assert.ok(request.occurrences.length <= 500);
    if (index > 0) {
      assert.equal(request.from, requests[index - 1].to);
    }
    // Exactly the events overlapping the window: nothing pruned by mistake.
    const expected = occurrences.filter((occurrence) =>
      overlaps(occurrence, request.from, request.to),
    );
    assert.deepEqual(
      request.occurrences.map((o) => o.id),
      expected.map((o) => o.id),
    );
    if (request.to !== SYNC_TO) {
      assert.equal(new Date(request.to).getHours(), 12, 'inner boundaries at local noon');
    }
  }
  assert.ok(requests.length >= 4);
});

test('a full-day event never ends on a window boundary', () => {
  const days = [];
  for (let index = 0; index < 700; index += 1) {
    const date = new Date(2026, 0, 1 + index);
    const next = new Date(2026, 0, 2 + index);
    const iso = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    days.push(fullDay(index, iso(date), iso(next)));
  }
  const { requests } = splitWindows(days);
  for (const request of requests) {
    for (const day of request.occurrences) {
      // Shifted by up to 11 hours (a core reading the dates in another
      // zone), the event still overlaps the same windows.
      for (const shift of [-11 * 3_600_000, 11 * 3_600_000]) {
        assert.ok(
          overlaps(
            { startMs: day.startMs + shift, endMs: day.endMs + shift },
            request.from,
            request.to,
          ),
        );
      }
    }
  }
});

test('an empty timeline is one empty window: it prunes everything', () => {
  assert.deepEqual(splitWindows([]).requests, [{ from: SYNC_FROM, to: SYNC_TO, occurrences: [] }]);
});

test('over 500 events in half a day, the surplus is reported', () => {
  const start = Date.parse('2026-10-12T13:00:00Z');
  const crowd = Array.from({ length: 520 }, (_, index) =>
    timed(index, start + index * 1000, 60_000),
  );
  const { requests, dropped } = splitWindows(crowd);
  assert.equal(dropped, 20);
  assert.ok(requests.every((request) => request.occurrences.length <= 500));
});

test('a calendar over the core cap keeps the upcoming events first', () => {
  const now = Date.parse('2026-10-12T06:00:00Z');
  const occurrences = Array.from({ length: MAX_EVENTS_PER_CALENDAR + 100 }, (_, index) =>
    timed(index, now - 50 * 3_600_000 + index * 3_600_000, 60_000),
  );
  const { kept, dropped } = selectOccurrences(occurrences, { from: 0, to: Infinity, now });
  assert.equal(kept.length, MAX_EVENTS_PER_CALENDAR);
  assert.equal(dropped, 100);
  assert.ok(kept.filter((occurrence) => occurrence.endMs <= now).length < 50);
  assert.ok(
    kept.every((occurrence, index) => index === 0 || kept[index - 1].startMs <= occurrence.startMs),
  );
});
