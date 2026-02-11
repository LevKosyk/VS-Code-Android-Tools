import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execCommand } from '../core/cli';
import { runGradleTask } from '../gradle/gradleService';
import { findApplicationModules } from '../core/androidProject';

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

export async function runSigningWizard(): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    vscode.window.showErrorMessage('No workspace folder open.');
    return;
  }
  const modules = findApplicationModules(workspaceRoot);
  if (modules.length === 0) {
    vscode.window.showErrorMessage('No Android modules found.');
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
    vscode.window.showErrorMessage(`Keytool failed: ${result.stderr || result.stdout}`);
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
  vscode.window.showInformationMessage('Signing setup complete.');
}

export async function buildSignedApk(): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    vscode.window.showErrorMessage('No workspace folder open.');
    return;
  }
  const modules = findApplicationModules(workspaceRoot);
  const moduleName = modules.length === 1
    ? modules[0]
    : await vscode.window.showQuickPick(modules, { placeHolder: 'Select module' });
  if (!moduleName) {
    return;
  }
  const ok = await runGradleTask(workspaceRoot, `:${moduleName}:assembleRelease`);
  ok
    ? vscode.window.showInformationMessage('Signed APK build complete')
    : vscode.window.showErrorMessage('Signed APK build failed');
}

export async function buildSignedBundle(): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    vscode.window.showErrorMessage('No workspace folder open.');
    return;
  }
  const modules = findApplicationModules(workspaceRoot);
  const moduleName = modules.length === 1
    ? modules[0]
    : await vscode.window.showQuickPick(modules, { placeHolder: 'Select module' });
  if (!moduleName) {
    return;
  }
  const ok = await runGradleTask(workspaceRoot, `:${moduleName}:bundleRelease`);
  ok
    ? vscode.window.showInformationMessage('Signed AAB build complete')
    : vscode.window.showErrorMessage('Signed AAB build failed');
}
