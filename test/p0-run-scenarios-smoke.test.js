const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const extensionPath = path.join(__dirname, '..', 'src', 'extension.ts');
const source = fs.readFileSync(extensionPath, 'utf8');

function indexOfOrThrow(needle) {
  const idx = source.indexOf(needle);
  assert.notEqual(idx, -1, `Missing snippet: ${needle}`);
  return idx;
}

test('P0 run flow keeps expected guard order', () => {
  const iPreflight = indexOfOrThrow('runPreflightChecks(workspaceRoot, moduleName, variant, deviceId, true)');
  const iPipelineInstall = indexOfOrThrow('if (pipeline.install) {');
  const iInstallGuard = indexOfOrThrow("runGuarded(\n            'Install APK'");
  const iStartGuard = indexOfOrThrow("runGuarded(\n          'Start app'");
  const iHistory = indexOfOrThrow('appendRunHistory({ moduleName, variant, deviceId })');
  assert.equal(iPreflight < iPipelineInstall, true, 'Preflight must run before install stage');
  assert.equal(iPipelineInstall < iInstallGuard, true, 'Install stage should wrap install guard');
  assert.equal(iInstallGuard < iStartGuard, true, 'Install must run before start');
  assert.equal(iStartGuard < iHistory, true, 'History should be appended after successful start');
});

test('P0 stop action cancels active run scope', () => {
  assert.equal(
    source.includes('operationManager.cancel(RUN_PANEL_SCOPE);'),
    true,
    'Stop should trigger cancellation in run scope'
  );
});

test('P0 critical commands exist for incident recovery', () => {
  const required = [
    "registerCommand('android-toolkit.openRunPanel'",
    "registerCommand('android-toolkit.cancelActiveOperation'",
    "registerCommand('android-toolkit.collectDiagnosticsSnapshot'",
    "registerCommand('android-toolkit.showGradleOutput'",
  ];
  for (const needle of required) {
    assert.equal(source.includes(needle), true, `Missing command registration: ${needle}`);
  }
});
