#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const root = path.resolve(__dirname, '..');
const changelogPath = path.join(root, 'CHANGELOG.md');
const notesDir = path.join(root, '.artifacts', 'release-notes');

function run(cmd, opts = {}) {
  return cp.execSync(cmd, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
}

function runNoThrow(cmd, opts = {}) {
  try {
    return { ok: true, output: run(cmd, opts) };
  } catch (error) {
    const stderr = error && error.stderr ? String(error.stderr) : '';
    const stdout = error && error.stdout ? String(error.stdout) : '';
    return { ok: false, output: `${stdout}\n${stderr}`.trim() };
  }
}

function parseChangelogSections(text) {
  const sections = new Map();
  const headingRe = /^## \[(.+?)\](?:\s*-\s*(\d{4}-\d{2}-\d{2}))?\s*$/gm;
  const matches = [...text.matchAll(headingRe)];
  for (let i = 0; i < matches.length; i += 1) {
    const name = matches[i][1];
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const body = text.slice(start, end).trim();
    sections.set(name, body);
  }
  return sections;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function main() {
  const prepareOnly = process.argv.includes('--prepare-only');
  if (!fs.existsSync(changelogPath)) {
    throw new Error('CHANGELOG.md not found');
  }
  const changelog = fs.readFileSync(changelogPath, 'utf8');
  const sections = parseChangelogSections(changelog);
  const tags = run('git tag --list "v*" | sort -V')
    .split('\n')
    .map(t => t.trim())
    .filter(Boolean);

  if (tags.length === 0) {
    console.log('No version tags found.');
    return;
  }

  ensureDir(notesDir);
  const createdFiles = [];
  const plans = [];
  for (const tag of tags) {
    const version = tag.replace(/^v/, '');
    const body = sections.get(version) || `### Changed\n- Release ${tag}`;
    const filePath = path.join(notesDir, `${tag}.md`);
    const content = `# ${tag}\n\n${body}\n`;
    fs.writeFileSync(filePath, content, 'utf8');
    createdFiles.push(filePath);
    plans.push({ tag, filePath });
  }
  console.log(`Prepared notes for ${createdFiles.length} tags in ${path.relative(root, notesDir)}.`);

  if (prepareOnly) {
    for (const p of plans) {
      console.log(`- ${p.tag}: ${path.relative(root, p.filePath)}`);
    }
    return;
  }

  const auth = runNoThrow('gh auth status');
  if (!auth.ok) {
    console.log('GitHub CLI is not authenticated. Notes are prepared; publish manually after login:');
    console.log('  gh auth login');
    for (const p of plans) {
      console.log(`  gh release create ${p.tag} --title "${p.tag}" --notes-file "${p.filePath}"`);
    }
    process.exitCode = 1;
    return;
  }

  for (const p of plans) {
    const check = runNoThrow(`gh release view ${p.tag}`);
    if (check.ok) {
      run(`gh release edit ${p.tag} --title "${p.tag}" --notes-file "${p.filePath}"`, { stdio: 'inherit' });
    } else {
      run(`gh release create ${p.tag} --title "${p.tag}" --notes-file "${p.filePath}"`, { stdio: 'inherit' });
    }
  }
  console.log('GitHub releases updated for all tags.');
}

main();
