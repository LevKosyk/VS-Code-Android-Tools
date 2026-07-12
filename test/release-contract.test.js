const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');

test('1.0.1 release metadata stays synchronized', () => {
  assert.equal(pkg.version, '1.0.1');
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.match(changelog, /^## \[1\.0\.1\] - \d{4}-\d{2}-\d{2}$/m);
});

test('Marketplace README documents the supported core workflow and policies', () => {
  for (const required of [
    '## Quick start',
    '## Requirements',
    '### Run Pipeline',
    '### Logcat 2.0',
    '## Troubleshooting',
    '[Privacy](PRIVACY.md)',
    '[Security Policy](SECURITY.md)',
  ]) {
    assert.equal(readme.includes(required), true, `README section missing: ${required}`);
  }
  assert.equal(fs.existsSync(path.join(root, 'PRIVACY.md')), true);
  assert.equal(fs.existsSync(path.join(root, 'SECURITY.md')), true);
});

test('release package does not globally activate or advertise iOS support', () => {
  assert.equal(pkg.activationEvents.includes('onStartupFinished'), false);
  assert.equal(readme.includes('iOS Simulator'), false);
});
