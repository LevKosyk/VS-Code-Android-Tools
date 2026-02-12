import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { detectSdk } from '../core/sdkDetector';
import { execCommand } from '../core/cli';
import { showError, showInfo, showWarning } from '../ui/notifications';

function findSdkManager(sdkRoot: string): string | undefined {
  const cmdlineTools = path.join(sdkRoot, 'cmdline-tools');
  if (!fs.existsSync(cmdlineTools)) {
    return undefined;
  }
  const dirs = fs.readdirSync(cmdlineTools);
  const order = ['latest', ...dirs.filter(d => d !== 'latest').sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))];
  for (const d of order) {
    const p = path.join(cmdlineTools, d, 'bin', process.platform === 'win32' ? 'sdkmanager.bat' : 'sdkmanager');
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return undefined;
}

function upsertGradleProperty(filePath: string, key: string, value: string): void {
  let content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
  const line = `${key}=${value}`;
  if (new RegExp(`^${key}=`, 'm').test(content)) {
    content = content.replace(new RegExp(`^${key}=.*$`, 'm'), line);
  } else {
    content = content.trim() ? `${content.trim()}\n${line}\n` : `${line}\n`;
  }
  fs.writeFileSync(filePath, content);
}

export async function runGradleDoctor(workspaceRoot: string): Promise<void> {
  const channel = vscode.window.createOutputChannel('Android Gradle Doctor');
  channel.clear();
  channel.show(true);
  let sdkRoot = '';
  try {
    sdkRoot = detectSdk().root;
    channel.appendLine(`SDK: ${sdkRoot}`);
  } catch {
    channel.appendLine('SDK not found.');
    showError('Android SDK not found. Set ANDROID_SDK_ROOT.');
    return;
  }
  const buildToolsDir = path.join(sdkRoot, 'build-tools');
  const ndkDir = path.join(sdkRoot, 'ndk');
  const hasBuildTools = fs.existsSync(buildToolsDir) && fs.readdirSync(buildToolsDir).length > 0;
  const hasNdk = fs.existsSync(ndkDir) || fs.existsSync(path.join(sdkRoot, 'ndk-bundle'));
  channel.appendLine(`Build Tools: ${hasBuildTools ? 'OK' : 'Missing'}`);
  channel.appendLine(`NDK: ${hasNdk ? 'OK' : 'Missing'}`);

  const fix = await vscode.window.showQuickPick(
    [
      'Auto-fix SDK components',
      'Fix daemon JVM args',
      'Toggle Gradle offline mode',
      'Clean Gradle cache',
    ],
    { placeHolder: 'Select Gradle doctor action' }
  );
  if (!fix) {
    return;
  }
  if (fix === 'Auto-fix SDK components') {
    const sdkmanager = findSdkManager(sdkRoot);
    if (!sdkmanager) {
      showError('sdkmanager not found in cmdline-tools.');
      return;
    }
    const packages = ['platform-tools'];
    if (!hasBuildTools) {
      packages.push('build-tools;36.0.0');
    }
    if (!hasNdk) {
      packages.push('ndk;26.3.11579264');
    }
    const res = await execCommand(sdkmanager, packages, { timeout: 600_000 });
    channel.appendLine(res.stdout || res.stderr);
    res.exitCode === 0 ? showInfo('SDK components fixed.') : showError('SDK auto-fix failed. See output.');
    return;
  }
  const gradleProps = path.join(workspaceRoot, 'gradle.properties');
  if (fix === 'Fix daemon JVM args') {
    upsertGradleProperty(gradleProps, 'org.gradle.jvmargs', '-Xmx4g -Dfile.encoding=UTF-8');
    showInfo('Updated org.gradle.jvmargs in gradle.properties.');
    return;
  }
  if (fix === 'Toggle Gradle offline mode') {
    let content = fs.existsSync(gradleProps) ? fs.readFileSync(gradleProps, 'utf-8') : '';
    const current = content.match(/^org\.gradle\.offline=(true|false)$/m)?.[1] || 'false';
    const next = current === 'true' ? 'false' : 'true';
    upsertGradleProperty(gradleProps, 'org.gradle.offline', next);
    showInfo(`Gradle offline mode: ${next}.`);
    return;
  }
  if (fix === 'Clean Gradle cache') {
    const cacheDir = path.join(os.homedir(), '.gradle', 'caches');
    if (!fs.existsSync(cacheDir)) {
      showWarning('Gradle cache not found.');
      return;
    }
    const entries = fs.readdirSync(cacheDir);
    let removed = 0;
    for (const entry of entries) {
      const full = path.join(cacheDir, entry);
      if (entry.startsWith('transforms-') || entry.startsWith('modules-') || entry.startsWith('build-cache-')) {
        fs.rmSync(full, { recursive: true, force: true });
        removed++;
      }
    }
    showInfo(`Gradle cache cleaned. Removed groups: ${removed}.`);
  }
}
