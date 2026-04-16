const test = require('node:test');
const assert = require('node:assert/strict');
const {
  summarizeCommandBudgets,
  enforceCommandSloBudgets,
  COMMAND_SLO_MS,
} = require('../out/insights/commandBudget.js');

test('summarizeCommandBudgets calculates breaches and percentiles', () => {
  const now = Date.now();
  const rows = [
    { commandId: 'android-toolkit.openRunPanel', durationMs: 100, success: true, timestamp: now - 10 },
    { commandId: 'android-toolkit.openRunPanel', durationMs: 700, success: true, timestamp: now - 20 },
    { commandId: 'android-toolkit.runSelectedAlias', durationMs: 50000, success: true, timestamp: now - 30 },
    { commandId: 'android-toolkit.runSelectedAlias', durationMs: 120000, success: false, timestamp: now - 40 },
  ];
  const summary = summarizeCommandBudgets(rows);
  const open = summary.find(s => s.commandId === 'android-toolkit.openRunPanel');
  const run = summary.find(s => s.commandId === 'android-toolkit.runSelectedAlias');
  assert.ok(open);
  assert.ok(run);
  assert.equal(open.samples, 2);
  assert.equal(open.breaches, 1);
  assert.equal(typeof open.p50Ms, 'number');
  assert.equal(typeof open.p95Ms, 'number');
  assert.equal(typeof open.p99Ms, 'number');
  assert.equal(typeof open.breachRatePct, 'number');
  assert.equal(open.sloMs, COMMAND_SLO_MS['android-toolkit.openRunPanel']);
  assert.equal(run.breaches, 1);
});

test('enforceCommandSloBudgets reports violations for high breach rate', () => {
  const now = Date.now();
  const rows = [];
  for (let i = 0; i < 20; i += 1) {
    rows.push({
      commandId: 'android-toolkit.openRunPanel',
      durationMs: i < 8 ? 900 : 120,
      success: true,
      timestamp: now - i,
    });
  }
  const summary = summarizeCommandBudgets(rows);
  const violations = enforceCommandSloBudgets(summary, { maxBreachRatePct: 20, minSamples: 8 });
  assert.equal(violations.some(item => item.commandId === 'android-toolkit.openRunPanel'), true);
});
