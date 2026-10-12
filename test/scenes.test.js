// -----------------------------------------------------------------------------
// Scene triggers and actions: what changed in a shared calendar, the next
// matching event. Private calendars never reach the scenes.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { URLS, account, createWorld, feed } from './helpers/world.js';
import { diffSnapshots, snapshotOf } from '../src/changes.js';
import { findNext, fold } from '../src/scenes.js';

const SCHOOL = 'https://school.example/ical/timetable.ics?token=S3CR3T-T0K3N';

async function sharedSchool(options = {}) {
  const world = await createWorld({
    accounts: [account('alice', { name_1: 'École', url_1: URLS.school })],
    routes: { [SCHOOL]: feed('school-timetable.ics') },
    ...options,
  });
  world.fake.calendars[0].shared = true;
  await world.accountUpdated('alice');
  return world;
}

test('a cancelled class, a moved one and a new one fire "event changed"', async () => {
  const world = await sharedSchool();
  assert.deepEqual(world.fake.sceneEvents, [], 'the first download is a baseline');

  world.server.routes[SCHOOL] = feed('school-timetable.ics')
    // Tuesday's sport (13 October) is cancelled…
    .replace(
      'BEGIN:VEVENT\nUID:council',
      'BEGIN:VEVENT\nUID:sport-6b@school.example\nDTSTAMP:20261001T000000Z\nRECURRENCE-ID;TZID=Europe/Paris:20261013T100000\nDTSTART;TZID=Europe/Paris:20261013T100000\nDTEND;TZID=Europe/Paris:20261013T120000\nSTATUS:CANCELLED\nSUMMARY:EDUCATION PHYSIQUE & SPORTIVE\nEND:VEVENT\nBEGIN:VEVENT\nUID:council',
    )
    // …the museum trip moves to the afternoon…
    .replace(
      'DTSTART;TZID=Europe/Paris:20261014T130000',
      'DTSTART;TZID=Europe/Paris:20261014T140000',
    )
    .replace('DTEND;TZID=Europe/Paris:20261014T150000', 'DTEND;TZID=Europe/Paris:20261014T160000')
    // …and a meeting appears on Friday. One in a month is out of the watched days.
    .replace(
      'END:VCALENDAR',
      'BEGIN:VEVENT\nUID:parents@school.example\nDTSTAMP:20261001T000000Z\nDTSTART;TZID=Europe/Paris:20261016T180000\nDTEND;TZID=Europe/Paris:20261016T190000\nSUMMARY:Réunion parents-professeurs\nLOCATION:Préau\nEND:VEVENT\nBEGIN:VEVENT\nUID:later@school.example\nDTSTAMP:20261001T000000Z\nDTSTART;VALUE=DATE:20261120\nSUMMARY:Plus tard\nEND:VEVENT\nEND:VCALENDAR',
    );
  world.clock.now += 3_600_000;
  await world.sync();

  assert.deepEqual(world.fake.sceneEvents, [
    {
      key: 'event_changed',
      data: {
        calendar: 'École',
        change: 'cancelled',
        change_label: 'Annulé',
        name: 'EDUCATION PHYSIQUE & SPORTIVE',
        start: 'mardi 13 octobre, 10:00',
        days_until: 1,
        location: 'Gymnase',
      },
    },
    {
      key: 'event_changed',
      data: {
        calendar: 'École',
        change: 'rescheduled',
        change_label: 'Déplacé',
        name: 'Sortie au musée',
        start: 'mercredi 14 octobre, 14:00',
        days_until: 2,
        location: '',
      },
    },
    {
      key: 'event_changed',
      data: {
        calendar: 'École',
        change: 'added',
        change_label: 'Ajouté',
        name: 'Réunion parents-professeurs',
        start: 'vendredi 16 octobre, 18:00',
        days_until: 4,
        location: 'Préau',
      },
    },
  ]);
});

test('a private calendar never fires a scene', async () => {
  const world = await createWorld({
    accounts: [account('alice', { name_1: 'École', url_1: URLS.school })],
    routes: { [SCHOOL]: feed('school-timetable.ics') },
  });
  world.server.routes[SCHOOL] = feed('school-timetable.ics').replace(
    'Sortie au musée',
    'Sortie annulée',
  );
  world.clock.now += 3_600_000;
  await world.sync();
  assert.deepEqual(world.fake.sceneEvents, []);
});

test('a feed whose UIDs are all regenerated fires nothing', async () => {
  const world = await sharedSchool();
  // A provider that regenerates every UID (the national education feed does).
  world.server.routes[SCHOOL] = feed('school-timetable.ics').replaceAll(
    '@school.example',
    '@school-v2.example',
  );
  world.clock.now += 3_600_000;
  await world.sync();
  assert.deepEqual(world.fake.sceneEvents, []);
});

