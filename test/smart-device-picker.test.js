const test = require('node:test');
const assert = require('node:assert/strict');
const { pickSmartDeviceId } = require('../out/run/smartDevice.js');

test('pickSmartDeviceId prioritizes selected device', () => {
  const devices = [
    { id: 'emulator-5554', type: 'emulator' },
    { id: 'R5C123', type: 'physical' },
  ];
  const selected = pickSmartDeviceId(devices, 'R5C123', 'emulator-5554');
  assert.equal(selected, 'R5C123');
});

test('pickSmartDeviceId falls back to preferred then emulator', () => {
  const devices = [
    { id: 'emulator-5554', type: 'emulator' },
    { id: 'R5C123', type: 'physical' },
  ];
  const preferred = pickSmartDeviceId(devices, undefined, 'R5C123');
  assert.equal(preferred, 'R5C123');
  const emulatorFallback = pickSmartDeviceId(devices, undefined, 'missing-device');
  assert.equal(emulatorFallback, 'emulator-5554');
});
