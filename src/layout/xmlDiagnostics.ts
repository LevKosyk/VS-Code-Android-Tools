import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { showInfo, showWarning, showError } from '../ui/notifications';

const HARD_CODED_TEXT_CODE = 'hardcodedText';
const MISSING_CONTENT_DESCRIPTION_CODE = 'missingContentDescription';
const MISSING_CONSTRAINTS_CODE = 'missingConstraints';

function isLayoutXmlDocument(document: vscode.TextDocument): boolean {
  return (
    document.languageId === 'xml' &&
    document.fileName.endsWith('.xml') &&
    document.fileName.includes(`${path.sep}res${path.sep}layout${path.sep}`)
  );
}

function isAnyAndroidXmlDocument(document: vscode.TextDocument): boolean {
  return (
    document.languageId === 'xml' &&
    document.fileName.endsWith('.xml') &&
    document.fileName.includes(`${path.sep}src${path.sep}`) &&
    document.fileName.includes(`${path.sep}res${path.sep}`)
  );
}

function normalizeResourceName(name: string): string {
  let next = name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!/^[a-z]/.test(next)) {
    next = `text_${next}`;
  }
  return next || 'new_text';
}

interface HardcodedTextEntry {
  attr: string;
  value: string;
  range: vscode.Range;
  suggestedName: string;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function findStringsXmlPath(documentPath: string): string {
  const marker = `${path.sep}src${path.sep}main${path.sep}res${path.sep}`;
  const markerIndex = documentPath.indexOf(marker);
  if (markerIndex >= 0) {
    const resRoot = documentPath.slice(0, markerIndex + marker.length - 1);
    return path.join(resRoot, 'values', 'strings.xml');
  }

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspaceRoot) {
    return path.join(workspaceRoot, 'app', 'src', 'main', 'res', 'values', 'strings.xml');
  }
  return path.join(path.dirname(documentPath), 'strings.xml');
}

function rangeFromMatchValue(document: vscode.TextDocument, fullMatch: string, fullIndex: number, value: string): vscode.Range {
  const valueWithQuotes = `"${value}"`;
  const innerOffset = fullMatch.indexOf(valueWithQuotes);
  const startOffset = innerOffset >= 0 ? fullIndex + innerOffset + 1 : fullIndex;
  const start = document.positionAt(startOffset);
  const end = document.positionAt(startOffset + value.length);
  return new vscode.Range(start, end);
}

function collectLayoutDiagnostics(document: vscode.TextDocument): vscode.Diagnostic[] {
  const diagnostics: vscode.Diagnostic[] = [];
  const text = document.getText();

  const hardcodedTextRegex = /android:(text|hint|contentDescription)\s*=\s*"([^"]+)"/g;
  let hardcodedMatch: RegExpExecArray | null;
  while ((hardcodedMatch = hardcodedTextRegex.exec(text)) !== null) {
    const attr = hardcodedMatch[1];
    const value = hardcodedMatch[2];
    if (
      value.startsWith('@string/') ||
      value.startsWith('@android:string/') ||
      value.startsWith('@{') ||
      value.startsWith('?')
    ) {
      continue;
    }
    const diagnostic = new vscode.Diagnostic(
      rangeFromMatchValue(document, hardcodedMatch[0], hardcodedMatch.index, value),
      `Hardcoded string in android:${attr}. Extract it to strings.xml.`,
      vscode.DiagnosticSeverity.Warning
    );
    diagnostic.code = HARD_CODED_TEXT_CODE;
    diagnostics.push(diagnostic);
  }

  const hasConstraintLayoutRoot = /<[^>]*ConstraintLayout\b/.test(text);

  const viewRegex = /<([A-Za-z0-9_.]+)\b([^>]*)\/?\s*>/g;
  let viewMatch: RegExpExecArray | null;
  while ((viewMatch = viewRegex.exec(text)) !== null) {
    const tagName = viewMatch[1];
    const attrs = viewMatch[2] || '';

    if (/^(ImageView|ImageButton|androidx\.appcompat\.widget\.AppCompatImageView)$/.test(tagName)) {
      const hasSource = /(android:src|app:srcCompat)\s*=\s*"[^"]+"/.test(attrs);
      const hasContentDescription = /android:contentDescription\s*=\s*"[^"]*"/.test(attrs);
      if (hasSource && !hasContentDescription) {
        const start = document.positionAt(viewMatch.index + 1);
        const end = document.positionAt(viewMatch.index + 1 + tagName.length);
        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(start, end),
          'Image view is missing android:contentDescription.',
          vscode.DiagnosticSeverity.Warning
        );
        diagnostic.code = MISSING_CONTENT_DESCRIPTION_CODE;
        diagnostics.push(diagnostic);
      }
    }

    if (hasConstraintLayoutRoot && /android:id\s*=\s*"@\+?id\//.test(attrs)) {
      const isRootConstraintLayout = /ConstraintLayout$/.test(tagName) && viewMatch.index === text.indexOf(viewMatch[0]);
      if (isRootConstraintLayout) {
        continue;
      }
      const hasAnyConstraint = /app:layout_constraint(Top|Bottom|Start|End|Left|Right|Baseline|Circle)[^=]*\s*=\s*"[^"]+"/.test(attrs);
      if (!hasAnyConstraint) {
        const start = document.positionAt(viewMatch.index + 1);
        const end = document.positionAt(viewMatch.index + 1 + tagName.length);
        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(start, end),
          'View has id but no ConstraintLayout constraints.',
          vscode.DiagnosticSeverity.Warning
        );
        diagnostic.code = MISSING_CONSTRAINTS_CODE;
        diagnostics.push(diagnostic);
      }
    }
  }

  return diagnostics;
}

