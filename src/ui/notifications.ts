/**
 * VS Code Notifications
 * User notification helpers with consistent formatting
 */

import * as vscode from 'vscode';
import { AndroidToolkitError } from '../core/errors';

/**
 * Show an information notification
 */
export function showInfo(message: string): void {
  vscode.window.showInformationMessage(message);
}

/**
 * Show a warning notification
 */
export function showWarning(message: string): void {
  vscode.window.showWarningMessage(message);
}

/**
 * Show an error notification
 */
export function showError(message: string): void {
  vscode.window.showErrorMessage(message);
}

/**
 * Show error from AndroidToolkitError with actionable message
 */
export function showToolkitError(error: AndroidToolkitError): void {
  const fullMessage = error.toNotification();
  vscode.window.showErrorMessage(fullMessage);
}

/**
 * Show error with optional "Show Details" button
 */
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

/**
 * Show progress notification for long-running operations
 */
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

/**
 * Show progress with cancellation support
 */
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
