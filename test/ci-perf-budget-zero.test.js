const test = require('node:test');
const assert = require('node:assert/strict');
const baseline = require('../.ci/perf-baseline.json');
const { evaluateCiPerfBudget } = require('../scripts/check-ci-perf-budget.js');

test('ci perf budget gate accepts zero firstCommandLatencyMs as valid', () => {
  const result = evaluateCiPerfBudget(
    {
      activationTotalMs: 1900,
      firstCommandLatencyMs: 0,
    },
    baseline,
    'macos'
  );
  assert.equal(result.pass, true);
  assert.equal(result.failures.length, 0);
});
