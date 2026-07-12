const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const fixture = path.join(__dirname, 'fixtures', 'android-project');
const { buildAndroidGradleModel } = require(path.join(root, 'out', 'gradle', 'gradleModel.js'));
const { findLatestApk } = require(path.join(root, 'out', 'core', 'androidProject.js'));

test('Gradle Model Helper resolves multi-module flavored variants', () => {
  const tasks = ['assembleDemoDebug', 'assembleDemoRelease', 'installDemoDebug'].map(name => ({
    name, fullName: `:app:${name}`, group: 'Build', description: name, module: 'app',
  }));
  const model = buildAndroidGradleModel(fixture, tasks);
  assert.equal(model.modules.length, 1);
  assert.equal(model.modules[0].name, 'app');
  assert.equal(model.modules[0].applicationId, 'dev.androidtools.fixture');
  assert.deepEqual(model.modules[0].flavors, ['Demo']);
  assert.deepEqual(model.modules[0].variants, ['DemoDebug', 'DemoRelease']);
});

test('APK discovery prefers AGP output metadata and universal output', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'android-tools-apk-'));
  const dir = path.join(workspace, 'app', 'build', 'outputs', 'apk', 'demoDebug');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'split-x86.apk'), 'split');
  fs.writeFileSync(path.join(dir, 'app-demo-debug.apk'), 'universal');
  fs.writeFileSync(path.join(dir, 'output-metadata.json'), JSON.stringify({ elements: [
    { outputFile: 'split-x86.apk', filters: [{ filterType: 'ABI', value: 'x86' }] },
    { outputFile: 'app-demo-debug.apk', filters: [] },
  ] }));
  try {
    assert.equal(findLatestApk(workspace, 'app', 'DemoDebug'), path.join(dir, 'app-demo-debug.apk'));
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});
