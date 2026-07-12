const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const fixture = path.join(__dirname, 'fixtures', 'android-project');
const project = require(path.join(root, 'out', 'core', 'androidProject.js'));
const targets = require(path.join(root, 'out', 'run', 'launchTargets.js'));

test('Android fixture discovers Gradle modules and selects application modules', () => {
  assert.deepEqual(project.listGradleModules(fixture).sort(), ['app', 'core']);
  assert.deepEqual(project.findApplicationModules(fixture), ['app']);
});

test('Android fixture resolves Kotlin DSL applicationId', () => {
  assert.equal(project.findApplicationId(fixture, 'app'), 'dev.androidtools.fixture');
});

test('Android fixture resolves activities and browsable deep links', () => {
  const items = targets.listManifestLaunchTargets(fixture, 'app', 'dev.androidtools.fixture');
  assert.equal(items.some(item => item.type === 'activity' && item.activity === 'dev.androidtools.fixture.MainActivity'), true);
  assert.equal(items.some(item => item.type === 'activity' && item.activity === 'dev.androidtools.fixture.DetailActivity'), true);
  assert.equal(items.some(item => item.type === 'deepLink' && item.deepLink === 'fixture://open/item'), true);
});
