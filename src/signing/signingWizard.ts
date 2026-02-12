import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execCommand } from '../core/cli';
import { runGradleTaskWithResult } from '../gradle/gradleService';
import { showGradleOutput } from '../gradle/gradleOutput';
import { findApplicationModules } from '../core/androidProject';
import { showError, showInfo } from '../ui/notifications';

function getAppGradlePath(workspaceRoot: string, moduleName: string): string | undefined {
  const gradle = path.join(workspaceRoot, moduleName, 'build.gradle');
  const gradleKts = path.join(workspaceRoot, moduleName, 'build.gradle.kts');
  if (fs.existsSync(gradle)) return gradle;
  if (fs.existsSync(gradleKts)) return gradleKts;
  return undefined;
}

async function ensureSigningConfig(workspaceRoot: string, moduleName: string): Promise<void> {
  const filePath = getAppGradlePath(workspaceRoot, moduleName);
  if (!filePath) {
    return;
  }
  let content = fs.readFileSync(filePath, 'utf-8');
  if (content.includes('androidToolsSigning')) {
    return;
  }
  const snippet = `
android {
    signingConfigs {
        androidToolsSigning {
            storeFile file(signingProps['storeFile'])
            storePassword signingProps['storePassword']
            keyAlias signingProps['keyAlias']
            keyPassword signingProps['keyPassword']
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.androidToolsSigning
        }
    }
}

def signingProps = new Properties()
def signingFile = rootProject.file('android-tools.signing.properties')
if (signingFile.exists()) {
    signingProps.load(new FileInputStream(signingFile))
}
`;
  content += `\n${snippet}\n`;
  fs.writeFileSync(filePath, content);
}

function findBundletoolJar(workspaceRoot: string): string | undefined {
  const candidates: string[] = [];
  if (process.env.BUNDLETOOL_JAR) {
    candidates.push(process.env.BUNDLETOOL_JAR);
  }
  const home = require('os').homedir();
  const roots = [
    workspaceRoot,
    path.join(workspaceRoot, 'tools'),
    path.join(home, '.bundletool'),
    path.join(home, 'Downloads'),
  ];
  for (const root of roots) {
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      continue;
    }
    for (const f of fs.readdirSync(root)) {
      if (f.toLowerCase().includes('bundletool') && f.endsWith('.jar')) {
        candidates.push(path.join(root, f));
      }
    }
  }
  const existing = candidates.filter(c => fs.existsSync(c));
  if (existing.length === 0) {
    return undefined;
  }
  existing.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return existing[0];
}

export async function runSigningWizard(): Promise<void> {
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
    : await vscode.window.showQuickPick(modules, { placeHolder: 'Select module' });
  if (!moduleName) {
    return;
  }
  const keystorePath = await vscode.window.showInputBox({
    prompt: 'Keystore path (relative to project)',
    value: 'android-tools.keystore',
  });
  if (!keystorePath) {
    return;
  }
  const alias = await vscode.window.showInputBox({ prompt: 'Key alias', value: 'androidtools' });
  if (!alias) {
    return;
  }
  const storePass = await vscode.window.showInputBox({ prompt: 'Keystore password', password: true });
  if (!storePass) {
    return;
  }
  const keyPass = await vscode.window.showInputBox({ prompt: 'Key password', password: true });
  if (!keyPass) {
    return;
  }
  const dname = await vscode.window.showInputBox({
    prompt: 'Distinguished name (CN=..., OU=..., O=..., L=..., S=..., C=...)',
    value: 'CN=Android Tools, OU=Dev, O=Company, L=City, S=State, C=US',
  });
  if (!dname) {
    return;
  }
  const fullKeystorePath = path.join(workspaceRoot, keystorePath);
  const keytoolArgs = [
    '-genkeypair',
    '-v',
    '-keystore', fullKeystorePath,
    '-alias', alias,
    '-keyalg', 'RSA',
    '-keysize', '2048',
    '-validity', '10000',
    '-storepass', storePass,
    '-keypass', keyPass,
    '-dname', dname,
  ];
  const result = await execCommand('keytool', keytoolArgs, { timeout: 60_000 });
  if (result.exitCode !== 0) {
    showError(`Keytool failed: ${result.stderr || result.stdout}`);
    return;
  }
  const signingPropsPath = path.join(workspaceRoot, 'android-tools.signing.properties');
  fs.writeFileSync(signingPropsPath, [
    `storeFile=${keystorePath}`,
    `storePassword=${storePass}`,
    `keyAlias=${alias}`,
    `keyPassword=${keyPass}`,
  ].join('\n'));
  await ensureSigningConfig(workspaceRoot, moduleName);
  showInfo('Signing setup complete.');
}

export async function buildSignedApk(): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    showError('No workspace folder open.');
    return;
  }
  const modules = findApplicationModules(workspaceRoot);
  const moduleName = modules.length === 1
    ? modules[0]
    : await vscode.window.showQuickPick(modules, { placeHolder: 'Select module' });
  if (!moduleName) {
    return;
  }
  const task = `:${moduleName}:assembleRelease`;
  const result = await runGradleTaskWithResult(workspaceRoot, task);
  showGradleOutput(task, result, workspaceRoot);
  result.exitCode === 0
    ? showInfo('Signed APK build complete.')
    : showError('Signed APK build failed.');
}

