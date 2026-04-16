const fs = require('node:fs');
const path = require('node:path');

function normalizeOsKey(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('mac')) {
    return 'macos';
  }
  if (text.includes('linux')) {
    return 'linux';
  }
  if (text.includes('win')) {
    return 'windows';
  }
  return text || process.platform;
}

function readJson(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(source);
}

function evaluateCiPerfBudget(snapshot, baselineConfig, osKey) {
  const baseline = baselineConfig.os?.[osKey];
  if (!baseline) {
    throw new Error(`Missing perf baseline for OS: ${osKey}`);
  }
  const deltas = baselineConfig.maxDeltaPercent || {};
  const checks = [
    {
      key: 'activationTotalMs',
      label: 'activation total',
      current: Number(snapshot.activationTotalMs),
      baseline: Number(baseline.activationTotalMs),
      maxDeltaPercent: Number(deltas.activationTotalMs ?? 0),
    },
    {
      key: 'firstCommandLatencyMs',
      label: 'first command latency',
      current: Number(snapshot.firstCommandLatencyMs),
      baseline: Number(baseline.firstCommandLatencyMs),
      maxDeltaPercent: Number(deltas.firstCommandLatencyMs ?? 0),
    },
  ];

  const failures = [];
  const rows = checks.map((row) => {
    if (!Number.isFinite(row.current) || row.current <= 0) {
      failures.push(`${row.key} missing or non-positive in snapshot`);
      return { ...row, allowed: 0, status: 'FAIL' };
    }
    if (!Number.isFinite(row.baseline) || row.baseline <= 0) {
      failures.push(`${row.key} baseline missing or non-positive`);
      return { ...row, allowed: 0, status: 'FAIL' };
    }
    const allowed = Math.round(row.baseline * (1 + Math.max(0, row.maxDeltaPercent) / 100));
    const status = row.current <= allowed ? 'PASS' : 'FAIL';
    if (status === 'FAIL') {
      failures.push(`${row.label} regressed: ${row.current} > ${allowed} (baseline ${row.baseline}, delta ${row.maxDeltaPercent}%)`);
    }
    return { ...row, allowed, status };
  });

  return { rows, failures, pass: failures.length === 0 };
}

function run() {
  const root = path.resolve(__dirname, '..');
  const baselinePath = path.join(root, '.ci', 'perf-baseline.json');
  const snapshotPath = path.join(root, '.artifacts', 'ci-perf-snapshot.json');

  if (!fs.existsSync(snapshotPath)) {
    throw new Error(`Missing runtime perf snapshot at ${snapshotPath}. Ensure android-toolkit.ciSmoke ran during runtime tests.`);
  }

  const baseline = readJson(baselinePath);
  const snapshot = readJson(snapshotPath);
  const osKey = normalizeOsKey(process.env.RUNNER_OS || process.platform);
  const result = evaluateCiPerfBudget(snapshot, baseline, osKey);

  console.log('CI Perf Budget Gate');
  console.log(`OS: ${osKey}`);
  for (const row of result.rows) {
    console.log(`${row.label}: current=${row.current}ms baseline=${row.baseline}ms allowed=${row.allowed}ms => ${row.status}`);
  }

  if (!result.pass) {
    for (const failure of result.failures) {
      console.error(`FAIL: ${failure}`);
    }
    process.exit(1);
  }

  console.log('PASS: startup + first-command latency delta gate');
}

if (require.main === module) {
  try {
    run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

module.exports = {
  evaluateCiPerfBudget,
  normalizeOsKey,
};
