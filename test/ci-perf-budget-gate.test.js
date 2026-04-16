const test = require('node:test');
const assert = require('node:assert/strict');
const baseline = require('../.ci/perf-baseline.json');
const { evaluateCiPerfBudget } = require('../scripts/check-ci-perf-budget.js');

test('ci perf budget gate passes within allowed deltas', () => {
  const result = evaluateCiPerfBudget(
    {
      activationTotalMs: 1950,
      firstCommandLatencyMs: 1080,
    },
    baseline,
    'macos'
  );
  assert.equal(result.pass, true);
  assert.equal(result.failures.length, 0);
});

test('ci perf budget gate fails when activation regresses beyond allowed delta', () => {
  const result = evaluateCiPerfBudget(
    {
      activationTotalMs: 2400,
      firstCommandLatencyMs: 1000,
    },
    baseline,
    'linux'
  );
  assert.equal(result.pass, false);
  assert.equal(result.failures.some(item => item.includes('activation total regressed')), true);
});
