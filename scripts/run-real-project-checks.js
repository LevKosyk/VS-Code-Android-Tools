#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const root = path.resolve(__dirname, '..');
const configPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, 'qa', 'real-projects', 'projects.sample.json');
const outDir = path.join(root, '.artifacts');
const outJson = path.join(outDir, 'real-project-report.json');
const outMd = path.join(outDir, 'real-project-report.md');

function safeReadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function run(command, cwd, timeoutMs = 180000) {
  try {
    const result = cp.execSync(command, {
      cwd,
      encoding: 'utf8',
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 32 * 1024 * 1024,
    });
    return { ok: true, code: 0, stdout: result, stderr: '' };
  } catch (error) {
    return {
      ok: false,
      code: typeof error.status === 'number' ? error.status : 1,
      stdout: String(error.stdout || ''),
      stderr: String(error.stderr || error.message || 'Unknown command failure'),
    };
  }
}

function detectGradleCmd(projectPath) {
  const wrapper = process.platform === 'win32' ? 'gradlew.bat' : 'gradlew';
  const wrapperPath = path.join(projectPath, wrapper);
  if (fs.existsSync(wrapperPath)) {
    return process.platform === 'win32' ? wrapper : `./${wrapper}`;
  }
  return 'gradle';
}

function parseTaskVariants(tasksOut, moduleName) {
  const re = new RegExp(`:${moduleName}:assemble([A-Za-z0-9_]+)`, 'g');
  const variants = new Set();
  let match;
  // eslint-disable-next-line no-cond-assign
  while ((match = re.exec(tasksOut))) {
    variants.add(match[1]);
  }
  return Array.from(variants).sort((a, b) => a.localeCompare(b));
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function toMd(report) {
  const lines = [];
  lines.push('# Real Project Reliability Report');
  lines.push('');
  lines.push(`Generated: ${new Date(report.generatedAt).toISOString()}`);
  lines.push(`Projects: ${report.projects.length}`);
  lines.push(`Passed: ${report.summary.passed}`);
  lines.push(`Failed: ${report.summary.failed}`);
  lines.push('');
  lines.push('| Project | Type | Result | Variants | Notes |');
  lines.push('|---|---|---|---|---|');
  for (const p of report.projects) {
    const variants = p.variants.length > 0 ? p.variants.join(', ') : '-';
    const notes = (p.failures[0] || '').replace(/\|/g, '/').slice(0, 140) || '-';
    lines.push(`| ${p.name} | ${p.projectType} | ${p.status} | ${variants} | ${notes} |`);
  }
  lines.push('');
  lines.push('## Top Failure Buckets');
  if (report.summary.failureBuckets.length === 0) {
    lines.push('- No failures detected.');
  } else {
    for (const row of report.summary.failureBuckets) {
      lines.push(`- ${row.id}: ${row.count}`);
    }
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function classifyFailure(text) {
  const t = text.toLowerCase();
  if (t.includes('sdk') && (t.includes('missing') || t.includes('not found'))) return 'sdkMissing';
  if (t.includes('build tools')) return 'buildToolsVersion';
  if (t.includes('kotlin') && t.includes('java')) return 'kotlinRuntime';
  if (t.includes('jdk') || t.includes('java version')) return 'jdkMismatch';
  if (t.includes('manifest') && t.includes('merge')) return 'manifestMerge';
  if (t.includes('task') && t.includes('not found')) return 'taskNotFound';
  if (t.includes('daemon')) return 'daemonIssue';
  if (t.includes('dependency') || t.includes('could not resolve')) return 'dependencyResolution';
  return 'unknown';
}

function main() {
  if (!fs.existsSync(configPath)) {
    console.error(`Config not found: ${configPath}`);
    process.exit(1);
  }
  const cfg = safeReadJson(configPath);
  const projects = Array.isArray(cfg.projects) ? cfg.projects : [];
  if (projects.length === 0) {
    console.error('No projects in config.');
    process.exit(1);
  }

  const results = [];
  for (const item of projects) {
    const name = String(item.name || 'Unnamed');
    const projectPath = path.resolve(String(item.path || ''));
    const moduleName = String(item.moduleName || 'app');
    const projectType = String(item.projectType || 'unknown');
    const failures = [];
    const variants = [];
    let status = 'PASSED';

    if (!fs.existsSync(projectPath)) {
      status = 'FAILED';
      failures.push('Path not found');
      results.push({ name, path: projectPath, moduleName, projectType, status, failures, variants, failureBucket: 'unknown' });
      continue;
    }

    const gradleCmd = detectGradleCmd(projectPath);
    const tasks = run(`${gradleCmd} -q tasks --all`, projectPath, 240000);
    if (!tasks.ok) {
      status = 'FAILED';
      failures.push((tasks.stderr || tasks.stdout).trim().slice(0, 3000));
      results.push({
        name,
        path: projectPath,
        moduleName,
        projectType,
        status,
        failures,
        variants,
        failureBucket: classifyFailure(failures.join('\n')),
      });
      continue;
    }

    variants.push(...parseTaskVariants(tasks.stdout, moduleName));
    const assembleTask = variants.includes('Debug') ? `:${moduleName}:assembleDebug` : `:${moduleName}:assemble`;
    const assemble = run(`${gradleCmd} ${assembleTask} -x lint -x test`, projectPath, 360000);
    if (!assemble.ok) {
      status = 'FAILED';
      failures.push((assemble.stderr || assemble.stdout).trim().slice(0, 4000));
    }

    results.push({
      name,
      path: projectPath,
      moduleName,
      projectType,
      status,
      failures,
      variants,
      failureBucket: failures.length > 0 ? classifyFailure(failures.join('\n')) : undefined,
    });
  }

  const failed = results.filter(r => r.status === 'FAILED');
  const buckets = new Map();
  for (const row of failed) {
    const id = row.failureBucket || 'unknown';
    buckets.set(id, (buckets.get(id) || 0) + 1);
  }
  const failureBuckets = Array.from(buckets.entries())
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count);

  const report = {
    generatedAt: Date.now(),
    configPath,
    summary: {
      passed: results.length - failed.length,
      failed: failed.length,
      failureBuckets,
    },
    projects: results,
  };

  ensureDir(outJson);
  fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(outMd, toMd(report), 'utf8');
  console.log(`Wrote ${path.relative(root, outJson)}`);
  console.log(`Wrote ${path.relative(root, outMd)}`);
  if (failed.length > 0) {
    process.exitCode = 2;
  }
}

main();
