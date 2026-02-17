const test = require('node:test');
const assert = require('node:assert/strict');

const { summarizeSlowPaths } = require('../out/insights/slowPathMetrics.js');

test('slow path summary: aggregates and sorts by p95', () => {
  const now = Date.now();
  const rows = [
    { stage: 'runPreflight', durationMs: 120, success: true, timestamp: now - 100 },
    { stage: 'runPreflight', durationMs: 220, success: true, timestamp: now - 200 },
    { stage: 'startApp', durationMs: 80, success: false, timestamp: now - 120 },
    { stage: 'startApp', durationMs: 500, success: true, timestamp: now - 180 },
  ];
  const summary = summarizeSlowPaths(rows, 8);
  assert.equal(summary.length, 2);
  assert.equal(summary[0].stage, 'startApp');
  assert.equal(summary[0].failures, 1);
  assert.equal(summary[1].stage, 'runPreflight');
});
