const test = require('node:test');
const assert = require('node:assert/strict');
const { runGuarded } = require('../out/core/stability.js');

test('runGuarded retries once and succeeds', async () => {
  let attempts = 0;
  const result = await runGuarded(
    'retry-check',
    async () => {
      attempts++;
      if (attempts === 1) {
        throw new Error('first fail');
      }
      return 'ok';
    },
    { retries: 1, timeoutMs: 5000 }
  );
  assert.equal(result.ok, true);
  assert.equal(result.value, 'ok');
  assert.equal(attempts, 2);
});

test('runGuarded times out with ETIMEDOUT', async () => {
  const result = await runGuarded(
    'timeout-check',
    async () => new Promise(resolve => setTimeout(() => resolve('late'), 50)),
    { timeoutMs: 5, retries: 0 }
  );
  assert.equal(result.ok, false);
  assert.equal(result.issue?.code, 'ETIMEDOUT');
});

test('runGuarded cancels before start', async () => {
  const result = await runGuarded(
    'cancel-check',
    async () => 'never',
    { shouldCancel: () => true }
  );
  assert.equal(result.ok, false);
  assert.equal(result.issue?.code, 'ECANCELLED');
});
