import * as vscode from 'vscode';

export class LayoutPreviewPanel {
  public static currentPanel: LayoutPreviewPanel | undefined;
  private static readonly viewType = 'androidLayoutPreview';
  private readonly panel: vscode.WebviewPanel;

  private constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;
  }

  public static createOrShow(xml: string, title: string): LayoutPreviewPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;
    if (LayoutPreviewPanel.currentPanel) {
      LayoutPreviewPanel.currentPanel.panel.reveal(column);
      LayoutPreviewPanel.currentPanel.panel.title = `Layout Preview: ${title}`;
      LayoutPreviewPanel.currentPanel.render(xml);
      return LayoutPreviewPanel.currentPanel;
    }
    const panel = vscode.window.createWebviewPanel(
      LayoutPreviewPanel.viewType,
      `Layout Preview: ${title}`,
      column || vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    LayoutPreviewPanel.currentPanel = new LayoutPreviewPanel(panel);
    LayoutPreviewPanel.currentPanel.render(xml);
    return LayoutPreviewPanel.currentPanel;
  }

  private render(xml: string): void {
    const escaped = JSON.stringify(xml);
    this.panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Layout Preview</title>
  <style>
    :root {
      --bg: #f6f7fb;
      --fg: #222;
      --border: #d0d5dd;
    }
    body { font-family: system-ui, sans-serif; background: var(--bg); color: var(--fg); padding: 12px; }
    .canvas { background: #fff; border: 1px solid var(--border); padding: 12px; border-radius: 8px; }
    .node { border: 1px dashed #c2c7d0; padding: 8px; margin: 6px 0; border-radius: 6px; }
    .label { font-size: 12px; color: #555; margin-bottom: 4px; }
    .row { display: flex; gap: 6px; align-items: center; }
    .textview { padding: 6px 8px; border: 1px solid #e2e8f0; border-radius: 4px; background: #f8fafc; }
    .button { padding: 6px 10px; border: 1px solid #94a3b8; border-radius: 6px; background: #e2e8f0; }
    .image { width: 80px; height: 50px; background: #e5e7eb; border: 1px solid #cbd5e1; border-radius: 4px; }
    .linear.horizontal > .node-children { display: flex; gap: 8px; }
  </style>
</head>
<body>
  <div class="canvas" id="root"></div>
  <script>
    const xml = ${escaped};
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const root = doc.documentElement;
    const host = document.getElementById('root');
    function getAttr(node, name) {
      return node.getAttribute('android:' + name) || node.getAttribute(name) || '';
    }
    function renderNode(node) {
      const tag = node.tagName;
      const wrapper = document.createElement('div');
      wrapper.className = 'node';
      const label = document.createElement('div');
      label.className = 'label';
      const id = getAttr(node, 'id');
      label.textContent = tag + (id ? ' #' + id.replace('@+id/', '') : '');
      wrapper.appendChild(label);
      const content = document.createElement('div');
      content.className = 'node-children';
      if (tag.endsWith('TextView')) {
        const el = document.createElement('div');
        el.className = 'textview';
        el.textContent = getAttr(node, 'text') || 'TextView';
        content.appendChild(el);
      } else if (tag.endsWith('Button')) {
        const el = document.createElement('button');
        el.className = 'button';
        el.textContent = getAttr(node, 'text') || 'Button';
        content.appendChild(el);
      } else if (tag.endsWith('ImageView')) {
        const el = document.createElement('div');
        el.className = 'image';
        content.appendChild(el);
      }
      const children = Array.from(node.children || []);
      if (children.length > 0) {
        children.forEach(child => content.appendChild(renderNode(child)));
      }
      const orientation = getAttr(node, 'orientation');
      if (tag.endsWith('LinearLayout') && orientation === 'horizontal') {
        wrapper.classList.add('linear', 'horizontal');
      }
      wrapper.appendChild(content);
      return wrapper;
    }
    if (root) {
      host.appendChild(renderNode(root));
    } else {
      host.textContent = 'Invalid XML';
    }
  </script>
</body>
</html>`;
  }
}
