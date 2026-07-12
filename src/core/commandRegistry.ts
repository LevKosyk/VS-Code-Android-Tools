import * as vscode from 'vscode';

type CommandCallback = (...args: any[]) => any;

const registeredCommandIds = new Set<string>();

/**
 * Registers an Android Tools command and fails immediately on duplicate IDs.
 * Duplicate registrations are otherwise easy to miss in a large extension and
 * result in non-deterministic activation failures for users.
 */
export function registerCommand(
  command: string,
  callback: CommandCallback,
  thisArg?: any
): vscode.Disposable {
  if (registeredCommandIds.has(command)) {
    throw new Error(`Android Tools command registered twice: ${command}`);
  }
  registeredCommandIds.add(command);
  const disposable = vscode.commands.registerCommand(command, callback, thisArg);
  return new vscode.Disposable(() => {
    registeredCommandIds.delete(command);
    disposable.dispose();
  });
}
