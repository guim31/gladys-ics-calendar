// -----------------------------------------------------------------------------
// The synchronization end to end, against the SDK's fake Gladys (which checks
// the calendar contract like the core: enabled users, `sync: false` → 403,
// window overlap, prune) and a fake web server serving the fixture feeds.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NOW, URLS, account, createWorld, feed } from './helpers/world.js';

const DAY = 86_400_000;

function aliceAndBob() {
  return {
    accounts: [
      account('alice', { url_1: URLS.google, name_2: 'École', url_2: URLS.school }),
      account('bob', { url_1: URLS.holidays }),
    ],
    routes: {
      [URLS.google]: feed('google-private.ics'),
      'https://school.example/ical/timetable.ics?token=S3CR3T-T0K3N': feed('school-timetable.ics'),
      [URLS.holidays]: feed('google-fr-holidays.ics'),
    },
  };
}

const writes = (fake) =>
  fake.requests.filter(
    (request) =>
      ['POST', 'DELETE'].includes(request.method) && request.path.startsWith('/calendar'),
  );

test('every enabled user gets one calendar per feed, filled with its occurrences', async () => {
  const world = await createWorld(aliceAndBob());
  const { fake } = world;

  assert.deepEqual(
    fake.calendars.map((calendar) => [
      calendar.user,
      calendar.name,
      calendar.sync,
      calendar.shared,
    ]),
    [
      ['alice', 'Famille', true, false],
      ['alice', 'École', true, false],
      ['bob', 'Jours fériés et autres fêtes en France', true, false],
    ],
  );
  for (const calendar of fake.calendars) {
    assert.match(
      calendar.external_id,
      new RegExp(`^ext:test-integration:${calendar.user}:f[0-9a-f]{16}$`),
    );
    assert.match(calendar.color, /^#[0-9a-f]{6}$/);
  }

  const family = world.eventsOf(world.calendarNamed('Famille').external_id);
  const swim = family.filter((event) => event.name.startsWith('Natation'));
  // Weekly on Wednesdays from 16 September, 12 months ahead, minus the EXDATE of 28 October.
  assert.ok(swim.length > 45 && swim.length < 60, `${swim.length} swimming sessions`);
  assert.ok(!swim.some((event) => event.start.startsWith('2026-10-28')));
  assert.deepEqual(
    swim.find((event) => event.name === 'Natation (horaire décalé)'),
    {
      calendar_external_id: world.calendarNamed('Famille').external_id,
      external_id: swim.find((event) => event.name === 'Natation (horaire décalé)').external_id,
      name: 'Natation (horaire décalé)',
      start: '2026-10-21T17:00:00.000Z',
      end: '2026-10-21T18:30:00.000Z',
      location: "Piscine municipale, 1 rue de l'Exemple, 75000 Paris",
    },
  );
  const weekend = family.find((event) => event.name === 'Week-end chez les grands-parents');
  assert.equal(weekend.start, '2026-10-24');
  assert.equal(weekend.end, '2026-10-27');
  assert.equal(weekend.full_day, true);
  const dentist = family.find((event) => event.name === 'Dentiste');
  assert.equal(
    dentist.description,
    'Rendez-vous pris en ligne.\nVoir le rendez-vous',
    'HTML descriptions become plain text',
  );

  const school = world.eventsOf(world.calendarNamed('École').external_id);
  assert.ok(
    !school.some((event) => event.start === '2026-10-12T06:30:00.000Z'),
    'cancelled occurrence',
  );
  assert.ok(!school.some((event) => event.name === 'Conseil de classe'), 'cancelled event');
  assert.ok(
    school.some((event) => event.name === '(sans titre)'),
    'an event without SUMMARY gets a name',
  );
  assert.ok(school.some((event) => event.name === 'MATHEMATIQUES - M. Martin (rattrapage)'));
  const museum = school.find((event) => event.name === 'Sortie au musée');
  assert.equal(museum.url, 'https://school.example/sorties/musee');
  assert.equal(museum.description, 'Prévoir un pique-nique.\nRetour vers 17h.');
  assert.ok(museum.external_id.length <= 255, 'a 250-character UID still fits');

  // Bob's public holidays: 90 days of history, 12 months ahead.
  const holidays = world.eventsOf(
    world.calendarNamed('Jours fériés et autres fêtes en France').external_id,
  );
  assert.ok(holidays.every((event) => event.full_day === true));
  assert.ok(holidays.some((event) => event.start === '2026-12-25'));
  assert.ok(!holidays.some((event) => event.start < '2026-07-14'), 'nothing older than 90 days');
  assert.ok(!holidays.some((event) => event.start > '2027-10-12'), 'nothing beyond the horizon');

  assert.deepEqual(fake.connectionStatus, { connected: true });
});

test('a webcal:// address is downloaded over https, a secret one never shows in the requests', async () => {
  const world = await createWorld(aliceAndBob());
  const urls = world.server.requests.map((request) => request.url);
  assert.ok(urls.includes('https://school.example/ical/timetable.ics?token=S3CR3T-T0K3N'));
  assert.ok(urls.every((url) => url.startsWith('https://')));
  for (const request of world.fake.requests) {
    assert.ok(
      !JSON.stringify(request).includes('S3CR3T'),
      `${request.method} ${request.path} leaks the token`,
    );
    assert.ok(
      !JSON.stringify(request).includes('private-0123'),
      `${request.method} ${request.path} leaks the token`,
    );
  }
});

test('nothing is written again when the feeds did not change the same day', async () => {
  const world = await createWorld(aliceAndBob());
  const before = writes(world.fake).length;
  world.clock.now += 30 * 60_000;
  await world.sync();
  assert.equal(writes(world.fake).length, before);
  // Conditional requests: the server answered 304.
  const last = world.server.requests.slice(-3);
  assert.ok(last.every((request) => request.headers['if-none-match']));
});

test('the first download of a new day is a full one, and republishes the rolling range', async () => {
  const world = await createWorld(aliceAndBob());
  const before = writes(world.fake).length;
  world.clock.now += DAY;
  await world.sync();
  const last = world.server.requests.slice(-3);
  assert.ok(last.every((request) => !request.headers['if-none-match']));
  assert.ok(writes(world.fake).length > before);
});

test('a changed feed is republished: deleted events disappear, new ones appear', async () => {
  const world = await createWorld(aliceAndBob());
  const calendar = world.calendarNamed('Famille').external_id;
  world.server.routes[URLS.google] = feed('google-private.ics')
    .replace(/BEGIN:VEVENT\r?\nDTSTART:20261013T070000Z[\s\S]*?END:VEVENT\r?\n/, '')
    .replace('SUMMARY:Anniversaire de Camille', 'SUMMARY:Anniversaire de Camille 🎂');
  world.clock.now += 60 * 60_000;
  await world.sync();
  const events = world.eventsOf(calendar);
  assert.ok(!events.some((event) => event.name === 'Dentiste'));
  assert.ok(events.some((event) => event.name === 'Anniversaire de Camille 🎂'));
});

test('removing an address deletes its calendar; changing it creates a new private one', async () => {
  const options = aliceAndBob();
  const world = await createWorld(options);
  const school = world.calendarNamed('École').external_id;
  const family = world.calendarNamed('Famille').external_id;
  world.fake.calendars.find((calendar) => calendar.external_id === family).shared = true;

  // Alice clears the school address and pastes another Google address.
  const other = URLS.google.replace('0123456789abcdef', 'fedcba9876543210');
  world.server.routes[other] = feed('google-private.ics');
  world.fake.calendarAccounts[0].config = { url_1: other, name_2: 'École', url_2: '' };
  await world.accountUpdated('alice');

  assert.deepEqual(world.fake.deletedCalendars.sort(), [family, school].sort());
  const alice = world.fake.calendars.filter((calendar) => calendar.user === 'alice');
  assert.equal(alice.length, 1);
  assert.notEqual(alice[0].external_id, family);
  assert.equal(alice[0].shared, false, 'a new address never inherits the sharing of the old one');
  assert.equal(world.syncer.feedsOf('alice').length, 1);
});

test('the same address twice in an account gives one calendar', async () => {
  const world = await createWorld({
    accounts: [account('alice', { url_1: URLS.google, url_3: ` ${URLS.google} ` })],
    routes: { [URLS.google]: feed('google-private.ics') },
  });
  assert.equal(world.fake.calendars.length, 1);
});

test('a calendar switched off is neither downloaded nor written, and comes back when switched on', async () => {
  const world = await createWorld(aliceAndBob());
  const family = world.fake.calendars.find((calendar) => calendar.name === 'Famille');
  // The user switches it off: the core empties it.
  family.sync = false;
  world.fake.calendarEvents = world.fake.calendarEvents.filter(
    (event) => event.calendar_external_id !== family.external_id,
  );
  await world.accountUpdated('alice');
  const downloads = world.server.requests.length;
  world.clock.now += DAY;
  await world.sync();
  const googleDownloads = world.server.requests
    .slice(downloads)
    .filter((request) => request.url === URLS.google);
  assert.equal(googleDownloads.length, 0);
  assert.equal(world.eventsOf(family.external_id).length, 0);

  family.sync = true;
  await world.accountUpdated('alice');
  assert.ok(world.eventsOf(family.external_id).length > 40);
});

test('a user who disables the integration is forgotten', async () => {
  const world = await createWorld(aliceAndBob());
  world.fake.calendarAccounts = world.fake.calendarAccounts.filter(
    (entry) => entry.user.selector !== 'alice',
  );
  world.fake.calendars = world.fake.calendars.filter((calendar) => calendar.user !== 'alice');
  await world.accountUpdated('alice');
  assert.deepEqual(world.syncer.feedsOf('alice'), []);
  assert.equal(world.syncer.feeds.size, 1);
});

test('more than 500 occurrences are published in disjoint windows', async () => {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Test//EN', 'X-WR-CALNAME:Busy'];
  for (let hour = 6; hour < 10; hour += 1) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:busy-${hour}@example.com`,
      'DTSTAMP:20260101T000000Z',
      `DTSTART;TZID=Europe/Paris:20260101T${String(hour).padStart(2, '0')}0000`,
      'DURATION:PT30M',
      'RRULE:FREQ=DAILY',
      `SUMMARY:Slot ${hour}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  const world = await createWorld({
    accounts: [account('alice', { url_1: URLS.zone })],
    routes: { [URLS.zone]: lines.join('\r\n') },
  });
  const calendar = world.fake.calendars[0].external_id;
  // 4 a day over 90 days back and 12 months ahead.
  const events = world.eventsOf(calendar);
  assert.ok(events.length > 1800, `${events.length} events`);
  const requests = world.fake.publishedCalendarEvents.filter(
    (body) => body.calendar_external_id === calendar,
  );
  assert.ok(requests.length >= 4);
  for (const [index, body] of requests.entries()) {
    assert.ok(body.events.length <= 500);
    if (index > 0) {
      assert.equal(body.window.from, requests[index - 1].window.to, 'contiguous windows');
    }
  }
  assert.equal(requests[0].window.from, '1970-01-01T00:00:00.000Z');
  assert.equal(requests.at(-1).window.to, '2200-01-01T00:00:00.000Z');
  assert.equal(new Set(events.map((event) => event.external_id)).size, events.length);
});

test('an unreachable feed is reported, and the trigger fires once after the configured hours', async () => {
  let up = true;
  const world = await createWorld({
    accounts: [account('alice', { url_1: URLS.google })],
    routes: {
      [URLS.google]: () =>
        up ? { body: feed('google-private.ics') } : { status: 404, body: 'Not Found' },
    },
    config: { unreachable_hours: 6 },
  });
  world.fake.calendars[0].shared = true;
  await world.accountUpdated('alice');

  up = false;
  world.clock.now += 30 * 60_000;
  await world.sync();
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.match(world.fake.connectionStatus.message.fr, /1 calendrier\(s\) injoignable/);
  const report = await world.fake.action('sync_now', {});
  assert.match(
    report.data.message.fr,
    /0 calendrier\(s\) sur 1 synchronisé\(s\)\.\nFamille \(Alice\) : le serveur a répondu HTTP 404/,
  );
  assert.deepEqual(world.fake.sceneEvents, []);
  assert.ok(world.store.feeds[world.syncer.feedsOf('alice')[0].key].failingSince);

  world.clock.now += 6 * 3_600_000;
  await world.sync();
  world.clock.now += 30 * 60_000;
  await world.sync();
  assert.deepEqual(world.fake.sceneEvents, [
    {
      key: 'calendar_unreachable',
      data: {
        calendar: 'Famille',
        user: 'Alice',
        error: 'le serveur a répondu HTTP 404',
        hours: 6,
      },
    },
  ]);

  up = true;
  world.clock.now += 30 * 60_000;
  await world.sync();
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
  assert.deepEqual(world.store.feeds, {});
});

test('an outage survives a restart without firing twice', async () => {
  const key = (world) => world.syncer.feedsOf('alice')[0].key;
  const first = await createWorld({
    accounts: [account('alice', { url_1: URLS.google })],
    routes: {},
  });
  const saved = { [key(first)]: { failingSince: NOW - 10 * 3_600_000, alerted: true } };
  const world = await createWorld({
    accounts: [account('alice', { url_1: URLS.google })],
    calendars: [
      {
        user: 'alice',
        external_id: first.syncer.feedsOf('alice')[0].calendarId,
        selector: 'famille',
        name: 'Famille',
        description: '',
        color: '#3174ad',
        sync: true,
        shared: true,
      },
    ],
    routes: {},
    store: saved,
  });
  assert.deepEqual(world.fake.sceneEvents, []);
  assert.equal(world.syncer.feedsOf('alice')[0].failingSince, NOW - 10 * 3_600_000);
});

test('an invalid address is reported without any download', async () => {
  const world = await createWorld({
    accounts: [account('alice', { url_1: 'ftp://example.com/a.ics' })],
  });
  assert.equal(world.server.requests.length, 0);
  assert.equal(world.fake.calendars.length, 0);
  const report = await world.fake.action('sync_now', {});
  assert.match(report.data.message.fr, /adresse invalide/);
  assert.match(report.data.message.de, /ungültige Adresse/);
});

test('credentials written in the address go to an Authorization header', async () => {
  const world = await createWorld({
    accounts: [
      account('alice', {
        url_1: 'https://alice:app%20pass@cloud.example/remote.php/dav/public.ics',
      }),
    ],
    routes: { 'https://cloud.example/remote.php/dav/public.ics': feed('google-private.ics') },
  });
  const [request] = world.server.requests;
  assert.equal(request.url, 'https://cloud.example/remote.php/dav/public.ics');
  assert.equal(
    request.headers.authorization,
    `Basic ${Buffer.from('alice:app pass').toString('base64')}`,
  );
  assert.equal(world.fake.calendars.length, 1);
});

test('the "Sync now" action without any account says what to do', async () => {
  const world = await createWorld();
  const report = await world.fake.action('sync_now', {});
  assert.match(report.data.message.fr, /Mes calendriers/);
  assert.match(report.data.message.en, /My calendars/);
});

test('the horizon setting shortens the published range, older events go', async () => {
  const world = await createWorld(aliceAndBob());
  const holidays = world.calendarNamed('Jours fériés et autres fêtes en France').external_id;
  assert.ok(world.eventsOf(holidays).some((event) => event.start === '2027-05-01'));
  await world.fake.configUpdated({ horizon_months: '3' });
  await world.app.idle();
  assert.ok(!world.eventsOf(holidays).some((event) => event.start === '2027-05-01'));
  assert.ok(world.eventsOf(holidays).some((event) => event.start === '2026-12-25'));
});

test('no log line carries the secret part of an address', async (t) => {
  const lines = [];
  for (const stream of [process.stdout, process.stderr]) {
    const original = stream.write.bind(stream);
    t.mock.method(stream, 'write', (chunk, ...rest) => {
      lines.push(String(chunk));
      return original(chunk, ...rest);
    });
  }
  const failing = URLS.school.replace('S3CR3T-T0K3N', 'FAILING-T0K3N');
  await createWorld({
    accounts: [account('alice', { url_1: URLS.google, url_2: URLS.school, url_3: failing })],
    routes: {
      [URLS.google]: feed('google-private.ics'),
      'https://school.example/ical/timetable.ics?token=S3CR3T-T0K3N': feed('school-timetable.ics'),
    },
  });
  const output = lines.join('');
  assert.ok(output.includes('calendar.google.com'), 'the host is logged');
  for (const secret of ['S3CR3T', 'FAILING-T0K3N', 'private-0123', 'family.example']) {
    assert.ok(!output.includes(secret), `"${secret}" leaked in the logs`);
  }
});
