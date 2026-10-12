import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feedId, hostOf, maskUrl, normalizeFeedUrl } from '../src/url.js';

test('webcal addresses become https, blanks pasted with them go', () => {
  assert.deepEqual(normalizeFeedUrl(' webcal://p01-calendars.icloud.com/published/2/AbC '), {
    url: 'https://p01-calendars.icloud.com/published/2/AbC',
  });
  assert.deepEqual(normalizeFeedUrl('WEBCALS://example.com/a.ics'), {
    url: 'https://example.com/a.ics',
  });
  assert.deepEqual(normalizeFeedUrl('http://192.0.2.10:8080/cal.ics'), {
    url: 'http://192.0.2.10:8080/cal.ics',
  });
});

test('anything but http(s) is refused', () => {
  for (const raw of [
    '',
    'calendar.ics',
    'ftp://example.com/a.ics',
    'file:///etc/passwd',
    'javascript:alert(1)',
    null,
  ]) {
    assert.equal(normalizeFeedUrl(raw), null, String(raw));
  }
});

test('credentials leave the address for a Basic header', () => {
  assert.deepEqual(
    normalizeFeedUrl('https://me%40mail.example:p%C3%A2ss@cloud.example/cal.ics#frag'),
    {
      url: 'https://cloud.example/cal.ics',
      authorization: `Basic ${Buffer.from('me@mail.example:pâss').toString('base64')}`,
    },
  );
});

test('only the host of an address is ever shown', () => {
  assert.equal(
    maskUrl('https://calendar.google.com/calendar/ical/x%40gmail.com/private-abc/basic.ics'),
    'https://calendar.google.com/…',
  );
  assert.equal(
    maskUrl('webcal://user:pass@school.example:8443/t.ics?token=x'),
    'https://school.example:8443/…',
  );
  assert.equal(maskUrl('nonsense'), '(invalid address)');
  assert.equal(hostOf('https://school.example/x'), 'school.example');
  assert.equal(hostOf('nonsense'), '');
});

test('the feed id is a stable digest, different for another address or account', () => {
  const a = feedId(normalizeFeedUrl('webcal://example.com/a.ics'));
  assert.match(a, /^f[0-9a-f]{16}$/);
  assert.equal(a, feedId(normalizeFeedUrl('https://example.com/a.ics')));
  assert.notEqual(a, feedId(normalizeFeedUrl('https://example.com/b.ics')));
  assert.notEqual(a, feedId(normalizeFeedUrl('https://u:p@example.com/a.ics')));
});
