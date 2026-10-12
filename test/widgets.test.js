// -----------------------------------------------------------------------------
// The "Upcoming events" widget: rendered exactly as sent (the SDK's content
// validator), shared calendars only, localized for the viewer.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { URLS, account, createWorld, feed } from './helpers/world.js';
import { parseCalendarFilter, upcomingContent } from '../src/widgets.js';

const SCHOOL = 'https://school.example/ical/timetable.ics?token=S3CR3T-T0K3N';

async function household({ share = ['École', 'Famille'] } = {}) {
  const world = await createWorld({
    accounts: [
      account('alice', { name_1: 'École', url_1: URLS.school }),
      account('bob', { url_1: URLS.google }),
    ],
    routes: { [SCHOOL]: feed('school-timetable.ics'), [URLS.google]: feed('google-private.ics') },
  });
  for (const calendar of world.fake.calendars) {
    calendar.shared = share.includes(calendar.name);
  }
  await world.accountUpdated('alice');
  await world.accountUpdated('bob');
  return world;
}

async function content(world, settings = {}, language = 'fr') {
  const ack = await world.fake.widgetGet('upcoming_events', {
    settings,
    language,
    units: 'metric',
  });
  assert.equal(ack.success, true, ack.error);
  return ack.data.content;
}

test('the coming week of the shared calendars, in the viewer language', async () => {
  const world = await household();
  const week = await content(world);
  assert.deepEqual(validateWidgetContent(week), []);
  const [list, button] = week.components;
  assert.equal(list.type, 'card-list');
  assert.deepEqual(
    list.items.map((item) => [item.title, item.subtitle, item.badge?.text]),
    [
      ['Photo de classe', 'Demain · toute la journée', 'École'],
      ['Dentiste', 'Demain · 09:00–09:30', 'Famille'],
      ['EDUCATION PHYSIQUE & SPORTIVE', 'Demain · 10:00–12:00', 'École'],
      ['Sortie au musée', 'mer. 14 oct. · 13:00–15:00', 'École'],
      ['Natation', 'mer. 14 oct. · 18:30–20:00', 'Famille'],
      ['(sans titre)', 'jeu. 15 oct. · 09:00–10:00', 'École'],
    ],
  );
  const museum = list.items.find((item) => item.title === 'Sortie au musée');
  assert.equal(museum.description, 'Prévoir un pique-nique.\nRetour vers 17h.');
  assert.deepEqual(museum.links, [
    { url: 'https://school.example/sorties/musee', label: 'Sortie au musée' },
  ]);
  assert.deepEqual(button.action, { key: 'sync' });

  const german = await content(world, {}, 'de');
  assert.equal(german.components[0].items[1].subtitle, 'Morgen · 09:00–09:30');
  assert.equal(german.components[1].label, 'Synchronisieren');
});

test('the calendars setting restricts the list, the badge goes when one calendar remains', async () => {
  const world = await household();
  const school = await content(world, { calendars: 'école', days: '31' });
  assert.deepEqual(validateWidgetContent(school), []);
  const items = school.components[0].items;
  assert.equal(items.length, 8, 'eight rows at most');
  assert.ok(items.every((item) => item.badge === undefined));
  assert.ok(!items.some((item) => item.title.startsWith('Natation')));
});

test('private calendars never reach the dashboard', async () => {
  const world = await household({ share: ['École'] });
  const week = await content(world, { days: '31' });
  assert.ok(
    !week.components[0].items.some((item) => ['Dentiste', 'Natation'].includes(item.title)),
  );
});

test('empty states: nothing shared, nothing coming, first download', async () => {
  const none = await household({ share: [] });
  const nothingShared = await content(none);
  assert.deepEqual(validateWidgetContent(nothingShared), []);
  assert.match(nothingShared.components[0].text, /Aucun calendrier partagé/);

  const world = await household();
  const today = await content(world, { calendars: 'Famille', days: '1' }, 'es');
  assert.deepEqual(validateWidgetContent(today), []);
  assert.equal(today.components[0].text, 'Nada hoy.');

  const loading = upcomingContent({ ready: false }, { language: 'en', now: Date.now() });
  assert.deepEqual(validateWidgetContent(loading), []);
  assert.equal(loading.ttl_seconds, 30);
});

test('an unreachable shared calendar shows as a status row', async () => {
  const world = await household();
  delete world.server.routes[SCHOOL];
  world.clock.now += 60_000;
  await world.sync(true);
  const week = await content(world);
  assert.deepEqual(validateWidgetContent(week), []);
  const status = week.components.find((component) => component.type === 'status');
  assert.deepEqual(status.items, [
    { label: 'École', value: 'Injoignable', icon: 'alert-triangle', color: 'danger' },
  ]);
});

test('the sync button synchronizes and answers with a toast', async () => {
  const world = await household();
  const refreshes = world.fake.widgetRefreshes.length;
  const ack = await world.fake.widgetAction('upcoming_events', 'sync', {}, { settings: {} });
  assert.deepEqual(ack, {
    success: true,
    data: { message: '2 calendrier(s) sur 2 synchronisé(s).' },
  });
  assert.ok(world.fake.widgetRefreshes.length >= refreshes);
  const unknown = await world.fake.widgetAction('upcoming_events', 'nope', {}, { settings: {} });
  assert.equal(unknown.success, false);
});

test('the widget is refreshed after every synchronization', async () => {
  const world = await household();
  assert.ok(world.fake.widgetRefreshes.includes('upcoming_events'));
});

test('calendar names are split on commas and folded', () => {
  assert.deepEqual(parseCalendarFilter(' École , Famille;Déchets\n'), [
    'ecole',
    'famille',
    'dechets',
  ]);
  assert.deepEqual(parseCalendarFilter(undefined), []);
});
