const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { recoverAdbDevice } = require(path.join(__dirname, '..', 'out', 'devices', 'adbRecovery.js'));

test('ADB offline recovery restarts server, reconnects, and waits in order', async () => {
  const calls = [];
  const runner = async (_command, args) => {
    calls.push(args.join(' '));
    return { stdout: '', stderr: '', exitCode: 0 };
  };
  const result = await recoverAdbDevice('emulator-5554', runner, '/fake/adb');
  assert.equal(result.success, true);
  assert.deepEqual(calls, ['start-server', 'reconnect emulator-5554', '-s emulator-5554 wait-for-device']);
});

test('ADB offline recovery stops at a failed server restart', async () => {
  const runner = async () => ({ stdout: '', stderr: 'server failed', exitCode: 1 });
  const result = await recoverAdbDevice('device', runner, '/fake/adb');
  assert.deepEqual(result, { success: false, stage: 'server', message: 'server failed' });
});
