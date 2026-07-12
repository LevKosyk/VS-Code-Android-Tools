const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAdbDevicesOutput } = require(path.join(__dirname, '..', 'out', 'devices', 'deviceManager.js'));

test('device discovery parses physical, emulator, offline, and unauthorized transports', () => {
  const devices = parseAdbDevicesOutput(`List of devices attached
emulator-5554\tdevice product:sdk model:Pixel
R58M123456\tunauthorized usb:1-1
192.168.1.20:5555\toffline
`);
  assert.deepEqual(devices, [
    { id: 'emulator-5554', type: 'emulator', status: 'online' },
    { id: 'R58M123456', type: 'physical', status: 'unauthorized' },
    { id: '192.168.1.20:5555', type: 'physical', status: 'offline' },
  ]);
});
