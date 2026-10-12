// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import {
  DEFAULT_CONFIG,
  HORIZON_MONTHS,
  LANGUAGES,
  REFRESH_MINUTES,
  SLOT_COUNT,
} from '../src/config.js';
import { ACTIONS, registerHandlers } from '../src/app.js';
import { CHANGE_TYPES } from '../src/changes.js';
import { SCENE_ACTIONS, SCENE_TRIGGER_KEYS } from '../src/scenes.js';
import { UPCOMING_WIDGET, WIDGET_DAYS } from '../src/widgets.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const keysOf = (list) => (list ?? []).map((entry) => entry.key);
const optionsOf = (field) => field.options.map((option) => option.value);
const field = (list, key) => list.find((entry) => entry.key === key);

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

test('a calendar integration, for Gladys 5.2.0 and later', () => {
  // `type: "calendar"` and `account_schema` came with 5.2.0; widgets, scene
  // triggers and actions with 5.1.0, categories with 4.86.0.
  assert.equal(manifest.type, 'calendar');
  assert.deepEqual(minGladysVersion(), [5, 2, 0]);
  assert.deepEqual(manifest.categories, ['services']);
  assert.deepEqual(manifest.transports, ['cloud']);
});

test('the account offers one name and one secret address per slot', () => {
  const fields = manifest.account_schema;
  assert.equal(fields[0].type, 'section');
  for (let slot = 1; slot <= SLOT_COUNT; slot += 1) {
    assert.equal(field(fields, `name_${slot}`).type, 'string');
    // An address may carry a secret token (Google, Outlook, school portals).
    assert.equal(field(fields, `url_${slot}`).type, 'secret');
    assert.equal(field(fields, `url_${slot}`).required, undefined, 'a slot can be emptied');
  }
  assert.equal(fields.length, 1 + 2 * SLOT_COUNT);
});

test('config_schema defaults and choices are the ones of the code', () => {
  for (const entry of manifest.config_schema.filter((item) => item.type !== 'section')) {
    assert.equal(DEFAULT_CONFIG[entry.key], entry.default, `default of ${entry.key}`);
  }
  assert.deepEqual(
    Object.keys(DEFAULT_CONFIG).sort(),
    keysOf(manifest.config_schema)
      .filter((key) => key !== 'intro')
      .sort(),
  );
  assert.deepEqual(optionsOf(field(manifest.config_schema, 'refresh_minutes')), REFRESH_MINUTES);
  assert.deepEqual(optionsOf(field(manifest.config_schema, 'horizon_months')), HORIZON_MONTHS);
  assert.deepEqual(optionsOf(field(manifest.config_schema, 'language')), LANGUAGES);
  for (const entry of manifest.config_schema.filter((item) => item.type === 'number')) {
    assert.ok(
      Number.isInteger(entry.min) && Number.isInteger(entry.default),
      `${entry.key}: integers only`,
    );
  }
});

test('every declared action, scene action and widget has a handler', async () => {
  const gladys = createFakeGladys();
  registerHandlers(gladys, {
    timers: false,
    store: {
      load: async () => {},
      save: async () => {},
      get: () => undefined,
      set() {},
      keys: () => [],
    },
  });
  assert.deepEqual(keysOf(manifest.actions), Object.values(ACTIONS));
  for (const key of keysOf(manifest.actions)) {
    const ack = await gladys.fake.action(key, {});
    assert.equal(ack.success, true, `${key}: ${ack.error}`);
  }
  assert.deepEqual(keysOf(manifest.scene_actions), Object.keys(SCENE_ACTIONS));
  assert.deepEqual(keysOf(manifest.widgets), [UPCOMING_WIDGET]);
  const ack = await gladys.fake.widgetGet(UPCOMING_WIDGET, {
    settings: {},
    language: 'en',
    units: 'metric',
  });
  assert.equal(ack.success, true);
});

test('the scene triggers fired by the code are the declared ones, with their filters', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers), SCENE_TRIGGER_KEYS);
  const changed = field(manifest.scene_triggers, 'event_changed');
  assert.deepEqual(optionsOf(field(changed.fields, 'change')), CHANGE_TYPES);
  assert.deepEqual(keysOf(changed.variables), [
    'name',
    'start',
    'days_until',
    'location',
    'change_label',
    'calendar',
  ]);
  const unreachable = field(manifest.scene_triggers, 'calendar_unreachable');
  assert.deepEqual(keysOf(unreachable.variables), ['calendar', 'user', 'error', 'hours']);
  assert.deepEqual(keysOf(field(manifest.scene_actions, 'next_event').outputs), [
    'found',
    'name',
    'start',
    'days_until',
    'location',
    'calendar',
  ]);
});

test('the widget settings are the ones the code reads', () => {
  const [widget] = manifest.widgets;
  assert.deepEqual(keysOf(widget.settings), ['calendars', 'days']);
  assert.deepEqual(optionsOf(field(widget.settings, 'days')), WIDGET_DAYS);
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  // The Release workflow writes all three: a mismatch means one was edited by
  // hand, and Gladys would offer a version whose image is another one.
  assert.equal(manifest.version, pkg.version, 'manifest version must match package.json');
  assert.equal(manifest.docker_image, `ghcr.io/guim31/gladys-ics-calendar:${manifest.version}`);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/guim31/gladys-ics-calendar/main/cover.png',
  );
});

test('section fields are purely presentational, links https', () => {
  for (const section of [...manifest.config_schema, ...manifest.account_schema].filter(
    (f) => f.type === 'section',
  )) {
    assert.equal(section.required, undefined);
    assert.equal(section.default, undefined);
    assert.equal(section.placeholder, undefined);
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//);
    }
  }
});
