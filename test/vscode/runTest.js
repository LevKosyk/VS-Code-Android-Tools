const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_VSCODE_VERSION = '1.109.3';
const DEFAULT_MAX_ATTEMPTS = 2;
const FLAKY_PATTERNS = [
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /socket hang up/i,
  /EAI_AGAIN/i,
  /network.*reset/i,
  /download.*failed/i,
  /xvfb/i,
];

function toErrorMessage(error) {
  if (!error) {
    return 'Unknown error';
  }
  if (error instanceof Error) {
    return `${error.name}: ${error.message}\n${error.stack || ''}`.trim();
  }
  return String(error);
}

function isKnownFlakyError(error) {
  const text = toErrorMessage(error);
  return FLAKY_PATTERNS.some(pattern => pattern.test(text));
}

function parsePositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) {
    return fallback;
  }
  return Math.floor(n);
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function writeFlakyReport(report) {
  const root = path.resolve(__dirname, '../../');
  const outDir = path.join(root, '.artifacts');
  ensureDir(outDir);
  const reportPath = path.join(outDir, 'runtime-flaky-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`Runtime flaky report: ${reportPath}`);
}

async function runRuntimeSuite(runTests, vscodeVersion) {
  const extensionDevelopmentPath = path.resolve(__dirname, '../../');
  const extensionTestsPath = path.resolve(__dirname, './suite/index.js');
  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: ['--disable-extensions'],
    version: vscodeVersion,
  });
}

async function main() {
  let runTests;
  try {
    ({ runTests } = require('@vscode/test-electron'));
  } catch {
    console.error('Missing @vscode/test-electron. Run: npm i -D @vscode/test-electron');
    process.exit(1);
  }

  const vscodeVersion = process.env.VSCODE_TEST_VERSION || DEFAULT_VSCODE_VERSION;
  const maxAttempts = parsePositiveInt(process.env.RUNTIME_SMOKE_MAX_ATTEMPTS, DEFAULT_MAX_ATTEMPTS);
  const report = {
    vscodeVersion,
    maxAttempts,
    startedAt: new Date().toISOString(),
    attempts: [],
    flakyRetryTriggered: false,
    finalStatus: 'failed',
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const startedAt = Date.now();
    try {
      console.log(`Runtime smoke attempt ${attempt}/${maxAttempts} (VS Code ${vscodeVersion})`);
      await runRuntimeSuite(runTests, vscodeVersion);
      report.attempts.push({
        attempt,
        status: 'passed',
        durationMs: Date.now() - startedAt,
      });
      report.finalStatus = 'passed';
      report.finishedAt = new Date().toISOString();
      writeFlakyReport(report);
      return;
    } catch (error) {
      const knownFlaky = isKnownFlakyError(error);
      report.attempts.push({
        attempt,
        status: 'failed',
        knownFlaky,
        durationMs: Date.now() - startedAt,
        error: toErrorMessage(error),
      });
      if (knownFlaky && attempt < maxAttempts) {
        report.flakyRetryTriggered = true;
        console.warn(`Known flaky runtime failure detected. Retrying (${attempt + 1}/${maxAttempts})...`);
        continue;
      }
      report.finishedAt = new Date().toISOString();
      writeFlakyReport(report);
      console.error('VS Code runtime smoke failed');
      console.error(error);
      process.exit(1);
    }
  }
}

main();
