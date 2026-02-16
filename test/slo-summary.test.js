const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeSlo } = require('../out/insights/sloSummary.js');

test('summarizeSlo calculates rates and medians', () => {
  const now = Date.now();
  const metrics = [
    { action: 'Run', success: true, durationMs: 1100, timestamp: now - 1000 },
    { action: 'Run', success: false, durationMs: 1400, timestamp: now - 2000 },
    { action: 'Build', success: true, durationMs: 3000, timestamp: now - 3000 },
    { action: 'Build', success: true, durationMs: 5000, timestamp: now - 4000 },
    { action: 'Install', success: true, durationMs: 1500, timestamp: now - 5000 },
    { action: 'Install', success: true, durationMs: 2500, timestamp: now - 6000 },
  ];
  const sessions = [
    { id: 'a', startedAt: now - 1000, endedAt: now, hadFailure: false },
    { id: 'b', startedAt: now - 2000, endedAt: now, hadFailure: true },
    { id: 'c', startedAt: now - 3000, endedAt: now, hadFailure: false, unexpectedTermination: true },
  ];
  const s = summarizeSlo(metrics, sessions);
  assert.equal(s.runSuccessRate, 50);
  assert.equal(s.medianBuildMs, 4000);
  assert.equal(s.medianInstallMs, 2000);
  assert.equal(s.crashFreeSessionRate, 33.3);
});
