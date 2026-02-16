const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

test('webview snapshot: run panel critical UX markers', () => {
  const src = read('src/run/runPanel.ts');
  const markers = [
    'role="status"',
    'role="alert"',
    'aria-label="Module selector"',
    'historyList.innerHTML = \'<div class="history-item">Loading recent runs...</div>\'',
    'setInterval(persistPanelState, 2000);',
  ];
  markers.forEach(m => assert.equal(src.includes(m), true, `Missing marker in runPanel: ${m}`));
});

test('webview snapshot: matrix panel progressive/state markers', () => {
  const src = read('src/matrix/matrixDashboardPanel.ts');
  const markers = [
    'devicesEl.textContent = \'Loading devices...\'',
    'history.textContent = \'Loading flaky history...\'',
    'const persisted = vscode.getState ? (vscode.getState() || {}) : {};',
    'setInterval(persistState, 2500);',
    'role="status"',
  ];
  markers.forEach(m => assert.equal(src.includes(m), true, `Missing marker in matrix panel: ${m}`));
});

test('webview snapshot: gradle intelligence progressive/state markers', () => {
  const src = read('src/gradle/gradleIntelligencePanel.ts');
  const markers = [
    'const persisted = vscode.getState ? (vscode.getState() || {}) : {};',
    'setInterval(persistState, 2500);',
    'role="status"',
    'Loading… run detector to show results',
  ];
  markers.forEach(m => assert.equal(src.includes(m), true, `Missing marker in gradle intelligence panel: ${m}`));
});
