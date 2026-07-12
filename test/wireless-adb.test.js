const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseWirelessEndpoint } = require(path.join(__dirname, '..', 'out', 'devices', 'wirelessAdb.js'));

test('wireless ADB endpoint parser accepts IPv4, hostname, and bracketed IPv6', () => {
  assert.equal(parseWirelessEndpoint('192.168.1.10:37123').address, '192.168.1.10:37123');
  assert.equal(parseWirelessEndpoint('pixel.local:5555').port, 5555);
  assert.equal(parseWirelessEndpoint('[fe80::1]:5555').host, '[fe80::1]');
});

test('wireless ADB endpoint parser rejects missing and invalid ports', () => {
  assert.equal(parseWirelessEndpoint('192.168.1.10'), undefined);
  assert.equal(parseWirelessEndpoint('host:0'), undefined);
  assert.equal(parseWirelessEndpoint('host:70000'), undefined);
});
