const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeCommandBudgets, COMMAND_SLO_MS } = require('../out/insights/commandBudget.js');

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
  assert.equal(open.sloMs, COMMAND_SLO_MS['android-toolkit.openRunPanel']);
  assert.equal(run.breaches, 1);
});
