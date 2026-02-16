const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeErrorReason } = require('../out/run/errorTaxonomy.js');

test('normalizeErrorReason maps legacy and unknown reasons', () => {
  assert.equal(normalizeErrorReason('kotlinK2'), 'kotlinRuntime');
  assert.equal(normalizeErrorReason('sdkMissing'), 'sdkMissing');
  assert.equal(normalizeErrorReason('something-else'), 'unknown');
});
