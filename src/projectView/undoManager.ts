import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export type UndoItem = {
  from: string;
  to: string;
};

export type UndoEntry = {
  label: string;
  items: UndoItem[];
};

const undoStack: UndoEntry[] = [];
const MAX_UNDO_ITEMS = 25;

export function pushUndoEntry(entry: UndoEntry): void {
  undoStack.push(entry);
  while (undoStack.length > MAX_UNDO_ITEMS) {
    undoStack.shift();
  }
}

export function hasUndoEntry(): boolean {
  return undoStack.length > 0;
}

export async function undoLastEntry(): Promise<UndoEntry | undefined> {
  const entry = undoStack.pop();
  if (!entry) {
    return undefined;
  }
  for (const item of entry.items) {
    await fs.promises.mkdir(path.dirname(item.to), { recursive: true });
    await vscode.workspace.fs.rename(vscode.Uri.file(item.from), vscode.Uri.file(item.to), { overwrite: false });
  }
  return entry;
}
