const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { applyGoldenLayoutFixes } = require('../out/layout/layoutGoldenFixes.js');

function readFixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8').trim();
}

test('layout auto-fix golden before/after snapshot', () => {
  const before = readFixture('layout-before.xml');
  const expectedAfter = readFixture('layout-after.xml');
  const expectedStrings = readFixture('layout-strings.xml');

  const result = applyGoldenLayoutFixes(before);
  assert.equal(result.xml.trim(), expectedAfter);
  assert.equal(result.stringsXml.trim(), expectedStrings);
});
