#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const artifacts = path.join(root, '.artifacts');
fs.mkdirSync(artifacts, { recursive: true });
const output = path.join(artifacts, `vscode-android-tools-${pkg.version}.vsix`);
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const packaged = spawnSync(npx, ['--yes', '@vscode/vsce', 'package', '--no-yarn', '--out', output], {
  cwd: root,
  stdio: 'inherit',
});
if (packaged.status !== 0) process.exit(packaged.status || 1);
const verified = spawnSync(process.execPath, [path.join(__dirname, 'verify-vsix.js'), output], {
  cwd: root,
  stdio: 'inherit',
});
if (verified.status !== 0) process.exit(verified.status || 1);
console.log(`Marketplace package ready: ${output}`);
