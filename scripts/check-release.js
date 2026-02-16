#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const packageJsonPath = path.join(root, 'package.json');
const changelogPath = path.join(root, 'CHANGELOG.md');
const outNotesPath = path.join(root, 'RELEASE_NOTES.md');

function fail(message) {
  console.error(`release-check: ${message}`);
  process.exit(1);
}

function warn(message) {
  console.warn(`release-check: ${message}`);
}

function readText(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`Missing file: ${path.relative(root, filePath)}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

function pickReadmePath() {
  const candidates = ['README.md', 'Readme.md'];
  for (const item of candidates) {
    const full = path.join(root, item);
    if (fs.existsSync(full)) {
      return full;
    }
  }
  fail('README file not found (expected README.md or Readme.md)');
}

function extractVersion(changelog, version) {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^## \\[${escaped}\\](?:\\s+-\\s+\\d{4}-\\d{2}-\\d{2})?\\s*$`, 'm');
  const match = changelog.match(re);
  if (!match) {
    return '';
  }
  const start = match.index + match[0].length;
  const tail = changelog.slice(start);
  const next = tail.match(/^## \[/m);
  const body = next ? tail.slice(0, next.index) : tail;
  return body.trim();
}

function extractUnreleased(changelog) {
  const match = changelog.match(/^## \[Unreleased\]\s*$/m);
  if (!match) {
    return '';
  }
  const start = match.index + match[0].length;
  const tail = changelog.slice(start);
  const next = tail.match(/^## \[/m);
  const body = next ? tail.slice(0, next.index) : tail;
  return body.trim();
}

function validateSemver(version) {
  const semverRe = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/;
  return semverRe.test(version);
}

function checkLicense() {
  const candidates = ['LICENSE', 'LICENSE.md', 'LICENSE.txt'];
  if (!candidates.some(name => fs.existsSync(path.join(root, name)))) {
    fail('License file missing (LICENSE / LICENSE.md / LICENSE.txt)');
  }
}

function checkReadmeLinks(readmePath) {
  const content = fs.readFileSync(readmePath, 'utf8');
  const mdLinkRe = /!?\[[^\]]*\]\(([^)]+)\)/g;
  const issues = [];
  let match;
  while ((match = mdLinkRe.exec(content)) !== null) {
    const raw = match[1].trim();
    if (!raw || raw.startsWith('#')) {
      continue;
    }
    if (/^https?:\/\//i.test(raw) || /^mailto:/i.test(raw)) {
      continue;
    }
    const clean = raw.split(/\s+/)[0];
    const abs = path.resolve(path.dirname(readmePath), clean);
    if (!fs.existsSync(abs)) {
      issues.push(clean);
    }
  }
  if (issues.length > 0) {
    fail(`README has broken local links/images: ${issues.slice(0, 8).join(', ')}`);
  }
}

function checkScreenshots(readmePath) {
  const content = fs.readFileSync(readmePath, 'utf8');
  const imgRe = /!\[[^\]]*\]\(([^)]+)\)/g;
  const images = [];
  let match;
  while ((match = imgRe.exec(content)) !== null) {
    const link = match[1].trim().split(/\s+/)[0];
    if (!link) {
      continue;
    }
    images.push(link);
  }
  if (images.length < 2) {
    fail('README should include at least 2 local images/GIFs for Marketplace presentation');
  }
}

function checkPackageSize() {
  const built = path.join(root, 'out', 'extension.js');
  if (!fs.existsSync(built)) {
    fail('Missing out/extension.js (run compile first)');
  }
  const stat = fs.statSync(built);
  const max = 1_300_000;
  if (stat.size > max) {
    fail(`Extension bundle too large: ${stat.size} bytes (max ${max})`);
  }
}

function generateReleaseNotes(versionBody, version) {
  const header = `# Release ${version}\n\n`;
  const content = versionBody
    ? `${header}${versionBody}\n`
    : `${header}- Maintenance release.\n`;
  fs.writeFileSync(outNotesPath, content, 'utf8');
  console.log(`release-check: wrote ${path.relative(root, outNotesPath)}`);
}

function main() {
  const pkg = JSON.parse(readText(packageJsonPath));
  const version = String(pkg.version || '').trim();
  if (!validateSemver(version)) {
    fail(`package.json version is not valid semver: "${version}"`);
  }
  const changelog = readText(changelogPath);
  if (!/^## \[Unreleased\]/m.test(changelog)) {
    fail('CHANGELOG.md must contain [Unreleased] section');
  }
  let versionBody = extractVersion(changelog, version);
  if (!versionBody) {
    versionBody = extractUnreleased(changelog);
    if (!versionBody) {
      fail(`CHANGELOG.md missing section for version ${version} and empty [Unreleased]`);
    }
    warn(`CHANGELOG.md missing section for ${version}; using [Unreleased] for release notes draft`);
  }
  const readmePath = pickReadmePath();
  checkLicense();
  checkReadmeLinks(readmePath);
  checkScreenshots(readmePath);
  checkPackageSize();
  generateReleaseNotes(versionBody, version);
  if (readmePath.endsWith('Readme.md')) {
    warn('Using Readme.md (recommended: rename to README.md for consistency)');
  }
  console.log('release-check: OK');
}

main();
