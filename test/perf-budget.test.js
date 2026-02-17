const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const { parseVariants, listVariantsFromTasks } = require('../out/gradle/gradleService.js');

const root = path.join(__dirname, '..');

function nowMs() {
  const [sec, ns] = process.hrtime();
  return sec * 1000 + ns / 1e6;
}

test('perf budget: gradle variant parser hot path', () => {
  const tasks = [];
  for (let i = 0; i < 500; i++) {
    tasks.push({ fullName: `:app:assembleFlavor${i}Debug` });
    tasks.push({ fullName: `:app:assembleFlavor${i}Release` });
  }

  const t0 = nowMs();
  for (let i = 0; i < 200; i++) {
    listVariantsFromTasks(tasks, 'app');
    parseVariants(tasks, 'app');
  }
  const elapsed = nowMs() - t0;

  assert.equal(elapsed < 1200, true, `Variant parser perf budget exceeded: ${elapsed.toFixed(1)}ms`);
});

test('perf budget: extension bundle size', () => {
  const extensionJs = path.join(root, 'out', 'extension.js');
  const stat = fs.statSync(extensionJs);
  const maxBytes = 1_000_000;
  assert.equal(stat.size <= maxBytes, true, `out/extension.js is too large: ${stat.size} bytes`);
});

test('perf budget: extension parse time', () => {
  const extensionJs = path.join(root, 'out', 'extension.js');
  const source = fs.readFileSync(extensionJs, 'utf8');
  const t0 = nowMs();
  // Parse only; no execution side effects.
  // eslint-disable-next-line no-new
  new vm.Script(source, { filename: extensionJs });
  const elapsed = nowMs() - t0;
  const maxParseMs = 500;
  assert.equal(elapsed <= maxParseMs, true, `Parse budget exceeded: ${elapsed.toFixed(1)}ms > ${maxParseMs}ms`);
});

test('perf budget: startup phases count', () => {
  const extensionTs = path.join(root, 'src', 'extension.ts');
  const source = fs.readFileSync(extensionTs, 'utf8');
  const phaseRe = /recordStartupPhase\(\s*'([^']+)'/g;
  const phases = new Set();
  let match;
  // eslint-disable-next-line no-cond-assign
  while ((match = phaseRe.exec(source))) {
    phases.add(match[1]);
  }
  const maxStartupPhases = 6;
  assert.equal(
    phases.size <= maxStartupPhases,
    true,
    `Startup phases budget exceeded: ${phases.size} > ${maxStartupPhases}. Phases: ${Array.from(phases).join(', ')}`
  );
});