test('a renamed event is "updated"; the change filter values are the manifest options', () => {
  const base = { fullDay: false, location: '', startDate: undefined, endDate: undefined };
  const now = Date.parse('2026-10-12T06:00:00Z');
  const before = snapshotOf([
    { ...base, id: 'a', name: 'Maths', startMs: now + 3_600_000, endMs: now + 7_200_000 },
    { ...base, id: 'past', name: 'Past', startMs: now - 7_200_000, endMs: now - 3_600_000 },
  ]);
  const after = snapshotOf([
    { ...base, id: 'a', name: 'Maths (salle 4)', startMs: now + 3_600_000, endMs: now + 7_200_000 },
  ]);
  const changes = diffSnapshots(before, after, { now, until: now + 7 * 86_400_000 });
  assert.deepEqual(
    changes.map((entry) => [entry.change, entry.occurrence.name]),
    [['updated', 'Maths (salle 4)']],
    'a past event leaving the feed is not a cancellation',
  );
});

test('"Find the next calendar event" searches the shared calendars, accents and case ignored', async () => {
  const world = await sharedSchool();
  const found = await world.fake.sceneAction('next_event', { contains: 'education physique' });
  assert.deepEqual(found, {
    success: true,
    data: {
      outputs: {
        found: 1,
        name: 'EDUCATION PHYSIQUE & SPORTIVE',
        start: 'mardi 13 octobre, 10:00',
        days_until: 1,
        location: 'Gymnase',
        calendar: 'École',
      },
    },
  });
  const photo = await world.fake.sceneAction('next_event', {
    calendar: 'école',
    contains: 'PHOTO',
  });
  assert.equal(photo.data.outputs.start, 'mardi 13 octobre');
  assert.equal(photo.data.outputs.days_until, 1);

  const none = await world.fake.sceneAction('next_event', { contains: 'piscine' });
  assert.deepEqual(none.data.outputs, {
    found: 0,
    name: '',
    start: '',
    days_until: -1,
    location: '',
    calendar: '',
  });

  // Not shared any more: invisible to the scenes.
  world.fake.calendars[0].shared = false;
  await world.accountUpdated('alice');
  const hidden = await world.fake.sceneAction('next_event', {});
  assert.equal(hidden.data.outputs.found, 0);
});

test('a running full-day event is the next one, "today"', () => {
  const now = Date.parse('2026-10-13T10:00:00Z');
  const occurrence = {
    name: 'Collecte emballages',
    fullDay: true,
    startDate: '2026-10-13',
    endDate: '2026-10-14',
    startMs: Date.parse('2026-10-12T22:00:00Z'),
    endMs: Date.parse('2026-10-13T22:00:00Z'),
  };
  assert.equal(
    findNext([{ occurrence, calendar: 'Déchets' }], { contains: 'emballage' })?.calendar,
    'Déchets',
  );
  assert.ok(occurrence.endMs > now);
});

test('fold ignores case, accents and blanks', () => {
  assert.equal(fold('  Déchets   VERTS '), 'dechets verts');
  assert.equal(fold(undefined), '');
});

test('scene event data stays within the core bounds', async () => {
  const world = await sharedSchool();
  world.server.routes[SCHOOL] = feed('school-timetable.ics').replace(
    'SUMMARY:Sortie au musée',
    `SUMMARY:${'Très long titre '.repeat(100)}`,
  );
  world.clock.now += 3_600_000;
  await world.sync();
  const [event] = world.fake.sceneEvents;
  assert.ok(Object.keys(event.data).length <= 30);
  for (const value of Object.values(event.data)) {
    assert.ok(['string', 'number'].includes(typeof value));
    if (typeof value === 'string') {
      assert.ok(value.length <= 1000);
    }
  }
});

test('more than ten changes at once fire nothing', async () => {
  const world = await sharedSchool();
  const extra = Array.from(
    { length: 11 },
    (_, index) =>
      `BEGIN:VEVENT\nUID:extra-${index}@school.example\nDTSTAMP:20261001T000000Z\nDTSTART;TZID=Europe/Paris:20261015T${String(8 + index).padStart(2, '0')}0000\nDURATION:PT30M\nSUMMARY:Extra ${index}\nEND:VEVENT\n`,
  ).join('');
  world.server.routes[SCHOOL] = feed('school-timetable.ics').replace(
    'END:VCALENDAR',
    `${extra}END:VCALENDAR`,
  );
  world.clock.now += 3_600_000;
  await world.sync();
  assert.deepEqual(world.fake.sceneEvents, []);
});
