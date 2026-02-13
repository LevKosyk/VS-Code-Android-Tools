import * as path from 'path';
import * as vscode from 'vscode';
import { LayoutPreviewPanel } from './layoutPreviewPanel';

function isLayoutXmlDocument(document: vscode.TextDocument): boolean {
  return (
    document.languageId === 'xml' &&
    document.fileName.endsWith('.xml') &&
    document.fileName.includes(`${path.sep}res${path.sep}layout${path.sep}`)
  );
}

export class AndroidLayoutXmlCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(document: vscode.TextDocument): vscode.ProviderResult<vscode.CompletionItem[]> {
    if (!isLayoutXmlDocument(document)) {
      return [];
    }
    const snippets: vscode.CompletionItem[] = [];

    const textView = new vscode.CompletionItem('TextView (android)', vscode.CompletionItemKind.Snippet);
    textView.insertText = new vscode.SnippetString(
      '<TextView\n' +
      '    android:id="@+id/${1:textView}"\n' +
      '    android:layout_width="wrap_content"\n' +
      '    android:layout_height="wrap_content"\n' +
      '    android:text="${2:Text}" />'
    );
    snippets.push(textView);

    const button = new vscode.CompletionItem('Button (android)', vscode.CompletionItemKind.Snippet);
    button.insertText = new vscode.SnippetString(
      '<Button\n' +
      '    android:id="@+id/${1:button}"\n' +
      '    android:layout_width="wrap_content"\n' +
      '    android:layout_height="wrap_content"\n' +
      '    android:text="${2:Button}" />'
    );
    snippets.push(button);

    const constraintChild = new vscode.CompletionItem('Constraint Item', vscode.CompletionItemKind.Snippet);
    constraintChild.insertText = new vscode.SnippetString(
      '<TextView\n' +
      '    android:id="@+id/${1:title}"\n' +
      '    android:layout_width="wrap_content"\n' +
      '    android:layout_height="wrap_content"\n' +
      '    android:text="${2:Title}"\n' +
      '    app:layout_constraintTop_toTopOf="parent"\n' +
      '    app:layout_constraintStart_toStartOf="parent" />'
    );
    snippets.push(constraintChild);

    const attrs = [
      ['android:layout_width', 'android:layout_width="${1|match_parent,wrap_content,0dp|}"'],
      ['android:layout_height', 'android:layout_height="${1|match_parent,wrap_content,0dp|}"'],
      ['android:padding', 'android:padding="${1:16dp}"'],
      ['android:margin', 'android:layout_margin="${1:8dp}"'],
      ['android:text', 'android:text="${1:text}"'],
      ['android:id', 'android:id="@+id/${1:viewId}"'],
      ['tools:text', 'tools:text="${1:Preview text}"'],
      ['tools:visibility', 'tools:visibility="${1|visible,invisible,gone|}"'],
      ['tools:src', 'tools:src="@drawable/${1:preview_image}"'],
      ['tools:background', 'tools:background="@color/${1:preview_color}"'],
      ['tools:ignore', 'tools:ignore="${1|MissingConstraints,ContentDescription,HardcodedText|}"'],
    ];
    for (const [label, body] of attrs) {
      const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Property);
      item.insertText = new vscode.SnippetString(body);
      snippets.push(item);
    }
    return snippets;
  }
}

export async function generateConstraintSetSnippetFromSelection(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isLayoutXmlDocument(editor.document)) {
    vscode.window.showWarningMessage('Open a res/layout XML file first.');
    return;
  }
  const selected = editor.document.getText(editor.selection).trim();
  if (!selected) {
    vscode.window.showWarningMessage('Select one or more XML views first.');
    return;
  }
  const ids = new Set<string>();
  const regex = /android:id\s*=\s*"@(?:\+)?id\/([A-Za-z0-9_]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(selected)) !== null) {
    ids.add(match[1]);
  }
  if (ids.size === 0) {
    vscode.window.showWarningMessage('No android:id found in selection.');
    return;
  }

  const sorted = Array.from(ids).sort((a, b) => a.localeCompare(b));
  const lines: string[] = [];
  lines.push('val set = ConstraintSet()');
  lines.push('set.clone(binding.root as ConstraintLayout)');
  lines.push('');
  for (const id of sorted) {
    lines.push(`// ${id}`);
    lines.push(`set.clear(R.id.${id})`);
    lines.push(`set.connect(R.id.${id}, ConstraintSet.START, ConstraintSet.PARENT_ID, ConstraintSet.START)`);
    lines.push(`set.connect(R.id.${id}, ConstraintSet.TOP, ConstraintSet.PARENT_ID, ConstraintSet.TOP)`);
    lines.push('');
  }
  lines.push('set.applyTo(binding.root as ConstraintLayout)');

  const doc = await vscode.workspace.openTextDocument({
    language: 'kotlin',
    content: lines.join('\n'),
  });
  await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.Beside });
}

export class XmlLivePreviewController implements vscode.Disposable {
  private enabled = false;
  private readonly disposables: vscode.Disposable[] = [];
  private debounceTimer: NodeJS.Timeout | undefined;

  constructor() {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (!this.enabled || !isLayoutXmlDocument(e.document)) {
          return;
        }
        this.scheduleRender(e.document);
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (!this.enabled || !editor || !isLayoutXmlDocument(editor.document)) {
          return;
        }
        this.render(editor.document);
      })
    );
  }

  public async openOnceFromActiveEditor(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !isLayoutXmlDocument(editor.document)) {
      vscode.window.setStatusBarMessage('Android Tools: Open a res/layout XML file first.', 4000);
      return;
    }
    this.render(editor.document);
  }

  public async toggle(): Promise<void> {
    this.enabled = !this.enabled;
    if (this.enabled) {
      vscode.window.setStatusBarMessage('Android Tools: XML live preview enabled', 4000);
      await this.openOnceFromActiveEditor();
      return;
    }
    vscode.window.setStatusBarMessage('Android Tools: XML live preview disabled', 4000);
  }

  private scheduleRender(document: vscode.TextDocument): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => this.render(document), 220);
  }

  private render(document: vscode.TextDocument): void {
    LayoutPreviewPanel.createOrShow(
      document.getText(),
      path.basename(document.fileName),
      vscode.ViewColumn.Beside
    );
  }

  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
