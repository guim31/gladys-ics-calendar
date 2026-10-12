import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  SLOT_COUNT,
  normalizeConfig,
  parseAccount,
  refreshMs,
} from '../src/config.js';

test('defaults, and values coerced from the form', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
  assert.deepEqual(
    normalizeConfig({
      refresh_minutes: '15',
      horizon_months: '24',
      unreachable_hours: '12',
      change_days: 3.4,
      language: 'de',
    }),
    {
      refresh_minutes: '15',
      horizon_months: '24',
      unreachable_hours: 12,
      change_days: 3,
      language: 'de',
    },
  );
  assert.deepEqual(
    normalizeConfig({
      refresh_minutes: 5,
      horizon_months: '120',
      unreachable_hours: 1000,
      change_days: 0,
      language: 'it',
    }),
    {
      refresh_minutes: '30',
      horizon_months: '12',
      unreachable_hours: 168,
      change_days: 1,
      language: 'fr',
    },
  );
  assert.equal(refreshMs(normalizeConfig({ refresh_minutes: '60' })), 3_600_000);
});

test('the account gives the filled addresses, in slot order', () => {
  assert.equal(SLOT_COUNT, 5);
  assert.deepEqual(
    parseAccount({
      name_1: ' Famille  Martin ',
      url_1: ' https://a.example/a.ics ',
      name_2: 'Unused',
      url_2: '',
      url_4: 'webcal://b.example/b.ics',
      url_6: 'https://ignored.example',
    }),
    [
      { slot: 1, name: 'Famille Martin', url: 'https://a.example/a.ics' },
      { slot: 4, name: '', url: 'webcal://b.example/b.ics' },
    ],
  );
  assert.deepEqual(parseAccount(), []);
  assert.deepEqual(parseAccount({ url_1: null, url_2: 42 }), []);
});
