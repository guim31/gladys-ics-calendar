// -----------------------------------------------------------------------------
// A test world: the SDK's fake Gladys, a fake web server serving the fixture
// feeds (with ETag / 304), a settable clock, an in-memory store and a limiter
// that never waits. Times are read in Europe/Paris (the TZ the supervisor
// injects for a French instance).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';

process.env.TZ = 'Europe/Paris';

export const NOW = Date.parse('2026-10-12T06:00:00.000Z'); // Monday 12 October 2026, 08:00 in Paris

/** A fixture feed, as text. */
export function feed(name) {
  return readFileSync(new URL(`../fixtures/feeds/${name}`, import.meta.url), 'utf8');
}

// Addresses as users paste them. The tokens are invented.
export const URLS = {
  google:
    'https://calendar.google.com/calendar/ical/family.example%40gmail.com/private-0123456789abcdef0123456789abcdef/basic.ics',
  school: 'webcal://school.example/ical/timetable.ics?token=S3CR3T-T0K3N',
  holidays:
    'https://calendar.google.com/calendar/ical/fr.french%23holiday%40group.v.calendar.google.com/public/basic.ics',
  zone: 'https://data.example/Zone-C.ics',
};

/**
 * A fake web server: `routes` maps an address (after webcal → https) to a
 * body string or a function (request) → { status, body, headers }.
 */
export function createServer(routes = {}) {
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    const headers = Object.fromEntries(
      Object.entries(init.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]),
    );
    requests.push({ url, headers });
    const route = routes[url];
    if (route === undefined) {
      return new Response('Not found', { status: 404 });
    }
    if (typeof route === 'function') {
      const answer = await route({ url, headers });
      if (answer instanceof Error) {
        throw answer;
      }
      return new Response(answer.body ?? null, {
        status: answer.status ?? 200,
        headers: answer.headers ?? {},
      });
    }
    // A static body: served with an ETag, 304 when the client already has it.
    const etag = `"${Buffer.from(route).length}-${route.length}"`;
    if (headers['if-none-match'] === etag) {
      return new Response(null, { status: 304, headers: { etag } });
    }
    return new Response(route, { status: 200, headers: { etag, 'content-type': 'text/calendar' } });
  };
  return { routes, requests, fetchImpl };
}

export function createMemoryStore(initial = {}) {
  const feeds = structuredClone(initial);
  return {
    feeds,
    saves: 0,
    async load() {},
    get: (key) => feeds[key],
    set(key, value) {
      if (value === undefined) {
        delete feeds[key];
      } else {
        feeds[key] = value;
      }
    },
    keys: () => Object.keys(feeds),
    async save() {
      this.saves += 1;
    },
  };
}

export function account(
  selector,
  config,
  firstName = selector[0].toUpperCase() + selector.slice(1),
) {
  return { user: { selector, first_name: firstName, language: 'fr' }, config };
}

/**
 * @param {object} [options]
 * @param {object[]} [options.accounts] calendar accounts
 * @param {object} [options.routes] the fake web server
 * @param {object} [options.config] admin config
 * @param {object} [options.store] initial store content
 */
export async function createWorld(options = {}) {
  const clock = { now: options.now ?? NOW };
  const server = createServer(options.routes ?? {});
  const store = createMemoryStore(options.store ?? {});
  const gladys = createFakeGladys({
    config: options.config ?? {},
    calendarAccounts: options.accounts ?? [],
    calendars: options.calendars ?? [],
  });
  const app = registerHandlers(gladys, {
    fetchImpl: server.fetchImpl,
    now: () => clock.now,
    store,
    limiter: { schedule: (fn) => Promise.resolve().then(fn) },
    sleep: async () => {},
    timers: false,
  });
  await gladys.connect();
  await app.idle();
  return {
    gladys,
    fake: gladys.fake,
    app,
    syncer: app.syncer,
    server,
    store,
    clock,
    /** Events stored by the fake Gladys for one calendar. */
    eventsOf(calendarExternalId) {
      return gladys.fake.calendarEvents.filter(
        (event) => event.calendar_external_id === calendarExternalId,
      );
    },
    /** The calendar a user got for one of their feeds, by name. */
    calendarNamed(name) {
      return gladys.fake.calendars.find((calendar) => calendar.name === name);
    },
    async sync(force = false) {
      const report = await app.syncer.syncAll({ force });
      await app.idle();
      return report;
    },
    async accountUpdated(selector) {
      await gladys.fake.calendarAccountUpdated(selector);
      await app.idle();
    },
  };
}
