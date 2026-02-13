const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

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
  const maxBytes = 1_900_000;
  assert.equal(stat.size <= maxBytes, true, `out/extension.js is too large: ${stat.size} bytes`);
});
