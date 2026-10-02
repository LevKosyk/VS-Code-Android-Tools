#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const current = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;

// Manual workflow_dispatch release: republish the current version as-is.
if (process.env.RELEASE_FORCE === 'true') {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=true\nversion=${current}\n`);
  console.log(`Manual release requested; publishing ${current}`);
  process.exit(0);
}

const before = process.env.RELEASE_BASE_SHA;
if (!/^[0-9a-f]{40}$/.test(before || '') || /^0+$/.test(before)) {
  throw new Error('RELEASE_BASE_SHA must be the previous main commit');
}

const previous = JSON.parse(execFileSync('git', ['show', `${before}:package.json`], {
  cwd: root,
  encoding: 'utf8',
})).version;
const parse = version => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`Expected a stable semantic version, got ${version}`);
  return match.slice(1).map(Number);
};
const oldParts = parse(previous);
const newParts = parse(current);
const firstDifference = newParts.findIndex((part, index) => part !== oldParts[index]);
const changed = firstDifference !== -1 && newParts[firstDifference] > oldParts[firstDifference];
if (current !== previous && !changed) {
  throw new Error(`Release version must increase: ${previous} -> ${current}`);
}

const output = `changed=${changed}\nversion=${current}\n`;
fs.appendFileSync(process.env.GITHUB_OUTPUT, output);
console.log(changed ? `Publishing ${previous} -> ${current}` : `Version unchanged (${current}); no publish needed`);
