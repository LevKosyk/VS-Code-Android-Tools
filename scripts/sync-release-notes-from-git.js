#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const root = path.resolve(__dirname, '..');
const changelogPath = path.join(root, 'CHANGELOG.md');
const releaseNotesPath = path.join(root, 'RELEASE_NOTES.md');
const packageJsonPath = path.join(root, 'package.json');

const writeEnabled = !process.argv.includes('--dry-run');

function runGit(args) {
  return cp.execSync(`git ${args}`, { cwd: root, encoding: 'utf8' }).trim();
}

function safeRunGit(args) {
  try {
    return runGit(args);
  } catch {
    return '';
  }
}

function parseSemverTag(tag) {
  const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag);
  if (!match) {
    return undefined;
  }
  return {
    tag,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function cmpSemver(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function classifyCommit(subject) {
  if (/^feat(\(.+\))?!?:\s+/i.test(subject)) {
    return 'Added';
  }
  if (/^fix(\(.+\))?!?:\s+/i.test(subject)) {
    return 'Fixed';
  }
  if (/^(refactor|perf|style|docs|test|build|ci|chore)(\(.+\))?!?:\s+/i.test(subject)) {
    return 'Changed';
  }
  return 'Changed';
}

function normalizeSubject(subject) {
  const m = subject.match(/^\w+(?:\(.+\))?!?:\s+(.+)$/);
  return m ? m[1].trim() : subject.trim();
}

function readCommits(rangeExpr) {
  const raw = safeRunGit(`log --format=%h%x09%s ${rangeExpr}`);
  if (!raw) {
    return [];
  }
  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [hash, ...rest] = line.split('\t');
      return { hash, subject: rest.join('\t').trim() };
    });
}

function summarizeCommits(commits) {
  const out = {
    Added: [],
    Changed: [],
    Fixed: [],
    Commits: [],
  };
  for (const c of commits) {
    const section = classifyCommit(c.subject);
    out[section].push(normalizeSubject(c.subject));
    out.Commits.push(`\`${c.hash}\` ${c.subject}`);
  }
  return out;
}

function uniqueLines(lines) {
  const seen = new Set();
  const out = [];
  for (const line of lines) {
    const key = line.trim();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(line);
  }
  return out;
}

function renderSection(versionLabel, date, summary) {
  const parts = [];
  parts.push(`## [${versionLabel}]${date ? ` - ${date}` : ''}`);
  if (summary.Added.length > 0) {
    parts.push('### Added');
    for (const item of uniqueLines(summary.Added)) {
      parts.push(`- ${item}`);
    }
    parts.push('');
  }
  if (summary.Changed.length > 0) {
    parts.push('### Changed');
    for (const item of uniqueLines(summary.Changed)) {
      parts.push(`- ${item}`);
    }
    parts.push('');
  }
  if (summary.Fixed.length > 0) {
    parts.push('### Fixed');
    for (const item of uniqueLines(summary.Fixed)) {
      parts.push(`- ${item}`);
    }
    parts.push('');
  }
  parts.push('### Commits');
  if (summary.Commits.length === 0) {
    parts.push('- No commits in this range.');
  } else {
    for (const item of summary.Commits) {
      parts.push(`- ${item}`);
    }
  }
  parts.push('');
  return parts.join('\n');
}

function buildChangelog() {
  const tagsRaw = safeRunGit('tag --list');
  const parsedTags = tagsRaw
    .split('\n')
    .map(t => t.trim())
    .filter(Boolean)
    .map(parseSemverTag)
    .filter(Boolean)
    .sort(cmpSemver);

  const versions = [];
  for (let i = 0; i < parsedTags.length; i += 1) {
    const current = parsedTags[i];
    const previous = i > 0 ? parsedTags[i - 1] : undefined;
    const rangeExpr = previous ? `${previous.tag}..${current.tag}` : `${current.tag}^!`;
    const commits = readCommits(rangeExpr);
    const summary = summarizeCommits(commits);
    const date = safeRunGit(`log -1 --format=%cs ${current.tag}`) || '';
    versions.push({
      version: `${current.major}.${current.minor}.${current.patch}`,
      date,
      summary,
    });
  }

  const latestTag = parsedTags.length > 0 ? parsedTags[parsedTags.length - 1].tag : '';
  const unreleasedCommits = readCommits(latestTag ? `${latestTag}..HEAD` : 'HEAD');
  const unreleased = summarizeCommits(unreleasedCommits);

  const lines = [];
  lines.push('# Changelog');
  lines.push('');
  lines.push('All notable changes to this project are documented here.');
  lines.push('Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning: SemVer.');
  lines.push('');
  lines.push('## [Unreleased]');
  if (unreleasedCommits.length === 0) {
    lines.push('No pending entries.');
    lines.push('');
  } else {
    lines.push('');
    const unreleasedBlock = renderSection('Unreleased', '', unreleased)
      .split('\n')
      .filter(line => !line.startsWith('## [Unreleased]'));
    lines.push(...unreleasedBlock);
  }

  for (let i = versions.length - 1; i >= 0; i -= 1) {
    const entry = versions[i];
    lines.push(renderSection(entry.version, entry.date, entry.summary).trimEnd());
    lines.push('');
  }

  return {
    content: `${lines.join('\n').trimEnd()}\n`,
    unreleased,
    unreleasedCount: unreleasedCommits.length,
    versions,
  };
}

function renderReleaseNotes(version, sourceLabel, summary) {
  const lines = [];
  lines.push(`# Release ${version}`);
  lines.push('');
  lines.push(`_Source: ${sourceLabel}_`);
  lines.push('');
  const sections = ['Added', 'Changed', 'Fixed'];
  for (const section of sections) {
    lines.push(`## ${section}`);
    const values = uniqueLines(summary[section] || []);
    if (values.length === 0) {
      lines.push('- None.');
    } else {
      for (const value of values) {
        lines.push(`- ${value}`);
      }
    }
    lines.push('');
  }
  lines.push('## Commits');
  const commits = summary.Commits || [];
  if (commits.length === 0) {
    lines.push('- No commits in this range.');
  } else {
    for (const item of commits) {
      lines.push(`- ${item}`);
    }
  }
  lines.push('');
  return `${lines.join('\n').trimEnd()}\n`;
}

function main() {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const version = String(pkg.version || '').trim();
  const { content, unreleased, unreleasedCount, versions } = buildChangelog();

  const versionEntry = versions.find(v => v.version === version);
  const releaseSource = versionEntry
    ? { label: `tag v${version}`, summary: versionEntry.summary }
    : { label: unreleasedCount > 0 ? 'Unreleased commits' : 'No new commits', summary: unreleased };
  const releaseNotes = renderReleaseNotes(version, releaseSource.label, releaseSource.summary);

  if (writeEnabled) {
    fs.writeFileSync(changelogPath, content, 'utf8');
    fs.writeFileSync(releaseNotesPath, releaseNotes, 'utf8');
    console.log(`updated ${path.relative(root, changelogPath)}`);
    console.log(`updated ${path.relative(root, releaseNotesPath)}`);
  } else {
    console.log('dry-run: would update CHANGELOG.md and RELEASE_NOTES.md');
  }
}

main();
