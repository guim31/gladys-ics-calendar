import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLimiter } from '../src/limiter.js';

test('at most `max` writes per sliding window, served in order', async () => {
  let clock = 0;
  const waits = [];
  const limiter = createLimiter({
    max: 3,
    windowMs: 60_000,
    now: () => clock,
    sleep: async (ms) => {
      waits.push(ms);
      clock += ms;
    },
  });
  const done = [];
  await Promise.all(
    Array.from({ length: 7 }, (_, index) =>
      limiter.schedule(async () => {
        done.push([index, clock]);
      }),
    ),
  );
  assert.deepEqual(done, [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 60_000],
    [4, 60_000],
    [5, 60_000],
    [6, 120_000],
  ]);
  assert.deepEqual(waits, [60_000, 60_000]);
});

test('a failed write rejects its caller only', async () => {
  const limiter = createLimiter({ now: () => 0 });
  await assert.rejects(
    limiter.schedule(async () => {
      throw new Error('boom');
    }),
    /boom/,
  );
  assert.equal(await limiter.schedule(async () => 'next'), 'next');
});
