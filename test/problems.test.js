import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProblemLog } from '../src/problems.js';

function recorder() {
  const lines = [];
  const log = {};
  for (const level of ['debug', 'info', 'warn', 'error']) {
    log[level] = (message) => lines.push([level, message]);
  }
  return { lines, log };
}

test('a repeated failure is logged once, then at debug level', () => {
  const { lines, log } = recorder();
  const problems = new ProblemLog(log);
  assert.equal(problems.fail('feed', 'Could not download: timeout'), true);
  assert.equal(problems.fail('feed', 'Could not download: timeout'), false);
  assert.equal(problems.fail('feed', 'Could not download: timeout'), false);
  assert.deepEqual(lines, [
    ['warn', 'Could not download: timeout'],
    ['debug', 'Could not download: timeout'],
    ['debug', 'Could not download: timeout'],
  ]);
});

test('a changed message is logged again, at the level asked', () => {
  const { lines, log } = recorder();
  const problems = new ProblemLog(log);
  problems.fail('feed', 'Could not download: timeout');
  assert.equal(problems.fail('feed', 'Could not download: HTTP 404', 'error'), true);
  assert.deepEqual(lines.at(-1), ['error', 'Could not download: HTTP 404']);
});

test('keys are independent', () => {
  const { lines, log } = recorder();
  const problems = new ProblemLog(log);
  problems.fail('a', 'same text');
  problems.fail('b', 'same text');
  assert.deepEqual(
    lines.map(([level]) => level),
    ['warn', 'warn'],
  );
});

test('the recovery is said once, and only after a failure', () => {
  const { lines, log } = recorder();
  const problems = new ProblemLog(log);
  assert.equal(problems.recover('feed', 'Reachable again'), false);
  assert.deepEqual(lines, []);
  problems.fail('feed', 'Could not download: timeout');
  assert.equal(problems.recover('feed', 'Reachable again'), true);
  assert.equal(problems.recover('feed', 'Reachable again'), false);
  assert.deepEqual(lines, [
    ['warn', 'Could not download: timeout'],
    ['info', 'Reachable again'],
  ]);
  // A new outage after the recovery is a new problem: logged again.
  assert.equal(problems.fail('feed', 'Could not download: timeout'), true);
});

test('a recovery without a message stays silent', () => {
  const { lines, log } = recorder();
  const problems = new ProblemLog(log);
  problems.fail('status', 'Could not update the connection status');
  assert.equal(problems.recover('status'), true);
  assert.equal(lines.length, 1);
});