function suggestResourceNameForMatch(text: string, matchIndex: number, value: string): string {
  const tagStart = text.lastIndexOf('<', matchIndex);
  const tagEnd = text.indexOf('>', matchIndex);
  if (tagStart >= 0 && tagEnd > tagStart) {
    const tagSlice = text.slice(tagStart, tagEnd + 1);
    const idMatch = /android:id\s*=\s*"@(?:\+)?id\/([A-Za-z0-9_]+)"/.exec(tagSlice);
    if (idMatch?.[1]) {
      return normalizeResourceName(`${idMatch[1]}_text`);
    }
  }
  return normalizeResourceName(value.slice(0, 40));
}

function collectHardcodedTextEntries(document: vscode.TextDocument): HardcodedTextEntry[] {
  const text = document.getText();
  const entries: HardcodedTextEntry[] = [];
  const hardcodedTextRegex = /android:(text|hint|contentDescription)\s*=\s*"([^"]+)"/g;
  let hardcodedMatch: RegExpExecArray | null;
  while ((hardcodedMatch = hardcodedTextRegex.exec(text)) !== null) {
    const attr = hardcodedMatch[1];
    const value = hardcodedMatch[2];
    if (
      value.startsWith('@string/') ||
      value.startsWith('@android:string/') ||
      value.startsWith('@{') ||
      value.startsWith('?')
    ) {
      continue;
    }
    entries.push({
      attr,
      value,
      range: rangeFromMatchValue(document, hardcodedMatch[0], hardcodedMatch.index, value),
      suggestedName: suggestResourceNameForMatch(text, hardcodedMatch.index, `${attr}_${value}`),
    });
  }
  return entries;
}

export class AndroidLayoutLintController implements vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection('android-layout-xml');
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    this.disposables.push(
      this.collection,
      vscode.workspace.onDidSaveTextDocument((document) => {
        const enabled = vscode.workspace.getConfiguration('androidToolkit').get<boolean>('xml.lintOnSave', true);
        if (!enabled || !isLayoutXmlDocument(document)) {
          return;
        }
        this.lintDocument(document);
      }),
      vscode.workspace.onDidCloseTextDocument((document) => {
        this.collection.delete(document.uri);
      })
    );

    for (const document of vscode.workspace.textDocuments) {
      if (isLayoutXmlDocument(document)) {
        this.lintDocument(document);
      }
    }
  }

  public lintDocument(document: vscode.TextDocument): void {
    if (!isLayoutXmlDocument(document)) {
      this.collection.delete(document.uri);
      return;
    }
    const diagnostics = collectLayoutDiagnostics(document);
    this.collection.set(document.uri, diagnostics);
  }

  public lintActiveEditor(): void {
    const doc = vscode.window.activeTextEditor?.document;
    if (!doc || !isLayoutXmlDocument(doc)) {
      showWarning('Open a layout XML file in res/layout first.');
      return;
    }
    this.lintDocument(doc);
    const count = this.collection.get(doc.uri)?.length ?? 0;
    showInfo(count === 0 ? 'Layout lint: no issues found.' : `Layout lint: found ${count} warning(s).`);
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}

export class AndroidXmlQuickFixProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    if (!isLayoutXmlDocument(document)) {
      return [];
    }

    const actions: vscode.CodeAction[] = [];
    for (const diagnostic of context.diagnostics) {
      const code = String(diagnostic.code || '');
      if (code === HARD_CODED_TEXT_CODE) {
        const action = new vscode.CodeAction('Extract to strings.xml', vscode.CodeActionKind.QuickFix);
        action.diagnostics = [diagnostic];
        action.command = {
          command: 'android-toolkit.extractStringResourceFromXml',
          title: 'Extract to strings.xml',
          arguments: [document.uri.toString(), diagnostic.range],
        };
        actions.push(action);
      }

      if (code === MISSING_CONTENT_DESCRIPTION_CODE) {
        const action = new vscode.CodeAction('Add contentDescription="@null"', vscode.CodeActionKind.QuickFix);
        action.diagnostics = [diagnostic];
        action.command = {
          command: 'android-toolkit.xmlFixMissingContentDescription',
          title: 'Add contentDescription="@null"',
          arguments: [document.uri.toString(), diagnostic.range],
        };
        actions.push(action);
      }

      if (code === MISSING_CONSTRAINTS_CODE) {
        const action = new vscode.CodeAction('Add start/top constraints to parent', vscode.CodeActionKind.QuickFix);
        action.diagnostics = [diagnostic];
        action.command = {
          command: 'android-toolkit.xmlFixMissingConstraints',
          title: 'Add start/top constraints to parent',
          arguments: [document.uri.toString(), diagnostic.range],
        };
        actions.push(action);
      }
    }

    return actions;
  }
}

async function resolveEditorForUri(uriString?: string): Promise<vscode.TextEditor | undefined> {
  if (!uriString) {
    return vscode.window.activeTextEditor;
  }
  const uri = vscode.Uri.parse(uriString);
  const current = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === uri.toString());
  if (current) {
    return current;
  }
  const document = await vscode.workspace.openTextDocument(uri);
  return vscode.window.showTextDocument(document, { preserveFocus: true, preview: false });
}

function readExistingStringNames(stringsXmlPath: string): Set<string> {
  if (!fs.existsSync(stringsXmlPath)) {
    return new Set<string>();
  }
  const text = fs.readFileSync(stringsXmlPath, 'utf8');
  const names = new Set<string>();
  const regex = /<string\s+name\s*=\s*"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    names.add(match[1]);
  }
  return names;
}

function nextUniqueName(base: string, taken: Set<string>): string {
  let candidate = normalizeResourceName(base);
  if (!taken.has(candidate)) {
    taken.add(candidate);
    return candidate;
  }
  let index = 2;
  while (taken.has(`${candidate}_${index}`)) {
    index += 1;
  }
  const unique = `${candidate}_${index}`;
  taken.add(unique);
  return unique;
}

function findAttributeValueRangeAtPosition(document: vscode.TextDocument, position: vscode.Position): vscode.Range | undefined {
  const line = document.lineAt(position.line).text;
  const quoteRegex = /"([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = quoteRegex.exec(line)) !== null) {
    const absoluteStart = new vscode.Position(position.line, match.index + 1);
    const absoluteEnd = new vscode.Position(position.line, match.index + 1 + match[1].length);
    if (position.isAfterOrEqual(absoluteStart) && position.isBeforeOrEqual(absoluteEnd)) {
      return new vscode.Range(absoluteStart, absoluteEnd);
    }
  }
  return undefined;
}

