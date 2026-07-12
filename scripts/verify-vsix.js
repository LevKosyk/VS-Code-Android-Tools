#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const JSZip = require('jszip');

async function main() {
  const target = process.argv[2];
  if (!target) throw new Error('Usage: node scripts/verify-vsix.js <file.vsix>');
  const absolute = path.resolve(process.cwd(), target);
  if (!fs.existsSync(absolute)) throw new Error(`VSIX not found: ${absolute}`);
  const zip = await JSZip.loadAsync(fs.readFileSync(absolute));
  const names = Object.keys(zip.files).filter(name => !zip.files[name].dir);
  const required = [
    'extension/package.json',
    'extension/out/extension.js',
    'extension/README.md',
    'extension/CHANGELOG.md',
    'extension/PRIVACY.md',
    'extension/SECURITY.md',
  ];
  for (const name of required) {
    if (!zip.file(name) && !zip.file(name.toLowerCase())) {
      throw new Error(`VSIX required file missing: ${name}`);
    }
  }
  const forbidden = names.filter(name =>
    /^extension\/(?:src|test|scripts|\.github)\//i.test(name) ||
    /^extension\/out\/ios\//i.test(name) ||
    /(?:^|\/)\.env(?:\.|$)/i.test(name)
  );
  if (forbidden.length > 0) {
    throw new Error(`VSIX contains forbidden files: ${forbidden.slice(0, 10).join(', ')}`);
  }
  const manifest = JSON.parse(await zip.file('extension/package.json').async('string'));
  const expectedVersion = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8')).version;
  if (manifest.version !== expectedVersion) throw new Error(`Unexpected VSIX version: ${manifest.version}; expected ${expectedVersion}`);
  if (manifest.main !== './out/extension.js') throw new Error(`Unexpected extension entry point: ${manifest.main}`);
  console.log(`VSIX verified: ${path.basename(absolute)} (${names.length} files, version ${manifest.version})`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
