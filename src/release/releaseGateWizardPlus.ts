import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execCommand } from '../core/cli';
import { findApplicationModules } from '../core/androidProject';
import { runGradleTaskWithResult } from '../gradle/gradleService';
import { showGradleOutput } from '../gradle/gradleOutput';
import { runSigningWizard } from '../signing/signingWizard';
import { showError, showInfo, showWarning } from '../ui/notifications';

type BuildKind = 'apk' | 'aab';

function getAppGradlePath(workspaceRoot: string, moduleName: string): string | undefined {
  const groovy = path.join(workspaceRoot, moduleName, 'build.gradle');
  const kts = path.join(workspaceRoot, moduleName, 'build.gradle.kts');
  if (fs.existsSync(groovy)) {
    return groovy;
  }
  if (fs.existsSync(kts)) {
    return kts;
  }
  return undefined;
}

function readVersionInfo(gradlePath: string): { versionCode?: number; versionName?: string } {
  const content = fs.readFileSync(gradlePath, 'utf-8');
  const code = content.match(/versionCode\s*(?:=)?\s*(\d+)/);
  const name = content.match(/versionName\s*(?:=)?\s*["']([^"']+)["']/);
  return {
    versionCode: code ? parseInt(code[1], 10) : undefined,
    versionName: name ? name[1] : undefined,
  };
}

function bumpVersionCode(gradlePath: string, nextCode: number): { before?: number; after: number } {
  const content = fs.readFileSync(gradlePath, 'utf-8');
  const match = content.match(/versionCode\s*(=)?\s*(\d+)/);
  if (!match) {
    throw new Error('versionCode not found in Gradle file.');
  }
  const before = parseInt(match[2], 10);
  const updated = content.replace(/versionCode\s*(=)?\s*\d+/, m => m.replace(/\d+/, String(nextCode)));
  fs.writeFileSync(gradlePath, updated);
  return { before, after: nextCode };
}

function findChangelog(workspaceRoot: string): string | undefined {
  const candidates = [
    'CHANGELOG.md',
    'Changelog.md',
    'changelog.md',
    'docs/CHANGELOG.md',
  ].map(x => path.join(workspaceRoot, x));
  return candidates.find(file => fs.existsSync(file));
}

async function ensureChangelogLooksUpdated(workspaceRoot: string, versionName?: string, versionCode?: number): Promise<boolean> {
  const file = findChangelog(workspaceRoot);
  if (!file) {
    const proceed = await vscode.window.showWarningMessage(
      'CHANGELOG.md not found. Continue release flow anyway?',
      'Continue'
    );
    return proceed === 'Continue';
  }
  const content = fs.readFileSync(file, 'utf-8');
  const checks: string[] = [];
  if (versionName) {
    checks.push(versionName);
  }
  if (typeof versionCode === 'number') {
    checks.push(String(versionCode));
  }
  if (checks.length > 0 && !checks.some(x => content.includes(x))) {
    const proceed = await vscode.window.showWarningMessage(
      `Changelog found but no match for version markers (${checks.join(', ')}). Continue?`,
      'Continue'
    );
    return proceed === 'Continue';
  }
  return true;
}

function findBundletoolJar(workspaceRoot: string): string | undefined {
  const candidates: string[] = [];
  if (process.env.BUNDLETOOL_JAR) {
    candidates.push(process.env.BUNDLETOOL_JAR);
  }
  const roots = [
    workspaceRoot,
    path.join(workspaceRoot, 'tools'),
    path.join(os.homedir(), '.bundletool'),
    path.join(os.homedir(), 'Downloads'),
  ];
  for (const root of roots) {
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      continue;
    }
    for (const file of fs.readdirSync(root)) {
      if (!file.endsWith('.jar') || !file.toLowerCase().includes('bundletool')) {
        continue;
      }
      candidates.push(path.join(root, file));
    }
  }
  const existing = candidates.filter(x => fs.existsSync(x));
  if (existing.length === 0) {
    return undefined;
  }
  existing.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return existing[0];
}

function findLatestAab(workspaceRoot: string, moduleName: string): string | undefined {
  const outDir = path.join(workspaceRoot, moduleName, 'build', 'outputs', 'bundle');
  if (!fs.existsSync(outDir)) {
    return undefined;
  }
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.isFile() && full.endsWith('.aab')) {
        files.push(full);
      }
    }
  };
  walk(outDir);
  if (files.length === 0) {
    return undefined;
  }
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0];
}

