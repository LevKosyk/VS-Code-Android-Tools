#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const root = path.resolve(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const lockPath = path.join(root, 'package-lock.json');
const changelogPath = path.join(root, 'CHANGELOG.md');

function run(cmd, opts = {}) {
  cp.execSync(cmd, { cwd: root, stdio: 'inherit', ...opts });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Unsupported version format: ${version}`);
  }
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function nextVersion(version, bump) {
  const v = parseVersion(version);
  if (bump === 'major') {
    return `${v.major + 1}.0.0`;
  }
  if (bump === 'minor') {
    return `${v.major}.${v.minor + 1}.0`;
  }
  return `${v.major}.${v.minor}.${v.patch + 1}`;
}

function upsertChangelogSection(version) {
  const today = new Date().toISOString().slice(0, 10);
  const section = `## [${version}] - ${today}
### Added
- TBD

### Changed
- TBD

### Fixed
- TBD
`;
  let content = fs.readFileSync(changelogPath, 'utf8');
  if (content.includes(`## [${version}]`)) {
    return;
  }
  const unreleasedIdx = content.indexOf('## [Unreleased]');
  if (unreleasedIdx === -1) {
    content = `${content.trim()}\n\n## [Unreleased]\n\n${section}\n`;
  } else {
    const insertPos = content.indexOf('\n', unreleasedIdx);
    content = `${content.slice(0, insertPos + 1)}\n${section}\n${content.slice(insertPos + 1)}`;
  }
  fs.writeFileSync(changelogPath, content, 'utf8');
}

function bumpPackageVersion(version) {
  const pkg = readJson(pkgPath);
  pkg.version = version;
  writeJson(pkgPath, pkg);
  if (fs.existsSync(lockPath)) {
    const lock = readJson(lockPath);
    lock.version = version;
    if (lock.packages && lock.packages['']) {
      lock.packages[''].version = version;
    }
    writeJson(lockPath, lock);
  }
}

function main() {
  const bump = (process.argv[2] || 'patch').trim();
  if (!['patch', 'minor', 'major'].includes(bump)) {
    throw new Error('Usage: node scripts/release-automate.js [patch|minor|major]');
  }
  const pkg = readJson(pkgPath);
  const target = nextVersion(String(pkg.version), bump);
  console.log(`Release automation: ${pkg.version} -> ${target}`);

  bumpPackageVersion(target);
  upsertChangelogSection(target);
  run('npm run -s release:sync-notes');

  run('npm run -s prepublish:gate');
  run('node scripts/check-release.js');
  run('npx --yes @vscode/vsce package --no-yarn --out .artifacts/android-tools-dry-run.vsix');
  console.log('Release automation complete: version bumped, changelog prepared, release notes drafted, package dry-run passed.');
}

main();
