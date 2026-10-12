import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_CODES, FeedError, fetchFeed } from '../src/fetcher.js';

const CALENDAR = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n';
const feed = { url: 'https://calendar.example/private-SECRET/basic.ics' };

async function failure(promise) {
  try {
    await promise;
  } catch (err) {
    assert.ok(err instanceof FeedError);
    assert.ok(!err.message.includes('SECRET'), err.message);
    return err;
  }
  assert.fail('expected a FeedError');
}

test('a calendar is returned with its validators', async () => {
  let seen;
  const result = await fetchFeed(feed, {
    userAgent: 'test-agent',
    fetchImpl: async (url, init) => {
      seen = { url, init };
      return new Response(`\uFEFF${CALENDAR}`, {
        headers: { etag: '"v1"', 'last-modified': 'Mon, 12 Oct 2026 06:00:00 GMT' },
      });
    },
  });
  assert.equal(result.notModified, false);
  assert.equal(result.etag, '"v1"');
  assert.equal(result.lastModified, 'Mon, 12 Oct 2026 06:00:00 GMT');
  assert.equal(seen.url, feed.url);
  assert.equal(seen.init.headers['user-agent'], 'test-agent');
  assert.equal(seen.init.redirect, 'follow');
  assert.equal(seen.init.headers['if-none-match'], undefined);
});

test('a conditional request answered 304 is "not modified"', async () => {
  let headers;
  const result = await fetchFeed(
    { ...feed, authorization: 'Basic eA==' },
    {
      etag: '"v1"',
      lastModified: 'Mon, 12 Oct 2026 06:00:00 GMT',
      fetchImpl: async (url, init) => {
        headers = init.headers;
        return new Response(null, { status: 304 });
      },
    },
  );
  assert.deepEqual(result, { notModified: true });
  assert.equal(headers['if-none-match'], '"v1"');
  assert.equal(headers['if-modified-since'], 'Mon, 12 Oct 2026 06:00:00 GMT');
  assert.equal(headers.authorization, 'Basic eA==');
});

test('HTTP errors, HTML pages and oversized files are explicit', async () => {
  const notFound = await failure(
    fetchFeed(feed, { fetchImpl: async () => new Response('nope', { status: 404 }) }),
  );
  assert.equal(notFound.code, ERROR_CODES.HTTP);
  assert.equal(notFound.detail, '404');

  const html = await failure(
    fetchFeed(feed, {
      fetchImpl: async () => new Response('<!doctype html><title>Sign in</title>'),
    }),
  );
  assert.equal(html.code, ERROR_CODES.NOT_CALENDAR);

  const declared = await failure(
    fetchFeed(feed, {
      maxBytes: 10,
      fetchImpl: async () => new Response(CALENDAR, { headers: { 'content-length': '999999' } }),
    }),
  );
  assert.equal(declared.code, ERROR_CODES.TOO_LARGE);

  const streamed = await failure(
    fetchFeed(feed, { maxBytes: 20, fetchImpl: async () => new Response(CALENDAR) }),
  );
  assert.equal(streamed.code, ERROR_CODES.TOO_LARGE);
});

test('network errors and timeouts never carry the address', async () => {
  const network = await failure(
    fetchFeed(feed, {
      fetchImpl: async (url) => {
        throw new TypeError(`fetch failed for ${url}`, {
          cause: Object.assign(new Error(`getaddrinfo ENOTFOUND ${url}`), { code: 'ENOTFOUND' }),
        });
      },
    }),
  );
  assert.equal(network.code, ERROR_CODES.NETWORK);
  assert.equal(network.detail, 'ENOTFOUND');

  const invalid = await failure(
    fetchFeed(feed, {
      fetchImpl: async (url) => {
        throw new TypeError(`Failed to parse URL from ${url}`);
      },
    }),
  );
  assert.equal(invalid.code, ERROR_CODES.INVALID_URL);

  const timeout = await failure(
    fetchFeed(feed, {
      timeoutMs: 20,
      fetchImpl: (url, init) =>
        new Promise((resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(init.signal.reason));
        }),
    }),
  );
  assert.equal(timeout.code, ERROR_CODES.TIMEOUT);
});
