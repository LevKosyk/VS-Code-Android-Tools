const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.test.js')) {
      out.push(full);
    }
  }
}

const root = path.resolve(__dirname);
const files = [];
walk(root, files);
files.sort((a, b) => a.localeCompare(b));

if (files.length === 0) {
  console.error('No test files found under test/*.test.js');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...files], {
  stdio: 'inherit',
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}
process.exit(1);
