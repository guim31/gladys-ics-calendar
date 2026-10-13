// -----------------------------------------------------------------------------
// What the logs show at the default level: the life cycle and the problems,
// never a line per synchronization. Plus the periodic synchronization, which
// runs on its own timer (a calendar integration has no device to poll: nothing
// here depends on the core's onPoll).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../src/app.js';
import {
  NOW,
  URLS,
  account,
  createMemoryStore,
  createServer,
  createWorld,
  feed,
} from './helpers/world.js';

const SCHOOL = 'https://school.example/ical/timetable.ics?token=S3CR3T-T0K3N';

/** Capture what the SDK logger writes, at `level`, until `stop()`. */
function captureLogs(t, level = 'info') {
  const lines = [];
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  for (const stream of [process.stdout, process.stderr]) {
    t.mock.method(stream, 'write', (chunk) => {
      lines.push(...String(chunk).split('\n').filter(Boolean));
      return true;
    });
  }
  return {
    lines,
    stop() {
      t.mock.restoreAll();
      if (previous === undefined) {
        delete process.env.LOG_LEVEL;
      } else {
        process.env.LOG_LEVEL = previous;
      }
    },
  };
}

test('normal synchronizations write nothing at the info level', async (t) => {
  const world = await createWorld({
    accounts: [
      account('alice', { url_1: URLS.google, name_2: 'École', url_2: URLS.school }),
      account('bob', { url_1: URLS.holidays }),
    ],
    routes: {
      [URLS.google]: feed('google-private.ics'),
      [SCHOOL]: feed('school-timetable.ics'),
      [URLS.holidays]: feed('google-fr-holidays.ics'),
    },
  });
  // Shared: its changes go to the scenes.
  world.calendarNamed('Famille').shared = true;
  await world.accountUpdated('alice');

  const logs = captureLogs(t);
  try {
    // Unchanged feeds, a changed one (sent to the scenes), then a new day
    // (full downloads, everything republished).
    world.clock.now += 30 * 60_000;
    await world.sync();
    world.server.routes[URLS.google] = feed('google-private.ics').replace(
      'SUMMARY:Dentiste',
      'SUMMARY:Dentiste (Camille)',
    );
    world.clock.now += 30 * 60_000;
    await world.sync();
    world.clock.now += 24 * 3_600_000;
    await world.sync();
    world.clock.now += 30 * 60_000;
    await world.sync();
  } finally {
    logs.stop();
  }
  assert.ok(world.fake.sceneEvents.length > 0, 'the change reached the scenes');
  assert.deepEqual(logs.lines, []);
});

test('a feed failing again and again writes one line, and one when it is back', async (t) => {
  let up = true;
  const world = await createWorld({
    accounts: [account('alice', { url_1: URLS.google })],
    routes: {
      [URLS.google]: () =>
        up ? { body: feed('google-private.ics') } : { status: 503, body: 'Unavailable' },
    },
  });
  const logs = captureLogs(t);
  try {
    up = false;
    for (let cycle = 0; cycle < 5; cycle += 1) {
      world.clock.now += 30 * 60_000;
      await world.sync();
    }
    up = true;
    world.clock.now += 30 * 60_000;
    await world.sync();
    world.clock.now += 30 * 60_000;
    await world.sync();
  } finally {
    logs.stop();
  }
  assert.equal(logs.lines.length, 2, logs.lines.join('\n'));
  assert.match(logs.lines[0], /\[WARN\].*Could not download Famille of alice.*503/);
  assert.match(logs.lines[1], /\[INFO\].*Famille of alice is reachable again/);
});

test('after a restart, an outage still going on is said once again', async (t) => {
  const first = await createWorld({ accounts: [account('alice', { url_1: URLS.google })] });
  const key = first.syncer.feedsOf('alice')[0].key;
  const logs = captureLogs(t);
  let world;
  try {
    world = await createWorld({
      accounts: [account('alice', { url_1: URLS.google })],
      store: { [key]: { failingSince: NOW - 3_600_000, alerted: false } },
    });
    world.clock.now += 30 * 60_000;
    await world.sync();
  } finally {
    logs.stop();
  }
  const warnings = logs.lines.filter((line) => line.includes('Could not download'));
  assert.equal(warnings.length, 1, logs.lines.join('\n'));
  assert.equal(world.syncer.feedsOf('alice')[0].failingSince, NOW - 3_600_000);
});

test('the timer synchronizes on its own and publishes what changed in the feed', async (t) => {
  const server = createServer({ [URLS.google]: feed('google-private.ics') });
  const clock = { now: NOW };
  const gladys = createFakeGladys({
    config: { refresh_minutes: '15' },
    calendarAccounts: [account('alice', { url_1: URLS.google })],
  });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const app = registerHandlers(gladys, {
    fetchImpl: server.fetchImpl,
    now: () => clock.now,
    store: createMemoryStore(),
    limiter: { schedule: (fn) => Promise.resolve().then(fn) },
    sleep: async () => {},
  });
  t.after(() => app.stop());
  await gladys.connect();
  await app.idle();
  const calendar = gladys.fake.calendars[0].external_id;
  const names = () =>
    gladys.fake.calendarEvents
      .filter((event) => event.calendar_external_id === calendar)
      .map((event) => event.name);
  assert.ok(names().includes('Dentiste'));

  server.routes[URLS.google] = feed('google-private.ics').replace(
    'SUMMARY:Dentiste',
    'SUMMARY:Orthodontiste',
  );
  const downloads = server.requests.length;
  clock.now += 15 * 60_000;
  // No onPoll, no action: only the timer.
  t.mock.timers.tick(15 * 60_000);
  await app.idle();
  assert.equal(server.requests.length, downloads + 1);
  assert.ok(names().includes('Orthodontiste'));
  assert.ok(!names().includes('Dentiste'));

  // And it keeps going.
  clock.now += 15 * 60_000;
  t.mock.timers.tick(15 * 60_000);
  await app.idle();
  assert.equal(server.requests.length, downloads + 2);
});
