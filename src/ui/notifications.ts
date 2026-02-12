import * as vscode from 'vscode';
import { AndroidToolsError } from '../core/errors';

let output: vscode.OutputChannel | undefined;
type NotificationMode = 'quiet' | 'normal';
const NOTICE_COOLDOWN_MS = 12000;
const lastShown = new Map<string, number>();

function getNotificationMode(): NotificationMode {
  const mode = vscode.workspace.getConfiguration('androidToolkit').get<string>('notifications.mode', 'quiet');
  return mode === 'normal' ? 'normal' : 'quiet';
}
function canShow(kind: 'warn' | 'error', message: string): boolean {
  const key = `${kind}:${message}`;
  const now = Date.now();
  const prev = lastShown.get(key) || 0;
  if (now - prev < NOTICE_COOLDOWN_MS) {
    return false;
  }
  lastShown.set(key, now);
  return true;
}
function shouldPopupError(): boolean {
  return getNotificationMode() === 'normal';
}

function channel(): vscode.OutputChannel {
  if (!output) {
    output = vscode.window.createOutputChannel('Android Tools');
  }
  return output;
}

function logLine(level: 'INFO' | 'WARN' | 'ERROR', message: string): void {
  const ts = new Date().toISOString();
  channel().appendLine(`[${ts}] [${level}] ${message}`);
}

export function showInfo(message: string): void {
  logLine('INFO', message);
  vscode.window.setStatusBarMessage(`Android Tools: ${message}`, 4000);
}
export function showWarning(message: string): void {
  logLine('WARN', message);
  if (getNotificationMode() === 'normal' && canShow('warn', message)) {
    vscode.window.showWarningMessage(message);
    return;
  }
  vscode.window.setStatusBarMessage(`Android Tools: ${message}`, 6000);
}
export function showError(message: string): void {
  logLine('ERROR', message);
  if (shouldPopupError() && canShow('error', message)) {
    vscode.window.showErrorMessage(message);
  } else {
    vscode.window.setStatusBarMessage(`Android Tools error: ${message}`, 8000);
  }
}
export function showToolkitError(error: AndroidToolsError): void {
  const fullMessage = error.toNotification();
  logLine('ERROR', fullMessage);
  if (shouldPopupError() && canShow('error', fullMessage)) {
    vscode.window.showErrorMessage(fullMessage);
  } else {
    vscode.window.setStatusBarMessage(`Android Tools error: ${fullMessage}`, 8000);
  }
}
export async function showErrorWithDetails(
  message: string,
  details: string
): Promise<void> {
  if (!shouldPopupError()) {
    logLine('ERROR', `${message} | details available in output`);
    vscode.window.setStatusBarMessage(`Android Tools error: ${message}`, 8000);
    channel().appendLine(details);
    return;
  }
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
      location: vscode.ProgressLocation.Window,
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
      location: vscode.ProgressLocation.Window,
      title,
      cancellable: true,
    },
    task
  );
}
