import * as vscode from 'vscode';
import { runGradleTaskWithResult } from './gradleService';
import { showGradleOutput } from './gradleOutput';
import { showError, showInfo } from '../ui/notifications';

export async function runDependencyInsight(workspaceRoot: string, moduleName: string): Promise<void> {
  const dependency = await vscode.window.showInputBox({
    prompt: 'Dependency coordinates (e.g., okhttp, com.squareup.okhttp3:okhttp)',
    placeHolder: 'com.squareup.okhttp3:okhttp',
  });
  if (!dependency) {
    return;
  }
  const configuration = await vscode.window.showInputBox({
    prompt: 'Configuration',
    placeHolder: 'debugRuntimeClasspath',
    value: 'debugRuntimeClasspath',
  }) || 'debugRuntimeClasspath';
  const task = `:${moduleName}:dependencyInsight`;
  const args = ['--dependency', dependency, '--configuration', configuration];
  const result = await runGradleTaskWithResult(workspaceRoot, task, args);
  showGradleOutput(`${task} ${args.join(' ')}`, result, workspaceRoot);
  result.exitCode === 0
    ? showInfo('Dependency insight completed.')
    : showError('Dependency insight failed. See output.');
}