async function runBundleDryRunPublish(workspaceRoot: string, moduleName: string): Promise<boolean> {
  const aabPath = findLatestAab(workspaceRoot, moduleName);
  if (!aabPath) {
    showError('AAB not found. Build AAB first.');
    return false;
  }
  let jarPath = findBundletoolJar(workspaceRoot);
  if (!jarPath) {
    const picked = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectMany: false,
      filters: { 'Java Archive': ['jar'] },
      title: 'Select bundletool.jar',
    });
    jarPath = picked?.[0]?.fsPath;
  }
  if (!jarPath) {
    showError('bundletool.jar not found.');
    return false;
  }
  const outDir = path.join(workspaceRoot, '.android-tools');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const apksPath = path.join(outDir, `${moduleName}-publish-dry-run.apks`);
  const result = await execCommand('java', [
    '-jar',
    jarPath,
    'build-apks',
    '--bundle',
    aabPath,
    '--output',
    apksPath,
    '--mode=universal',
  ], { timeout: 300_000 });
  if (result.exitCode !== 0) {
    showError(`Dry-run publish failed: ${result.stderr || result.stdout}`);
    return false;
  }
  showInfo(`Dry-run publish OK: ${apksPath}`);
  return true;
}

async function ensureSigningReady(workspaceRoot: string): Promise<boolean> {
  const props = path.join(workspaceRoot, 'android-tools.signing.properties');
  if (fs.existsSync(props)) {
    return true;
  }
  const setup = await vscode.window.showWarningMessage(
    'Signing config not found. Run Signing Wizard now?',
    'Run Signing Wizard',
    'Cancel'
  );
  if (setup !== 'Run Signing Wizard') {
    return false;
  }
  await runSigningWizard();
  return fs.existsSync(props);
}

export async function runReleaseGateWizardPlus(): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    showError('No workspace folder open.');
    return;
  }

  const modules = findApplicationModules(workspaceRoot);
  if (modules.length === 0) {
    showError('No Android modules found.');
    return;
  }
  const moduleName = modules.length === 1
    ? modules[0]
    : await vscode.window.showQuickPick(modules, { placeHolder: 'Select app module' });
  if (!moduleName) {
    return;
  }

  const gradlePath = getAppGradlePath(workspaceRoot, moduleName);
  if (!gradlePath) {
    showError('Gradle file not found for selected module.');
    return;
  }

  const version = readVersionInfo(gradlePath);
  const bumpChoice = await vscode.window.showQuickPick(
    ['Bump versionCode', 'Keep current versionCode'],
    { placeHolder: `Current versionCode: ${version.versionCode ?? 'unknown'}` }
  );
  if (!bumpChoice) {
    return;
  }
  if (bumpChoice === 'Bump versionCode') {
    const nextRaw = await vscode.window.showInputBox({
      prompt: 'New versionCode',
      value: String((version.versionCode || 0) + 1),
    });
    if (!nextRaw) {
      return;
    }
    const next = parseInt(nextRaw, 10);
    if (!Number.isFinite(next) || next <= 0) {
      showError('versionCode must be a positive number.');
      return;
    }
    const changed = bumpVersionCode(gradlePath, next);
    showInfo(`versionCode bumped: ${changed.before} -> ${changed.after}`);
  }

  const afterVersion = readVersionInfo(gradlePath);
  const changelogOk = await ensureChangelogLooksUpdated(workspaceRoot, afterVersion.versionName, afterVersion.versionCode);
  if (!changelogOk) {
    showWarning('Release flow cancelled due to changelog check.');
    return;
  }

  const signingReady = await ensureSigningReady(workspaceRoot);
  if (!signingReady) {
    showWarning('Release flow cancelled: signing not configured.');
    return;
  }

  const buildKindPick = await vscode.window.showQuickPick(
    [
      { label: 'Build Signed APK', value: 'apk' as BuildKind },
      { label: 'Build Signed AAB', value: 'aab' as BuildKind },
    ],
    { placeHolder: 'Select release artifact' }
  );
  if (!buildKindPick) {
    return;
  }

  const task = buildKindPick.value === 'apk'
    ? `:${moduleName}:assembleRelease`
    : `:${moduleName}:bundleRelease`;
  const buildResult = await runGradleTaskWithResult(workspaceRoot, task);
  showGradleOutput(task, buildResult, workspaceRoot);
  if (buildResult.exitCode !== 0) {
    showError('Release build failed. See Gradle output.');
    return;
  }

  if (buildKindPick.value === 'aab') {
    const dryRun = await vscode.window.showQuickPick(
      ['Run dry-run publish (bundletool)', 'Skip'],
      { placeHolder: 'Dry-run publish step' }
    );
    if (dryRun === 'Run dry-run publish (bundletool)') {
      const ok = await runBundleDryRunPublish(workspaceRoot, moduleName);
      if (!ok) {
        return;
      }
    }
  }

  showInfo(`Release Gate Wizard+ completed for ${moduleName}.`);
}
