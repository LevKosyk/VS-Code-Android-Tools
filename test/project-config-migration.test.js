const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { readProjectConfig } = require('../out/team/projectConfigStore.js');

test('project config migration upgrades legacy launchProfiles schema', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'android-tools-migrate-'));
  const cfgDir = path.join(dir, '.vscode');
  fs.mkdirSync(cfgDir, { recursive: true });
  const legacy = {
    version: 1,
    launchProfiles: [
      { name: 'Default', module: 'app', variant: 'Debug', target: 'emulator' },
    ],
  };
  fs.writeFileSync(path.join(cfgDir, 'android-tools.json'), JSON.stringify(legacy, null, 2), 'utf8');
  const result = readProjectConfig(dir);
  assert.equal(result.config.schemaVersion, 2);
  assert.equal(result.config.launchProfiles.length, 1);
  assert.equal(result.config.launchProfiles[0].name, 'Default');
  const persisted = JSON.parse(fs.readFileSync(path.join(cfgDir, 'android-tools.json'), 'utf8'));
  assert.equal(persisted.schemaVersion, 2);
});
