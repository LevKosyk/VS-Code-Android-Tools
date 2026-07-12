const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const extensionSource = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');

const internalCommands = new Set([
  'android-toolkit.applyDeviceStateProfileByName',
  'android-toolkit.ciSmoke',
  'android-toolkit.listDeviceStateProfiles',
  'android-toolkit.openFile',
  'android-toolkit.showGradleOutput',
  'android-toolkit.xmlFixMissingConstraints',
  'android-toolkit.xmlFixMissingContentDescription',
]);

function registeredCommands() {
  return new Set(
    Array.from(extensionSource.matchAll(/registerCommand\(\s*['"]([^'"]+)/g), match => match[1])
  );
}

test('every contributed command has a runtime registration', () => {
  const registered = registeredCommands();
  const contributed = (manifest.contributes.commands || []).map(item => item.command);
  const missing = contributed.filter(command => !registered.has(command));
  assert.deepEqual(missing, []);
});

test('runtime-only commands are explicitly classified as internal', () => {
  const contributed = new Set((manifest.contributes.commands || []).map(item => item.command));
  const runtimeOnly = Array.from(registeredCommands())
    .filter(command => !contributed.has(command))
    .sort();
  assert.deepEqual(runtimeOnly, Array.from(internalCommands).sort());
});

test('activation is scoped to Android workspaces and views', () => {
  assert.equal(manifest.activationEvents.includes('onStartupFinished'), false);
  assert.equal(manifest.activationEvents.includes('onView:androidProjectView'), true);
  assert.equal(manifest.activationEvents.includes('workspaceContains:**/settings.gradle.kts'), true);
});

test('Command Palette exposes only the focused Android workflow', () => {
  const hidden = new Set(
    (manifest.contributes.menus?.commandPalette || [])
      .filter(item => item.when === 'false')
      .map(item => item.command)
  );
  const visible = (manifest.contributes.commands || [])
    .map(item => item.command)
    .filter(command => !hidden.has(command));
  assert.equal(visible.length, 41);
  for (const essential of [
    'android-toolkit.firstRunHealthWizard',
    'android-toolkit.openRunPanel',
    'android-toolkit.openLogcat',
    'android-toolkit.installApk',
    'android-toolkit.exportDiagnosticsBundle',
    'android-toolkit.openDeviceCenter',
    'android-toolkit.pairWirelessDevice',
    'android-toolkit.mirrorDeviceScrcpy',
  ]) {
    assert.equal(visible.includes(essential), true, `essential command hidden: ${essential}`);
  }
});

test('the Android device manager does not ship iOS simulator code', () => {
  const legacyIosFiles = ['index.ts', 'simulatorManager.ts', 'types.ts']
    .filter(file => fs.existsSync(path.join(root, 'src', 'ios', file)));
  assert.deepEqual(legacyIosFiles, []);
  const managerSource = fs.readFileSync(path.join(root, 'src', 'deviceManager', 'deviceManagerProvider.ts'), 'utf8');
  assert.equal(managerSource.includes('iOS'), false);
  assert.equal(managerSource.includes('xcrun'), false);
  assert.equal(fs.existsSync(path.join(root, 'out', 'ios', 'simulatorManager.js')), false);
});
