import * as vscode from 'vscode';
import { AndroidToolsError } from '../core/errors';
export function showInfo(message: string): void {
  vscode.window.showInformationMessage(message);
}
export function showWarning(message: string): void {
  vscode.window.showWarningMessage(message);
}
export function showError(message: string): void {
  vscode.window.showErrorMessage(message);
}
export function showToolkitError(error: AndroidToolsError): void {
  const fullMessage = error.toNotification();
  vscode.window.showErrorMessage(fullMessage);
}
export async function showErrorWithDetails(
  message: string,
  details: string
): Promise<void> {
  const action = await vscode.window.showErrorMessage(
    message,
    'Show Details'
  );
  if (action === 'Show Details') {
    const doc = await vscode.workspace.openTextDocument({
      content: details,
      language: 'text',
    });
    await vscode.window.showTextDocument(doc);
  }
}
export async function withProgress<T>(
  title: string,
  task: (progress: vscode.Progress<{ message?: string }>) => Promise<T>
): Promise<T> {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title,
      cancellable: false,
    },
    task
  );
}
export async function withCancellableProgress<T>(
  title: string,
  task: (
    progress: vscode.Progress<{ message?: string }>,
    token: vscode.CancellationToken
  ) => Promise<T>
): Promise<T | undefined> {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title,
      cancellable: true,
    },
    task
  );
}