function upsertStringResource(stringsXmlPath: string, resourceName: string, value: string): { ok: boolean; message?: string } {
  const parentDir = path.dirname(stringsXmlPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  let content = fs.existsSync(stringsXmlPath)
    ? fs.readFileSync(stringsXmlPath, 'utf8')
    : '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n</resources>\n';

  const duplicatePattern = new RegExp(`<string\\s+name\\s*=\\s*"${resourceName}"\\s*>`, 'm');
  if (duplicatePattern.test(content)) {
    return { ok: false, message: `string resource "${resourceName}" already exists.` };
  }

  const closeTagIndex = content.lastIndexOf('</resources>');
  if (closeTagIndex < 0) {
    content = `${content.trim()}\n</resources>\n`;
  }

  const insertAt = content.lastIndexOf('</resources>');
  const entry = `    <string name="${resourceName}">${escapeXml(value)}</string>\n`;
  const next = `${content.slice(0, insertAt)}${entry}${content.slice(insertAt)}`;
  fs.writeFileSync(stringsXmlPath, next, 'utf8');
  return { ok: true };
}

export async function extractStringResourceFromXml(uriString?: string, range?: vscode.Range): Promise<void> {
  const editor = await resolveEditorForUri(uriString);
  if (!editor) {
    showError('No active XML editor found.');
    return;
  }

  const document = editor.document;
  if (!isAnyAndroidXmlDocument(document)) {
    showWarning('Open an Android XML file first.');
    return;
  }

  let targetRange = range;
  if (!targetRange || targetRange.isEmpty) {
    if (!editor.selection.isEmpty) {
      targetRange = editor.selection;
    } else {
      targetRange = findAttributeValueRangeAtPosition(document, editor.selection.active);
    }
  }

  const stringsXmlPath = findStringsXmlPath(document.fileName);
  const takenNames = readExistingStringNames(stringsXmlPath);

  if (targetRange && !targetRange.isEmpty) {
    const originalText = document.getText(targetRange).trim();
    if (!originalText || originalText.startsWith('@string/')) {
      showWarning('Nothing to extract.');
      return;
    }

    const entries = collectHardcodedTextEntries(document);
    const contextual = entries.find(e => e.range.isEqual(targetRange));
    const defaultName = contextual?.suggestedName || normalizeResourceName(originalText.slice(0, 30));
    const resourceName = await vscode.window.showInputBox({
      title: 'Extract to strings.xml',
      prompt: 'Enter resource name',
      value: nextUniqueName(defaultName, takenNames),
      validateInput: (value) => (/^[a-z][a-z0-9_]*$/.test(value.trim()) ? undefined : 'Use lowercase a-z, 0-9 and _. Must start with a letter.'),
    });
    if (!resourceName) {
      return;
    }

    const saveResult = upsertStringResource(stringsXmlPath, resourceName.trim(), originalText);
    if (!saveResult.ok) {
      showWarning(saveResult.message || 'Unable to update strings.xml.');
      return;
    }

    await editor.edit((editBuilder) => {
      editBuilder.replace(targetRange!, `@string/${resourceName.trim()}`);
    });
    showInfo(`Extracted text to ${path.basename(stringsXmlPath)} as ${resourceName.trim()}.`);
    return;
  }

  await extractAllHardcodedStringsFromLayout(uriString);
}

export async function extractAllHardcodedStringsFromLayout(uriString?: string): Promise<void> {
  return extractAllHardcodedStringsFromLayoutWithMode(uriString, false);
}

async function extractAllHardcodedStringsFromLayoutWithMode(uriString: string | undefined, autoSelectAll: boolean): Promise<void> {
  const editor = await resolveEditorForUri(uriString);
  if (!editor) {
    showError('No active XML editor found.');
    return;
  }
  const document = editor.document;
  if (!isLayoutXmlDocument(document)) {
    showWarning('Open a layout XML file in res/layout first.');
    return;
  }

  const entries = collectHardcodedTextEntries(document);
  if (entries.length === 0) {
    showInfo('No hardcoded android:text/android:hint/android:contentDescription values found.');
    return;
  }

  let pickedIndices: number[] = [];
  if (autoSelectAll) {
    pickedIndices = entries.map((_, index) => index);
  } else {
    const picked = await vscode.window.showQuickPick(
      entries.map((entry, index) => ({
        label: entry.value,
        description: `android:${entry.attr} → @string/${entry.suggestedName}`,
        detail: `Line ${entry.range.start.line + 1}`,
        index,
        picked: true,
      })),
      {
        title: 'Extract hardcoded strings',
        placeHolder: 'Select entries to extract to strings.xml',
        canPickMany: true,
      }
    );
    if (!picked || picked.length === 0) {
      return;
    }
    pickedIndices = picked.map(p => p.index);
  }

  const stringsXmlPath = findStringsXmlPath(document.fileName);
  const takenNames = readExistingStringNames(stringsXmlPath);

  const chosen = pickedIndices
    .map(index => entries[index])
    .map(entry => ({
      ...entry,
      resourceName: nextUniqueName(entry.suggestedName, takenNames),
    }));

  for (const entry of chosen) {
    const saveResult = upsertStringResource(stringsXmlPath, entry.resourceName, entry.value);
    if (!saveResult.ok) {
      showWarning(saveResult.message || `Unable to write ${entry.resourceName}.`);
      return;
    }
  }

  const ordered = [...chosen].sort((a, b) => {
    if (a.range.start.line !== b.range.start.line) {
      return b.range.start.line - a.range.start.line;
    }
    return b.range.start.character - a.range.start.character;
  });

  await editor.edit((editBuilder) => {
    for (const entry of ordered) {
      editBuilder.replace(entry.range, `@string/${entry.resourceName}`);
    }
  });

  showInfo(`Extracted ${chosen.length} string(s) to ${path.basename(stringsXmlPath)}.`);
}

function insertAttributeOnLine(
  lineText: string,
  attributeSnippet: string
): string {
  if (lineText.includes(attributeSnippet.split('=')[0])) {
    return lineText;
  }
  const selfCloseIndex = lineText.lastIndexOf('/>');
  const closeIndex = lineText.lastIndexOf('>');
  const at = selfCloseIndex >= 0 ? selfCloseIndex : closeIndex;
  if (at < 0) {
    return lineText;
  }
  return `${lineText.slice(0, at)} ${attributeSnippet}${lineText.slice(at)}`;
}

export async function fixAllLayoutWarningsInFile(uriString?: string): Promise<void> {
  const editor = await resolveEditorForUri(uriString);
  if (!editor) {
    showError('No active XML editor found.');
    return;
  }
  const document = editor.document;
  if (!isLayoutXmlDocument(document)) {
    showWarning('Open a layout XML file in res/layout first.');
    return;
  }

  const diagnostics = collectLayoutDiagnostics(document);
  const needsContentDescription = new Set<number>();
  const needsConstraints = new Set<number>();
  let hardcodedCount = 0;

  for (const d of diagnostics) {
    const code = String(d.code || '');
    if (code === MISSING_CONTENT_DESCRIPTION_CODE) {
      needsContentDescription.add(d.range.start.line);
    }
    if (code === MISSING_CONSTRAINTS_CODE) {
      needsConstraints.add(d.range.start.line);
    }
    if (code === HARD_CODED_TEXT_CODE) {
      hardcodedCount += 1;
    }
  }

  const linesToUpdate = new Set<number>([...needsContentDescription, ...needsConstraints]);
  if (linesToUpdate.size > 0) {
    await editor.edit((editBuilder) => {
      const orderedLines = [...linesToUpdate].sort((a, b) => b - a);
      for (const lineNumber of orderedLines) {
        const line = document.lineAt(lineNumber);
        let next = line.text;
        if (needsContentDescription.has(lineNumber)) {
          next = insertAttributeOnLine(next, 'android:contentDescription="@null"');
        }
        if (needsConstraints.has(lineNumber)) {
          next = insertAttributeOnLine(next, 'app:layout_constraintStart_toStartOf="parent"');
          next = insertAttributeOnLine(next, 'app:layout_constraintTop_toTopOf="parent"');
        }
        if (next !== line.text) {
          editBuilder.replace(line.range, next);
        }
      }
    });
  }

  if (hardcodedCount > 0) {
    await extractAllHardcodedStringsFromLayoutWithMode(uriString, true);
  }

  const fixedCount = linesToUpdate.size + hardcodedCount;
  if (fixedCount === 0) {
    showInfo('No layout warnings to fix.');
  } else {
    showInfo(`Applied fixes for ${fixedCount} layout warning(s).`);
  }
}

export async function fixMissingContentDescription(uriString?: string, range?: vscode.Range): Promise<void> {
  const editor = await resolveEditorForUri(uriString);
  if (!editor) {
    return;
  }
  const document = editor.document;
  if (!isLayoutXmlDocument(document)) {
    showWarning('Open a layout XML file first.');
    return;
  }

  const lineNumber = range?.start.line ?? editor.selection.active.line;
  const line = document.lineAt(lineNumber);
  const text = line.text;
  const closingOffset = text.lastIndexOf('/>');
  const fallbackOffset = text.lastIndexOf('>');
  const insertOffset = closingOffset >= 0 ? closingOffset : fallbackOffset;
  if (insertOffset < 0) {
    return;
  }

  const insertPosition = new vscode.Position(lineNumber, insertOffset);
  await editor.edit((editBuilder) => {
    editBuilder.insert(insertPosition, ' android:contentDescription="@null"');
  });
}

export async function fixMissingConstraints(uriString?: string, range?: vscode.Range): Promise<void> {
  const editor = await resolveEditorForUri(uriString);
  if (!editor) {
    return;
  }
  const document = editor.document;
  if (!isLayoutXmlDocument(document)) {
    showWarning('Open a layout XML file first.');
    return;
  }

  const lineNumber = range?.start.line ?? editor.selection.active.line;
  const line = document.lineAt(lineNumber);
  const text = line.text;
  const closingOffset = text.lastIndexOf('/>');
  const fallbackOffset = text.lastIndexOf('>');
  const insertOffset = closingOffset >= 0 ? closingOffset : fallbackOffset;
  if (insertOffset < 0) {
    return;
  }

  const insertPosition = new vscode.Position(lineNumber, insertOffset);
  await editor.edit((editBuilder) => {
    editBuilder.insert(
      insertPosition,
      ' app:layout_constraintStart_toStartOf="parent" app:layout_constraintTop_toTopOf="parent"'
    );
  });
}
