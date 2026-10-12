import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../src/store.js';

test('the outages survive a restart, in /data/state.json', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'ics-store-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = createStore(directory);
  await store.load();
  store.set('alice:f1', { failingSince: 1, alerted: true });
  store.set('alice:f2', { failingSince: 2, alerted: false });
  store.set('alice:f2', undefined);
  await store.save();
  assert.deepEqual(JSON.parse(await readFile(join(directory, 'state.json'), 'utf8')), {
    feeds: { 'alice:f1': { failingSince: 1, alerted: true } },
  });
  const again = createStore(directory);
  await again.load();
  assert.deepEqual(again.get('alice:f1'), { failingSince: 1, alerted: true });
  assert.deepEqual(again.keys(), ['alice:f1']);
});

test('a corrupt or unwritable state does not stop the integration', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'ics-store-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, 'state.json'), '{nope');
  const store = createStore(directory);
  await store.load();
  assert.deepEqual(store.keys(), []);
  // A directory that cannot exist (below a file): the save fails quietly.
  const unwritable = createStore(join(directory, 'state.json', 'below-a-file'));
  unwritable.set('alice:f1', { failingSince: 1, alerted: false });
  await unwritable.save();
  await unwritable.save();
});
