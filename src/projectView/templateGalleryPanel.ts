import * as vscode from 'vscode';

export type TemplateGalleryHandlers = {
  createProjectFromTemplate: (template: 'views-empty' | 'views-bottom-nav' | 'compose-empty') => Promise<void>;
};

export class TemplateGalleryPanel {
  private static current: TemplateGalleryPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly handlers: TemplateGalleryHandlers;

  private constructor(panel: vscode.WebviewPanel, handlers: TemplateGalleryHandlers) {
    this.panel = panel;
    this.handlers = handlers;
    this.panel.webview.html = this.html();
    this.panel.webview.onDidReceiveMessage((m) => this.onMessage(m));
    this.panel.onDidDispose(() => {
      if (TemplateGalleryPanel.current === this) {
        TemplateGalleryPanel.current = undefined;
      }
    });
  }

  public static createOrShow(handlers: TemplateGalleryHandlers): void {
    if (TemplateGalleryPanel.current) {
      TemplateGalleryPanel.current.panel.reveal(vscode.ViewColumn.One);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'androidTemplateGallery',
      'Android Template Gallery',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    TemplateGalleryPanel.current = new TemplateGalleryPanel(panel, handlers);
  }

  private async onMessage(message: { type?: string; template?: string }): Promise<void> {
    if (message.type !== 'create' || !message.template) {
      return;
    }
    const t = message.template as 'views-empty' | 'views-bottom-nav' | 'compose-empty';
    await this.handlers.createProjectFromTemplate(t);
  }

  private html(): string {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<style>
body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 14px; }
.grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.card { border: 1px solid var(--vscode-widget-border); border-radius: 12px; padding: 12px; background: color-mix(in srgb, var(--vscode-editor-background) 92%, #22c55e22); }
.title { font-weight: 700; margin-bottom: 6px; }
.meta { font-size: 12px; opacity: 0.85; min-height: 42px; }
.preview { width: 100%; border-radius: 8px; border: 1px solid var(--vscode-widget-border); margin-bottom: 8px; display: block; }
.caps { font-size: 12px; padding-left: 16px; margin: 0; min-height: 64px; }
.caps li { margin-bottom: 2px; }
button { margin-top: 10px; border: 1px solid var(--vscode-widget-border); background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-radius: 8px; padding: 6px 10px; cursor: pointer; }
@media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
</style>
</head>
<body>
  <h2>Android Template Gallery</h2>
  <p>Choose a starter template and generate a new Android project.</p>
  <div class="grid">
    <div class="card">
      <img class="preview" src="https://raw.githubusercontent.com/LevKosyk/Android-Tools/main/assets/gifs/file-system.gif" alt="Views Empty preview" />
      <div class="title">Views: Empty Activity</div>
      <div class="meta">Clean starter with AppCompat and XML layout. Good default for classic Android UI.</div>
      <ul class="caps">
        <li>AppCompat Activity starter</li>
        <li>ConstraintLayout XML screen</li>
        <li>Minimal Gradle setup</li>
      </ul>
      <button data-template="views-empty">Create Project</button>
    </div>
    <div class="card">
      <img class="preview" src="https://raw.githubusercontent.com/LevKosyk/Android-Tools/main/assets/gifs/run-panel.gif" alt="Bottom navigation preview" />
      <div class="title">Views: Bottom Navigation</div>
      <div class="meta">Starter with BottomNavigationView and constraint-based layout structure.</div>
      <ul class="caps">
        <li>BottomNavigationView wiring</li>
        <li>Menu XML generated</li>
        <li>Multi-tab starter shell</li>
      </ul>
      <button data-template="views-bottom-nav">Create Project</button>
    </div>
    <div class="card">
      <img class="preview" src="https://raw.githubusercontent.com/LevKosyk/Android-Tools/main/assets/gifs/xml-live-preview.gif" alt="Compose preview" />
      <div class="title">Compose: Empty Activity</div>
      <div class="meta">Kotlin + Compose starter for modern declarative Android UI workflow.</div>
      <ul class="caps">
        <li>Kotlin-first setup</li>
        <li>Compose activity scaffold</li>
        <li>Ready for previews and state UI</li>
      </ul>
      <button data-template="compose-empty">Create Project</button>
    </div>
  </div>
<script>
const vscode = acquireVsCodeApi();
for (const btn of document.querySelectorAll('button[data-template]')) {
  btn.addEventListener('click', () => {
    vscode.postMessage({ type: 'create', template: btn.getAttribute('data-template') });
  });
}
</script>
</body>
</html>`;
  }
}
