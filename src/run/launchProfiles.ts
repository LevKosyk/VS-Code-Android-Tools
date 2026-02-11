import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { listGradleTasks } from '../gradle/gradleService';
import { findApplicationModules } from '../core/androidProject';

export interface LaunchProfile {
  name: string;
  module: string;
  variant: string;
  target: 'emulator' | 'device' | 'ask';
  task?: string;
}

interface LaunchProfilesFile {
  launchProfiles: LaunchProfile[];
}

function getConfigPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.vscode', 'android-tools.json');
}

export function readLaunchProfiles(workspaceRoot: string): LaunchProfile[] {
  const configPath = getConfigPath(workspaceRoot);
  if (!fs.existsSync(configPath)) {
    return [];
  }
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(content) as LaunchProfilesFile;
    return parsed.launchProfiles || [];
  } catch {
    return [];
  }
}

export function writeLaunchProfiles(workspaceRoot: string, profiles: LaunchProfile[]): void {
  const configPath = getConfigPath(workspaceRoot);
  const folder = path.dirname(configPath);
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }
  const payload: LaunchProfilesFile = { launchProfiles: profiles };
  fs.writeFileSync(configPath, JSON.stringify(payload, null, 2));
}

export async function createLaunchProfileFlow(
  workspaceRoot: string,
  getVariantsForModule: (moduleName: string) => Promise<string[]>
): Promise<void> {
  const name = await vscode.window.showInputBox({
    title: 'Create Launch Profile',
    prompt: 'Profile name',
    placeHolder: 'My Profile',
  });
  if (!name) {
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
  const variants = await getVariantsForModule(moduleName);
  const variant = await vscode.window.showQuickPick(variants, { placeHolder: 'Select build variant' });
  if (!variant) {
    return;
  }
  const target = await vscode.window.showQuickPick(
    [
      { label: 'Emulator', value: 'emulator' },
      { label: 'Device', value: 'device' },
      { label: 'Ask Each Time', value: 'ask' },
    ],
    { placeHolder: 'Select target type' }
  );
  if (!target) {
    return;
  }
  const tasks = await listGradleTasks(workspaceRoot);
  const taskNames = tasks.map(t => t.fullName);
  const taskPick = await vscode.window.showQuickPick(
    ['(none)', ...taskNames],
    { placeHolder: 'Optional Gradle task to run before launch' }
  );
  const profiles = readLaunchProfiles(workspaceRoot);
  profiles.push({
    name,
    module: moduleName,
    variant,
    target: target.value as 'emulator' | 'device' | 'ask',
    task: taskPick && taskPick !== '(none)' ? taskPick : undefined,
  });
  writeLaunchProfiles(workspaceRoot, profiles);
  vscode.window.showInformationMessage(`Launch profile created: ${name}`);
}

export async function deleteLaunchProfileFlow(workspaceRoot: string): Promise<void> {
  const profiles = readLaunchProfiles(workspaceRoot);
  if (profiles.length === 0) {
    vscode.window.showInformationMessage('No launch profiles found.');
    return;
  }
  const picked = await vscode.window.showQuickPick(
    profiles.map(p => ({ label: p.name, profile: p })),
    { placeHolder: 'Select profile to delete' }
  );
  if (!picked) {
    return;
  }
  const next = profiles.filter(p => p.name !== picked.profile.name);
  writeLaunchProfiles(workspaceRoot, next);
  vscode.window.showInformationMessage(`Launch profile deleted: ${picked.profile.name}`);
}

export async function selectLaunchProfile(workspaceRoot: string): Promise<LaunchProfile | undefined> {
  const profiles = readLaunchProfiles(workspaceRoot);
  if (profiles.length === 0) {
    vscode.window.showInformationMessage('No launch profiles found.');
    return undefined;
  }
  const picked = await vscode.window.showQuickPick(
    profiles.map(p => ({ label: p.name, description: `${p.module} • ${p.variant}`, profile: p })),
    { placeHolder: 'Select launch profile' }
  );
  return picked?.profile;
}
