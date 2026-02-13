const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyGradleFailure, buildRunFailureReport } = require('../out/run/runDiagnostics.js');

test('classifyGradleFailure detects sdk missing', () => {
  const c = classifyGradleFailure('SDK location not found. Define location with sdk.dir');
  assert.equal(c.tags.includes('sdkMissing'), true);
  assert.equal(/Android SDK not configured/i.test(c.summary), true);
});

test('classifyGradleFailure detects task not found', () => {
  const c = classifyGradleFailure("Task ':app:installFoo' not found in root project");
  assert.equal(c.tags.includes('taskNotFound'), true);
});

test('buildRunFailureReport aggregates top reasons', () => {
  const report = buildRunFailureReport([
    { action: 'Run', message: 'Install failed', reason: 'sdkMissing', timestamp: 1 },
    { action: 'Run', message: 'Install failed again', reason: 'sdkMissing', timestamp: 2 },
    { action: 'Build', message: 'Task missing', reason: 'taskNotFound', timestamp: 3 },
  ]);
  assert.equal(report.includes('[2] Run :: sdkMissing'), true);
  assert.equal(report.includes('[1] Build :: taskNotFound'), true);
});
