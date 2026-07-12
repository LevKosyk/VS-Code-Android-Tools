const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { parseAppPid } = require(path.join(__dirname, '..', 'out', 'run', 'appProcess.js'));

test('parseAppPid accepts the first PID from Android pidof output', () => {
  assert.equal(parseAppPid('4217 4301\n'), 4217);
});

test('parseAppPid rejects empty, non-numeric, zero, and negative output', () => {
  assert.equal(parseAppPid(''), undefined);
  assert.equal(parseAppPid('not-running'), undefined);
  assert.equal(parseAppPid('0'), undefined);
  assert.equal(parseAppPid('-12'), undefined);
});