export async function buildSignedBundle(): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    showError('No workspace folder open.');
    return;
  }
  const modules = findApplicationModules(workspaceRoot);
  const moduleName = modules.length === 1
    ? modules[0]
    : await vscode.window.showQuickPick(modules, { placeHolder: 'Select module' });
  if (!moduleName) {
    return;
  }
  const task = `:${moduleName}:bundleRelease`;
  const result = await runGradleTaskWithResult(workspaceRoot, task);
  showGradleOutput(task, result, workspaceRoot);
  result.exitCode === 0
    ? showInfo('Signed AAB build complete.')
    : showError('Signed AAB build failed.');
}

export async function openPlaySigningHelper(): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    'androidPlaySigningHelper',
    'Play App Signing Helper',
    vscode.ViewColumn.One,
    { enableScripts: false }
  );
  panel.webview.html = `<!DOCTYPE html><html><body style="font-family: sans-serif; padding: 16px;">
    <h3>Play App Signing</h3>
    <p>Use two keys:</p>
    <ul>
      <li>App signing key: managed by Google Play (recommended).</li>
      <li>Upload key: your local key used to sign uploads.</li>
    </ul>
    <p>Recommended flow:</p>
    <ol>
      <li>Create upload key with Signing Wizard.</li>
      <li>Build signed AAB.</li>
      <li>Upload AAB to Play Console.</li>
      <li>Store upload key in secure vault and keep a backup.</li>
    </ol>
  </body></html>`;
}

export async function bundletoolBuildApks(): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
  const aab = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectMany: false,
    filters: { 'Android App Bundle': ['aab'] },
    title: 'Select AAB',
  });
  if (!aab || !aab[0]) {
    return;
  }
  const detectedJar = workspaceRoot ? findBundletoolJar(workspaceRoot) : undefined;
  const jarPath = detectedJar || (await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectMany: false,
    filters: { 'Java Archive': ['jar'] },
    title: 'Select bundletool JAR',
  }))?.[0]?.fsPath;
  if (!jarPath) {
    showError('bundletool.jar not found. Set BUNDLETOOL_JAR or place jar in tools/Downloads.');
    return;
  }
  const output = await vscode.window.showSaveDialog({
    filters: { 'APKS': ['apks'] },
    saveLabel: 'Save .apks',
    title: 'Output APKS',
  });
  if (!output) {
    return;
  }
  const mode = await vscode.window.showQuickPick(['universal', 'default'], { placeHolder: 'APKS mode' }) || 'universal';
  const args = ['-jar', jarPath, 'build-apks', '--bundle', aab[0].fsPath, '--output', output.fsPath, `--mode=${mode}`];
  const result = await execCommand('java', args, { timeout: 300_000 });
  result.exitCode === 0
    ? showInfo(`APKS created: ${output.fsPath}`)
    : showError(`bundletool failed: ${result.stderr || result.stdout}`);
}

export async function bundletoolInstallApks(): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
  const apks = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectMany: false,
    filters: { 'APKS': ['apks'] },
    title: 'Select .apks',
  });
  if (!apks || !apks[0]) {
    return;
  }
  const detectedJar = workspaceRoot ? findBundletoolJar(workspaceRoot) : undefined;
  const jarPath = detectedJar || (await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectMany: false,
    filters: { 'Java Archive': ['jar'] },
    title: 'Select bundletool JAR',
  }))?.[0]?.fsPath;
  if (!jarPath) {
    showError('bundletool.jar not found. Set BUNDLETOOL_JAR or place jar in tools/Downloads.');
    return;
  }
  const args = ['-jar', jarPath, 'install-apks', '--apks', apks[0].fsPath];
  const result = await execCommand('java', args, { timeout: 300_000 });
  result.exitCode === 0
    ? showInfo('APKS installed via bundletool.')
    : showError(`bundletool install failed: ${result.stderr || result.stdout}`);
}

export async function bumpVersionCodeWizard(): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    showError('No workspace folder open.');
    return;
  }
  const modules = findApplicationModules(workspaceRoot);
  const moduleName = modules.length === 1
    ? modules[0]
    : await vscode.window.showQuickPick(modules, { placeHolder: 'Select module' });
  if (!moduleName) {
    return;
  }
  const file = getAppGradlePath(workspaceRoot, moduleName);
  if (!file) {
    showError('build.gradle(.kts) not found.');
    return;
  }
  const content = fs.readFileSync(file, 'utf-8');
  const match = content.match(/versionCode\s*(=)?\s*(\d+)/);
  if (!match) {
    showError('versionCode not found in Gradle file.');
    return;
  }
  const current = parseInt(match[2], 10);
  const nextRaw = await vscode.window.showInputBox({
    prompt: `Current versionCode: ${current}. New value`,
    value: String(current + 1),
  });
  if (!nextRaw) {
    return;
  }
  const next = parseInt(nextRaw, 10);
  if (Number.isNaN(next) || next <= current) {
    showError('New versionCode must be a number greater than current.');
    return;
  }
  const updated = content.replace(/versionCode\s*(=)?\s*\d+/, m => m.replace(/\d+/, String(next)));
  fs.writeFileSync(file, updated);
  showInfo(`versionCode bumped: ${current} -> ${next}`);
}
