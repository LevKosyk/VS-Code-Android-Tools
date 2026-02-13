const test = require('node:test');
const assert = require('node:assert/strict');
const { parseJavaMajorVersion } = require('../out/core/javaVersion.js');

test('parses modern java version', () => {
  const out = 'openjdk version "21.0.9" 2025-10-15';
  assert.equal(parseJavaMajorVersion(out), 21);
});

test('parses legacy java version format', () => {
  const out = 'java version "1.8.0_402"';
  assert.equal(parseJavaMajorVersion(out), 8);
});

test('parses java 25', () => {
  const out = 'java version "25.0.1" 2026-01-01';
  assert.equal(parseJavaMajorVersion(out), 25);
});
