const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseJdwpPids, parseProcessName } = require(path.join(__dirname, '..', 'out', 'debug', 'jdwpConnection.js'));

test('JDWP parsing rejects invalid PIDs and reads null-delimited process names', () => {
  assert.deepEqual(parseJdwpPids('123\ninvalid\n0\n456\n'), [123, 456]);
  assert.equal(parseProcessName('com.example.app\0--extra\0'), 'com.example.app');
  assert.equal(parseProcessName(''), undefined);
});
