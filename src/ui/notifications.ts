import * as vscode from 'vscode';
import { AndroidToolsError } from '../core/errors';

let output: vscode.OutputChannel | undefined;
type NotificationMode = 'quiet' | 'normal';
type NotificationCategory = 'run' | 'gradle' | 'device' | 'logcat' | 'tips';
const NOTICE_COOLDOWN_MS = 12000;
const lastShown = new Map<string, number>();
const CATEGORY_KEYS: NotificationCategory[] = ['run', 'gradle', 'device', 'logcat', 'tips'];

function getNotificationMode(): NotificationMode {
  const mode = vscode.workspace.getConfiguration('androidToolkit').get<string>('notifications.mode', 'quiet');
  return mode === 'normal' ? 'normal' : 'quiet';
}
function canShow(kind: 'info' | 'warn' | 'error', message: string): boolean {
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
function isLowSignalInfo(message: string): boolean {
  const text = message.toLowerCase();
  if (/failed|error|warning|not found|missing|offline|unauthorized/.test(text)) {
    return false;
  }
  return /(opened|saved|copied|created|deleted|cleared|refreshed|updated|applied|executed|completed|finished|started|stopped|loaded)/.test(text);
}
function inferCategory(message: string, fallback: NotificationCategory = 'tips'): NotificationCategory {
  const text = message.toLowerCase();
  if (/logcat|adb logcat/.test(text)) {
    return 'logcat';
  }
  if (/gradle|assemble|installapk|build tools|task/.test(text)) {
    return 'gradle';
  }
  if (/device|emulator|avd|adb|phone|simulator/.test(text)) {
    return 'device';
  }
  if (/run|launch|start app|stop app/.test(text)) {
    return 'run';
  }
  return fallback;
}
function categoryEnabled(category: NotificationCategory): boolean {
  const cfg = vscode.workspace.getConfiguration('androidToolkit');
  return cfg.get<boolean>(`notifications.channels.${category}`, true);
}
function errorsOnlyEnabled(): boolean {
  return vscode.workspace.getConfiguration('androidToolkit').get<boolean>('notifications.channels.errorsOnly', false);
}
function shouldEmit(level: 'INFO' | 'WARN' | 'ERROR', category: NotificationCategory): boolean {
  if (level === 'ERROR') {
    return true;
  }
  if (errorsOnlyEnabled()) {
    return false;
  }
  return categoryEnabled(category);
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

export function showInfo(message: string, category?: NotificationCategory): void {
  const resolved = category || inferCategory(message, 'tips');
  logLine('INFO', message);
  if (!shouldEmit('INFO', resolved)) {
    return;
  }
  if (getNotificationMode() === 'quiet' && isLowSignalInfo(message)) {
    return;
  }
  if (!canShow('info', message)) {
    return;
  }
  vscode.window.setStatusBarMessage(`Android Tools: ${message}`, 2500);
}
export function showWarning(message: string, category?: NotificationCategory): void {
  const resolved = category || inferCategory(message, 'tips');
  logLine('WARN', message);
  if (!shouldEmit('WARN', resolved)) {
    return;
  }
  if (getNotificationMode() === 'normal' && canShow('warn', message)) {
    vscode.window.showWarningMessage(message);
    return;
  }
  if (!canShow('warn', message)) {
    return;
  }
  vscode.window.setStatusBarMessage(`Android Tools: ${message}`, 4500);
}
export function showError(message: string, category?: NotificationCategory): void {
  const resolved = category || inferCategory(message, 'tips');
  const prefix = resolved === 'tips' ? '' : `[${resolved}] `;
  const text = `${prefix}${message}`;
  logLine('ERROR', text);
  if (shouldPopupError() && canShow('error', text)) {
    vscode.window.showErrorMessage(text);
  } else {
    if (!canShow('error', text)) {
      return;
    }
    vscode.window.setStatusBarMessage(`Android Tools error: ${text}`, 6500);
  }
}
export type ActionableErrorAction = {
  label: string;
  action: () => Promise<void> | void;
};
export type ActionableErrorPayload = {
  title: string;
  why?: string;
  suggestions?: string[];
  fixCommands?: string[];
  actions?: ActionableErrorAction[];
};
function commandsFromSuggestions(suggestions: string[]): string[] {
  const found = new Set<string>();
  for (const item of suggestions) {
    const text = item || '';
    const inline = text.match(/`([^`]+)`/g) || [];
    for (const token of inline) {
      const candidate = token.replace(/`/g, '').trim();
      if (candidate) {
        found.add(candidate);
      }
    }
    const lineCandidate = text.match(/\b(?:\.\/gradlew|gradle|sdkmanager|adb|export\s+JAVA_HOME=)[^.;]*/);
    if (lineCandidate?.[0]) {
      found.add(lineCandidate[0].trim());
    }
  }
  return Array.from(found).slice(0, 6);
}
export async function showActionableError(payload: ActionableErrorPayload): Promise<void> {
  const why = payload.why?.trim();
  const suggestions = (payload.suggestions || []).filter(Boolean).map(s => s.trim()).filter(Boolean);
  const fixCommands = (payload.fixCommands || []).map(c => c.trim()).filter(Boolean);
  const inferredCommands = fixCommands.length > 0 ? fixCommands : commandsFromSuggestions(suggestions);
  const compactMessage = [payload.title.trim(), why ? `Why: ${why}` : ''].filter(Boolean).join(' | ');
  logLine('ERROR', compactMessage);
  suggestions.forEach(s => logLine('ERROR', `Suggestion: ${s}`));
  inferredCommands.forEach(command => logLine('ERROR', `Fix command: ${command}`));

  if (!shouldPopupError()) {
    if (!canShow('error', payload.title)) {
      return;
    }
    vscode.window.setStatusBarMessage(`Android Tools error: ${payload.title}`, 6500);
    return;
  }
  if (!canShow('error', compactMessage)) {
    return;
  }

  const actionEntries = (payload.actions || []).slice(0, 2);
  const actionLabels = actionEntries.map(a => a.label);
  const copyAction = inferredCommands.length > 0 ? 'Copy Fix Command' : '';
  const secondaryAction = suggestions.length > 0 ? 'Show Suggestions' : '';
  const picked = await vscode.window.showErrorMessage(
    payload.title,
    ...[...actionLabels, copyAction, secondaryAction].filter(Boolean)
  );
  const idx = picked ? actionLabels.indexOf(picked) : -1;
  if (idx >= 0) {
    await actionEntries[idx].action();
    return;
  }
  if (picked === copyAction) {
    let selectedCommand = inferredCommands[0];
    if (inferredCommands.length > 1) {
      const commandPick = await vscode.window.showQuickPick(
        inferredCommands.map(command => ({ label: command })),
        { placeHolder: 'Select command to copy' }
      );
      selectedCommand = commandPick?.label || '';
    }
    if (selectedCommand) {
      await vscode.env.clipboard.writeText(selectedCommand);
      vscode.window.setStatusBarMessage('Android Tools: Fix command copied to clipboard.', 2500);
    }
    return;
  }
  if (picked === secondaryAction) {
    const doc = await vscode.workspace.openTextDocument({
      content: [
        '# Android Tools Fix Suggestions',
        '',
        ...suggestions.map(s => `- ${s}`),
        inferredCommands.length > 0 ? '' : '',
        inferredCommands.length > 0 ? '## Ready Commands' : '',
        ...inferredCommands.map(command => `- \`${command}\``),
      ].filter(Boolean).join('\n'),
      language: 'markdown',
    });
    await vscode.window.showTextDocument(doc, { preview: false });
  }
}
export function showToolkitError(error: AndroidToolsError): void {
  const fullMessage = error.toNotification();
  logLine('ERROR', fullMessage);
  if (shouldPopupError() && canShow('error', fullMessage)) {
    vscode.window.showErrorMessage(fullMessage);
  } else {
    if (!canShow('error', fullMessage)) {
      return;
    }
    vscode.window.setStatusBarMessage(`Android Tools error: ${fullMessage}`, 6500);
  }
}
export async function showErrorWithDetails(
  message: string,
  details: string
): Promise<void> {
  if (!shouldPopupError()) {
    logLine('ERROR', `${message} | details available in output`);
    if (!canShow('error', message)) {
      return;
    }
    vscode.window.setStatusBarMessage(`Android Tools error: ${message}`, 6500);
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
export function notificationCategories(): NotificationCategory[] {
  return [...CATEGORY_KEYS];
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
