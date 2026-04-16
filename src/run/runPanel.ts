import * as vscode from 'vscode';
import { getWebviewThemeStyle } from '../ui/webviewTheme';

export interface RunFixSuggestion {
  id: string;
  label: string;
}

export interface RunActionResult {
  success: boolean;
  message: string;
  gradleError?: string;
  fixSuggestions?: RunFixSuggestion[];
  errorLocation?: { file: string; line: number; column?: number };
  installDiff?: { title: string; lines: string[] };
}

export interface RunHistoryEntry {
  id: string;
  label: string;
  moduleName: string;
  variant: string;
  deviceId: string;
  timestamp: number;
}

export interface RunPanelHandlers {
  getDevices: () => Promise<Array<{ id: string; label: string; type: string }>>;
  getModules: () => Promise<string[]>;
  getVariants: (moduleName: string) => Promise<{ variants: string[]; selected: string; flavors: string[]; buildTypes: string[]; selectedFlavor: string; selectedBuildType: string }>;
  getLaunchTargets: (moduleName: string) => Promise<Array<{ id: string; label: string; type: 'launcher' | 'activity' | 'deepLink'; activity?: string; deepLink?: string }>>;
  setLaunchTarget: (moduleName: string, launchTargetId: string) => Promise<void>;
  setVariant: (moduleName: string, variant: string) => Promise<void>;
  setFlavor: (moduleName: string, flavor: string) => Promise<void>;
  setBuildType: (moduleName: string, buildType: string) => Promise<void>;
  build: (moduleName: string, deviceId: string) => Promise<RunActionResult>;
  install: (moduleName: string, deviceId: string, options?: { installDiffMode?: boolean }) => Promise<RunActionResult>;
  run: (moduleName: string, deviceId: string, options?: {
    launchTargetId?: string;
    installDiffMode?: boolean;
    preRunPipeline?: { clean: boolean; assemble: boolean; install: boolean; run: boolean };
  }) => Promise<RunActionResult>;
  stop: (moduleName: string, deviceId: string) => Promise<RunActionResult>;
  clean: () => Promise<RunActionResult>;
  getHistory: () => Promise<RunHistoryEntry[]>;
  rerunHistory: (historyId: string) => Promise<RunActionResult>;
  runPreset: (presetId: string, moduleName: string) => Promise<RunActionResult>;
  applyFix: (fixId: string, moduleName: string, deviceId: string) => Promise<RunActionResult>;
  getHealth: (context?: { moduleName?: string; deviceId?: string; variant?: string }) => Promise<{
    state: 'ok' | 'warning' | 'error';
    message: string;
    score?: number;
    recommendations?: Array<{ label: string; actionId: string }>;
  }>;
  quickAction: (actionId: string, moduleName: string, deviceId: string) => Promise<RunActionResult>;
  getUiConfig: () => Promise<{ mode: 'beginner' | 'standard' | 'power'; runActions: string[]; shortcuts?: Record<string, string> }>;
  getModuleRunRule: (moduleName: string) => Promise<{ defaultDeviceId?: string; defaultVariant?: string; preRunPipeline?: { clean: boolean; assemble: boolean; install: boolean; run: boolean } } | undefined>;
  saveModuleRunRule: (rule: { moduleName: string; defaultDeviceId?: string; defaultVariant?: string; preRunPipeline?: { clean: boolean; assemble: boolean; install: boolean; run: boolean } }) => Promise<void>;
  launchIntent: (
    moduleName: string,
    deviceId: string,
    payload: { action?: string; category?: string; dataUri?: string; flags?: string; extras?: string }
  ) => Promise<RunActionResult>;
  getTimeline: () => Promise<Array<{ id: string; at: number; action: string; stage: string; status: 'running' | 'success' | 'failed'; moduleName: string; variant: string; deviceId: string; durationMs?: number; message?: string }>>;
}

export class RunPanel {
  public static currentPanel: RunPanel | undefined;
  public static isVisible = false;
  private static readonly viewType = 'androidRunPanel';
  private readonly panel: vscode.WebviewPanel;
  private readonly handlers: RunPanelHandlers;
  private disposables: vscode.Disposable[] = [];
  private readonly pendingByType = new Map<string, object>();
  private flushTimer: NodeJS.Timeout | undefined;
  private readonly batchedTypes = new Set(['history', 'timeline', 'status', 'health']);

  private constructor(panel: vscode.WebviewPanel, handlers: RunPanelHandlers) {
    this.panel = panel;
    this.handlers = handlers;
    this.panel.webview.html = this.getHtml();
    this.panel.webview.onDidReceiveMessage(
      message => this.handleMessage(message),
      null,
      this.disposables
    );
    this.panel.onDidChangeViewState((e) => {
      RunPanel.isVisible = e.webviewPanel.visible;
    }, null, this.disposables);
    RunPanel.isVisible = this.panel.visible;
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  public static createOrShow(handlers: RunPanelHandlers): RunPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;
    if (RunPanel.currentPanel) {
      RunPanel.currentPanel.panel.reveal(column);
      return RunPanel.currentPanel;
    }
    const panel = vscode.window.createWebviewPanel(
      RunPanel.viewType,
      'Android Run',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );
    RunPanel.currentPanel = new RunPanel(panel, handlers);
    return RunPanel.currentPanel;
  }

  private async handleMessage(message: { type: string; [key: string]: unknown }): Promise<void> {
    const type = typeof message?.type === 'string' ? message.type : '';
    try {
      switch (type) {
      case 'getDevices': {
        const devices = await this.handlers.getDevices();
        this.postMessage({ type: 'devices', devices });
        break;
      }
      case 'getModules': {
        const modules = await this.handlers.getModules();
        this.postMessage({ type: 'modules', modules });
        break;
      }
      case 'getVariants': {
        const moduleName = String(message.moduleName || '');
        const payload = await this.handlers.getVariants(moduleName);
        this.postMessage({ type: 'variants', moduleName, ...payload });
        break;
      }
      case 'getLaunchTargets': {
        const moduleName = String(message.moduleName || '');
        const launchTargets = await this.handlers.getLaunchTargets(moduleName);
        this.postMessage({ type: 'launchTargets', moduleName, launchTargets });
        break;
      }
      case 'setLaunchTarget': {
        const moduleName = String(message.moduleName || '');
        const launchTargetId = String(message.launchTargetId || '');
        if (moduleName && launchTargetId) {
          await this.handlers.setLaunchTarget(moduleName, launchTargetId);
        }
        break;
      }
      case 'setVariant': {
        const moduleName = String(message.moduleName || '');
        const variant = String(message.variant || '');
        if (moduleName && variant) {
          await this.handlers.setVariant(moduleName, variant);
        }
        break;
      }
      case 'setFlavor': {
        const moduleName = String(message.moduleName || '');
        const flavor = String(message.flavor || '');
        if (moduleName) {
          await this.handlers.setFlavor(moduleName, flavor);
        }
        break;
      }
      case 'setBuildType': {
        const moduleName = String(message.moduleName || '');
        const buildType = String(message.buildType || '');
        if (moduleName && buildType) {
          await this.handlers.setBuildType(moduleName, buildType);
        }
        break;
      }
      case 'getModuleRunRule': {
        const moduleName = String(message.moduleName || '');
        const rule = await this.handlers.getModuleRunRule(moduleName);
        this.postMessage({ type: 'moduleRunRule', moduleName, rule });
        break;
      }
      case 'saveModuleRunRule': {
        const moduleName = String(message.moduleName || '');
        const defaultDeviceId = String(message.defaultDeviceId || '');
        const defaultVariant = String(message.defaultVariant || '');
        const preRunPipelineRaw = message.preRunPipeline as { clean?: unknown; assemble?: unknown; install?: unknown; run?: unknown } | undefined;
        if (moduleName) {
          await this.handlers.saveModuleRunRule({
            moduleName,
            defaultDeviceId: defaultDeviceId || undefined,
            defaultVariant: defaultVariant || undefined,
            preRunPipeline: {
              clean: Boolean(preRunPipelineRaw?.clean),
              assemble: Boolean(preRunPipelineRaw?.assemble),
              install: preRunPipelineRaw ? Boolean(preRunPipelineRaw.install) : true,
              run: preRunPipelineRaw ? Boolean(preRunPipelineRaw.run) : true,
            },
          });
        }
        break;
      }
      case 'launchIntent': {
        const moduleName = String(message.moduleName || '');
        const deviceId = String(message.deviceId || '');
        const result = await this.handlers.launchIntent(moduleName, deviceId, {
          action: String(message.action || ''),
          category: String(message.category || ''),
          dataUri: String(message.dataUri || ''),
          flags: String(message.flags || ''),
          extras: String(message.extras || ''),
        });
        this.postMessage({ type: 'result', action: 'launchIntent', ...result });
        break;
      }
      case 'getTimeline': {
        const timeline = await this.handlers.getTimeline();
        this.postMessage({ type: 'timeline', timeline });
        break;
      }
      case 'getHealth': {
        const moduleName = String(message.moduleName || '');
        const deviceId = String(message.deviceId || '');
        const variant = String(message.variant || '');
        const health = await this.handlers.getHealth({ moduleName, deviceId, variant });
        this.postMessage({ type: 'health', health });
        break;
      }
      case 'build': {
        const moduleName = String(message.moduleName || '');
        const deviceId = String(message.deviceId || '');
        const result = await this.handlers.build(moduleName, deviceId);
        this.postMessage({ type: 'result', action: 'build', ...result });
        break;
      }
      case 'install': {
        const moduleName = String(message.moduleName || '');
        const deviceId = String(message.deviceId || '');
        const installDiffMode = Boolean(message.installDiffMode);
        const result = await this.handlers.install(moduleName, deviceId, { installDiffMode });
        this.postMessage({ type: 'result', action: 'install', ...result });
        break;
      }
      case 'run': {
        const moduleName = String(message.moduleName || '');
        const deviceId = String(message.deviceId || '');
        const launchTargetId = typeof message.launchTargetId === 'string' ? message.launchTargetId : undefined;
        const installDiffMode = Boolean(message.installDiffMode);
        const preRunPipelineRaw = message.preRunPipeline as { clean?: unknown; assemble?: unknown; install?: unknown; run?: unknown } | undefined;
        const result = await this.handlers.run(moduleName, deviceId, {
          launchTargetId,
          installDiffMode,
          preRunPipeline: {
            clean: Boolean(preRunPipelineRaw?.clean),
            assemble: Boolean(preRunPipelineRaw?.assemble),
            install: preRunPipelineRaw ? Boolean(preRunPipelineRaw.install) : true,
            run: preRunPipelineRaw ? Boolean(preRunPipelineRaw.run) : true,
          },
        });
        this.postMessage({ type: 'result', action: 'run', ...result });
        break;
      }
      case 'stop': {
        const moduleName = String(message.moduleName || '');
        const deviceId = String(message.deviceId || '');
        const result = await this.handlers.stop(moduleName, deviceId);
        this.postMessage({ type: 'result', action: 'stop', ...result });
        break;
      }
      case 'clean': {
        const result = await this.handlers.clean();
        this.postMessage({ type: 'result', action: 'clean', ...result });
        break;
      }
      case 'getHistory': {
        const history = await this.handlers.getHistory();
        this.postMessage({ type: 'history', history });
        break;
      }
      case 'rerunHistory': {
        const historyId = String(message.historyId || '');
        const result = await this.handlers.rerunHistory(historyId);
        this.postMessage({ type: 'result', action: 'rerun', ...result });
        break;
      }
      case 'runPreset': {
        const presetId = String(message.presetId || '');
        const moduleName = String(message.moduleName || '');
        const result = await this.handlers.runPreset(presetId, moduleName);
        this.postMessage({ type: 'result', action: 'preset', ...result });
        break;
      }
      case 'applyFix': {
        const fixId = String(message.fixId || '');
        const moduleName = String(message.moduleName || '');
        const deviceId = String(message.deviceId || '');
        const result = await this.handlers.applyFix(fixId, moduleName, deviceId);
        this.postMessage({ type: 'result', action: 'fix', ...result });
        const [devices, modules] = await Promise.all([
          this.handlers.getDevices(),
          this.handlers.getModules(),
        ]);
        this.postMessage({ type: 'devices', devices });
        this.postMessage({ type: 'modules', modules });
        break;
      }
      case 'quickAction': {
        const actionId = String(message.actionId || '');
        const moduleName = String(message.moduleName || '');
        const deviceId = String(message.deviceId || '');
        const result = await this.handlers.quickAction(actionId, moduleName, deviceId);
        this.postMessage({ type: 'result', action: 'quickAction', ...result });
        break;
      }
      case 'openGradleOutput': {
        await vscode.commands.executeCommand('android-toolkit.showGradleOutput');
        break;
      }
      case 'releaseQualityGate': {
        await vscode.commands.executeCommand('android-toolkit.releaseQualityGate');
        this.postMessage({
          type: 'result',
          action: 'releaseQualityGate',
          success: true,
          message: 'Release quality gate finished.',
        });
        break;
      }
      case 'openErrorLocation': {
        const file = String(message.file || '');
        const line = Number(message.line || 1);
        const column = Number(message.column || 1);
        if (!file) {
          break;
        }
        const uri = vscode.Uri.file(file);
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc, { preview: false });
        const pos = new vscode.Position(Math.max(0, line - 1), Math.max(0, column - 1));
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos));
        break;
      }
      case 'copyErrorContext': {
        const moduleName = String(message.moduleName || '').trim() || '(not selected)';
        const variant = String(message.variant || '').trim() || '(not selected)';
        const deviceId = String(message.deviceId || '').trim() || '(not selected)';
        const errorSummary = String(message.errorSummary || '').trim() || '(no error details)';
        const file = String(message.file || '').trim();
        const line = Number(message.line || 0);
        const column = Number(message.column || 0);
        const context = [
          'Android Tools Error Context',
          `Time: ${new Date().toISOString()}`,
          `Module: ${moduleName}`,
          `Variant: ${variant}`,
          `Device: ${deviceId}`,
          `Error: ${errorSummary}`,
          file ? `Location: ${file}${line > 0 ? `:${line}${column > 0 ? `:${column}` : ''}` : ''}` : '',
        ].filter(Boolean).join('\n');
        await vscode.env.clipboard.writeText(context);
        this.postMessage({ type: 'result', action: 'copyErrorContext', success: true, message: 'Error context copied to clipboard.' });
        break;
      }
      case 'refresh': {
        const [devices, modules, history, health, uiConfig, timeline] = await Promise.all([
          this.handlers.getDevices(),
          this.handlers.getModules(),
          this.handlers.getHistory(),
          this.handlers.getHealth(),
          this.handlers.getUiConfig(),
          this.handlers.getTimeline(),
        ]);
        this.postMessage({ type: 'devices', devices });
        this.postMessage({ type: 'modules', modules });
        if (modules[0]) {
          const launchTargets = await this.handlers.getLaunchTargets(modules[0]);
          this.postMessage({ type: 'launchTargets', moduleName: modules[0], launchTargets });
        }
        this.postMessage({ type: 'history', history });
        this.postMessage({ type: 'timeline', timeline });
        this.postMessage({ type: 'health', health });
        this.postMessage({ type: 'config', config: uiConfig });
        break;
      }
      default:
        this.postMessage({
          type: 'result',
          action: 'protocol',
          success: false,
          message: `Unsupported panel action: ${type || 'unknown'}`,
        });
        break;
      }
    } catch (error) {
      this.postMessage({
        type: 'result',
        action: 'protocol',
        success: false,
        message: error instanceof Error ? error.message : 'Panel action failed',
      });
    }
  }

  private postMessage(message: object): void {
    const type = (message as { type?: string }).type;
    if (!type || !this.batchedTypes.has(type)) {
      this.panel.webview.postMessage(message);
      return;
    }
    this.pendingByType.set(type, message);
    if (this.flushTimer) {
      return;
    }
    this.flushTimer = setTimeout(() => {
      const queue = Array.from(this.pendingByType.values());
      this.pendingByType.clear();
      this.flushTimer = undefined;
      for (const item of queue) {
        this.panel.webview.postMessage(item);
      }
    }, 70);
  }

  private getHtml(): string {
    const themeVars = getWebviewThemeStyle();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Android Run</title>
  <style>
    ${themeVars}
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --border: var(--vscode-widget-border);
      --input-bg: var(--vscode-input-background);
      --input-fg: var(--vscode-input-foreground);
      --btn-bg: var(--vscode-button-background);
      --btn-fg: var(--vscode-button-foreground);
      --muted: var(--vscode-descriptionForeground);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--vscode-font-family); font-size: var(--at-font-size, 13px); background: var(--bg); color: var(--fg); padding: var(--at-space-3); }
    .row { display: flex; gap: var(--at-space-2); align-items: center; }
    .col { display: flex; flex-direction: column; gap: var(--at-space-1); }
    .col label { font-size: var(--at-type-label); font-weight: 600; color: var(--muted); }
    .card { border: 1px solid var(--border); border-radius: var(--at-radius-md); padding: var(--at-space-3); margin-bottom: var(--at-space-3); }
    .title { font-weight: 700; margin-bottom: var(--at-space-2); font-size: var(--at-type-section); }
    select, input, textarea, button {
      font-family: inherit;
      font-size: calc(var(--at-font-size, 13px) - 1px);
      padding: var(--at-control-padding-y, 7px) var(--at-control-padding-x, 10px);
      border: 1px solid var(--border);
      border-radius: var(--at-radius-sm);
      background: var(--input-bg);
      color: var(--input-fg);
      min-height: 32px;
    }
    textarea { resize: vertical; min-height: 56px; }
    button { background: var(--btn-bg); color: var(--btn-fg); border: none; cursor: pointer; font-weight: 600; min-height: var(--at-table-row-height, 34px); }
    button.btn-primary { background: var(--at-info); color: var(--at-info-contrast); }
    button.btn-secondary { background: transparent; border: 1px solid var(--border); color: var(--fg); }
    button.btn-tertiary { background: transparent; border: 1px dashed var(--border); color: var(--muted); font-weight: 500; }
    button:hover { opacity: 0.92; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    button:focus-visible, select:focus-visible, input:focus-visible {
      outline: 2px solid var(--vscode-focusBorder);
      outline-offset: 1px;
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--vscode-focusBorder) 22%, transparent);
    }
    button.secondary { background: transparent; border: 1px solid var(--border); color: var(--fg); }
    .flow-steps { color: var(--muted); margin-bottom: var(--at-space-2); font-size: var(--at-type-helper); }
    .flow-run { min-width: 140px; }
    .status { color: var(--muted); margin-top: var(--at-space-2); border-radius: var(--at-radius-sm); border: 1px solid var(--border); padding: var(--at-space-2) var(--at-space-3); min-height: 36px; display: flex; align-items: center; gap: var(--at-space-2); font-size: var(--at-type-label); }
    .status.info { border-color: var(--at-info); background: var(--at-info-bg); }
    .status.warn { border-color: var(--at-warn); background: var(--at-warn-bg); }
    .status.error { border-color: var(--at-error); background: var(--at-error-bg); }
    .status.success { border-color: var(--at-success); background: var(--at-success-bg); }
    .status-chip { display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; padding: 2px 10px; font-size: var(--at-type-helper); font-weight: 700; letter-spacing: 0.2px; min-width: 72px; border: 1px solid transparent; }
    .status-msg { font-size: var(--at-type-label); }
    .status.state-change { animation: statusPop 220ms ease-out; }
    .status.info .status-chip { color: var(--at-info-contrast); border-color: var(--at-info); background: var(--at-info-bg); }
    .status.warn .status-chip { color: var(--at-warn-contrast); border-color: var(--at-warn); background: var(--at-warn-bg); }
    .status.error .status-chip { color: var(--at-error-contrast); border-color: var(--at-error); background: var(--at-error-bg); }
    .status.success .status-chip { color: var(--at-success-contrast); border-color: var(--at-success); background: var(--at-success-bg); }
    .action-groups { display: grid; gap: var(--at-space-3); }
    .action-group { border: 1px solid var(--border); border-radius: var(--at-radius-sm); padding: var(--at-space-2); }
    .action-group-title { font-size: var(--at-type-label); font-weight: 700; margin-bottom: var(--at-space-2); }
    .action-group-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--at-space-2); }
    .action-group-row button { width: 100%; }
    .preset-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .pinned-row { display: flex; gap: var(--at-space-2); flex-wrap: wrap; margin-bottom: var(--at-space-2); }
    .pinned-row button { width: auto; }
    .preset-line { display: flex; gap: var(--at-space-2); align-items: center; margin-bottom: var(--at-space-2); }
    .preset-line:last-child { margin-bottom: 0; }
    .pin-btn { width: 34px; min-width: 34px; padding: 7px 0; text-align: center; }
    .history-tools { display: grid; grid-template-columns: 1fr 170px; gap: var(--at-space-2); margin-bottom: var(--at-space-2); }
    .history-tools input {
      font-family: inherit;
      font-size: 12px;
      padding: 7px 10px;
      border: 1px solid var(--border);
      border-radius: var(--at-radius-sm);
      background: var(--input-bg);
      color: var(--input-fg);
    }
    .history-list { border: 1px solid var(--border); border-radius: 8px; max-height: 130px; overflow: auto; }
    .history-item { padding: var(--at-space-2); min-height: var(--at-log-row-height, 24px); border-bottom: 1px solid var(--border); cursor: pointer; }
    .history-item:last-child { border-bottom: none; }
    .history-item:hover { background: #ffffff12; }
    .history-item.sel { background: #22c55e22; }
    .history-meta { color: var(--muted); font-size: var(--at-type-helper); margin-top: 3px; }
    .health { margin-top: var(--at-space-2); border-radius: var(--at-radius-sm); border: 1px solid var(--border); padding: var(--at-space-2) var(--at-space-3); font-size: var(--at-type-label); }
    .health.ok { color: var(--at-success-contrast); border-color: var(--at-success); background: var(--at-success-bg); }
    .health.warning { color: var(--at-warn-contrast); border-color: var(--at-warn); background: var(--at-warn-bg); }
    .health.error { color: var(--at-error-contrast); border-color: var(--at-error); background: var(--at-error-bg); }
    .error-box { margin-top: var(--at-space-2); border: 1px solid var(--at-error); background: var(--at-error-bg); border-radius: var(--at-radius-sm); padding: var(--at-space-2); display: none; }
    .error-box.visible { display: block; }
    .error-box.reveal { animation: errorReveal 220ms ease-out; }
    .error-title { color: var(--at-error-contrast); font-weight: 700; margin-bottom: var(--at-space-1); font-size: var(--at-type-label); }
    .error-text { color: var(--at-error-contrast); white-space: pre-wrap; font-family: var(--vscode-editor-font-family), monospace; font-size: var(--at-type-label); max-height: 140px; overflow: auto; margin-bottom: var(--at-space-2); }
    .error-actions { display: flex; gap: var(--at-space-2); justify-content: flex-end; flex-wrap: wrap; }
    .fix-row { display: flex; gap: var(--at-space-2); flex-wrap: wrap; margin-top: var(--at-space-2); }
    .fix-row button { width: auto; }
    .quick-row { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--at-space-2); }
    .quick-row button { width: 100%; }
    .hint-box { border: 1px dashed var(--border); border-radius: var(--at-radius-sm); padding: var(--at-space-2); margin-top: var(--at-space-2); display: none; }
    .hint-box.visible { display: block; }
    .hint-title { font-weight: 600; margin-bottom: var(--at-space-1); font-size: var(--at-type-label); }
    .hint-guided { display: flex; gap: var(--at-space-3); align-items: flex-start; }
    .hint-icon { width: 32px; height: 32px; border-radius: 999px; border: 1px solid var(--border); display: inline-flex; align-items: center; justify-content: center; font-size: var(--at-type-label); font-weight: 700; color: var(--muted); flex-shrink: 0; }
    .hint-content { flex: 1; min-width: 0; }
    .hint-actions { display: flex; gap: var(--at-space-2); flex-wrap: wrap; margin-top: var(--at-space-2); }
    .field-error { min-height: 16px; color: var(--at-error); font-size: var(--at-type-helper); }
    select.invalid { border-color: var(--at-error); }
    .toggle-row { display: flex; align-items: center; gap: var(--at-space-2); flex-wrap: wrap; margin-top: var(--at-space-2); }
    .toggle-row label { font-size: var(--at-type-helper); color: var(--muted); display: inline-flex; align-items: center; gap: 6px; }
    .toggle-row input[type="checkbox"] { width: 14px; height: 14px; accent-color: var(--at-info); }
    .pipeline-row { display: flex; align-items: center; gap: var(--at-space-2); flex-wrap: wrap; margin-top: var(--at-space-2); }
    .pipeline-chip { border: 1px solid var(--border); border-radius: 999px; padding: 4px 10px; font-size: var(--at-type-helper); color: var(--muted); }
    .pipeline-chip input { margin-right: 6px; }
    .diff-box { margin-top: var(--at-space-2); border: 1px solid var(--at-info); background: var(--at-info-bg); border-radius: var(--at-radius-sm); padding: var(--at-space-2); display: none; }
    .diff-box.visible { display: block; }
    .diff-title { font-size: var(--at-type-label); font-weight: 700; margin-bottom: var(--at-space-1); color: var(--at-info-contrast); }
    .diff-line { font-size: var(--at-type-helper); color: var(--at-info-contrast); margin-bottom: 3px; }
    .timeline-list { border: 1px solid var(--border); border-radius: var(--at-radius-sm); max-height: 180px; overflow: auto; }
    .timeline-item { padding: var(--at-space-2); border-bottom: 1px solid var(--border); font-size: var(--at-type-helper); }
    .timeline-item:last-child { border-bottom: none; }
    .timeline-item.fail { border-left: 3px solid var(--at-error); }
    .timeline-item.ok { border-left: 3px solid var(--at-success); }
    .timeline-meta { color: var(--muted); font-size: var(--at-type-helper); margin-top: 2px; }
    .sticky-header { position: sticky; top: 0; z-index: 20; background: var(--bg); padding-top: var(--at-space-2); }
    .empty-card { border: 1px dashed var(--border); border-radius: var(--at-radius-sm); padding: var(--at-space-3); display: flex; gap: var(--at-space-3); align-items: flex-start; }
    .empty-card-icon { width: 32px; height: 32px; border-radius: 999px; border: 1px solid var(--border); display: inline-flex; align-items: center; justify-content: center; color: var(--muted); font-weight: 700; flex-shrink: 0; }
    .empty-card-title { font-size: var(--at-type-label); font-weight: 700; margin-bottom: var(--at-space-1); }
    .empty-card-meta { color: var(--muted); font-size: var(--at-type-helper); margin-bottom: var(--at-space-2); }
    .empty-card-actions { display: flex; gap: var(--at-space-2); flex-wrap: wrap; }
    @keyframes statusPop {
      from { transform: scale(0.995); opacity: 0.85; }
      to { transform: scale(1); opacity: 1; }
    }
    @keyframes errorReveal {
      from { opacity: 0; transform: translateY(-3px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .kbd-hint { display: block; font-size: var(--at-type-helper); opacity: 0.82; font-weight: 500; margin-top: 1px; }
    .loading-skeleton {
      background: linear-gradient(90deg, transparent 0%, #ffffff22 50%, transparent 100%);
      background-size: 220% 100%;
      animation: atShimmer 1.1s infinite;
    }
    @keyframes atShimmer {
      from { background-position: 180% 0; }
      to { background-position: -40% 0; }
    }
    details.advanced { margin-bottom: var(--at-space-3); border: 1px solid var(--border); border-radius: var(--at-radius-md); padding: var(--at-space-2) var(--at-space-3); }
    details.advanced > summary { cursor: pointer; font-weight: 600; margin-bottom: var(--at-space-2); font-size: var(--at-type-label); }
    @media (max-width: 980px) {
      .action-group-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .preset-row { grid-template-columns: 1fr; }
      .quick-row { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }
  </style>
</head>
<body>
  <div class="card sticky-header" id="targetCard">
    <div class="title">Run Flow</div>
    <div class="flow-steps">Module → Device → Variant → Run</div>
    <div class="row">
      <div class="col" style="flex:1"><label>Module</label><select id="moduleSelect" aria-label="Module selector"></select><div id="moduleError" class="field-error"></div></div>
      <div class="col" style="flex:1"><label>Device</label><select id="deviceSelect" aria-label="Device selector"></select><div id="deviceError" class="field-error"></div></div>
      <div class="col" style="flex:1"><label>Variant</label><select id="variantSelect" aria-label="Variant selector"></select><div id="variantError" class="field-error"></div></div>
      <button id="runNowBtn" class="flow-run btn-primary" aria-label="Run now">Run</button>
      <button id="refreshBtn" class="btn-tertiary" aria-label="Refresh run panel">Refresh</button>
    </div>
    <div class="row" style="margin-top:8px;">
      <div class="col" style="flex:1"><label>Flavor</label><select id="flavorSelect" aria-label="Flavor selector"></select></div>
      <div class="col" style="flex:1"><label>Build Type</label><select id="buildTypeSelect" aria-label="Build type selector"></select></div>
      <div class="col" style="flex:2"><label>Launch Target</label><select id="launchTargetSelect" aria-label="Launch target selector"></select></div>
      <button id="refreshLaunchTargetsBtn" class="btn-tertiary" aria-label="Refresh launch targets">Reload Targets</button>
    </div>
    <div class="pipeline-row" role="group" aria-label="Pre-run pipeline">
      <span class="pipeline-chip"><label><input id="pipelineClean" type="checkbox">clean</label></span>
      <span class="pipeline-chip"><label><input id="pipelineAssemble" type="checkbox">assemble</label></span>
      <span class="pipeline-chip"><label><input id="pipelineInstall" type="checkbox" checked>install</label></span>
      <span class="pipeline-chip"><label><input id="pipelineRun" type="checkbox" checked>run</label></span>
    </div>
    <div class="toggle-row">
      <label><input id="installDiffMode" type="checkbox">Install diff mode (version/signature)</label>
    </div>
    <div id="status" class="status info" role="status" aria-live="polite">
      <span id="statusChip" class="status-chip">Idle</span>
      <span id="statusMessage" class="status-msg">Select target and run.</span>
    </div>
    <div id="installDiffBox" class="diff-box" role="status" aria-live="polite"></div>
    <div id="hintBox" class="hint-box">
      <div class="hint-guided">
        <div class="hint-icon" aria-hidden="true">i</div>
        <div class="hint-content">
          <div id="hintTitle" class="hint-title"></div>
          <div id="hintActions" class="hint-actions"></div>
        </div>
      </div>
    </div>
    <div id="health" class="health">Runtime health: checking...</div>
    <div id="errorBox" class="error-box" role="alert" aria-live="assertive">
      <div class="error-title">Gradle Error</div>
      <div id="errorText" class="error-text"></div>
      <div class="error-actions">
        <button id="copyErrorCtxBtn" class="btn-secondary">Copy Error Context</button>
        <button id="openErrLocationBtn" class="btn-secondary">Open Error Location</button>
        <button id="openGradleBtn" class="btn-secondary">Open Gradle Output</button>
      </div>
      <div id="fixRow" class="fix-row"></div>
    </div>
  </div>

  <details id="advancedSection" class="advanced">
    <summary>Advanced Tools</summary>

  <div class="card" id="actionsCard">
    <div class="title">Action Groups</div>
    <div class="action-groups">
      <div class="action-group">
        <div class="action-group-title">Run flow</div>
        <div class="action-group-row">
          <button id="runBtn" data-action-id="run" class="btn-primary" aria-label="Run app on selected device">Run</button>
          <button id="stopBtn" data-action-id="stop" class="btn-secondary" aria-label="Stop app on selected device">Stop</button>
          <button id="rerunBtn" class="btn-secondary">Re-run</button>
        </div>
      </div>
      <div class="action-group">
        <div class="action-group-title">Build/install ops</div>
        <div class="action-group-row">
          <button id="buildBtn" data-action-id="build" class="btn-tertiary" aria-label="Build selected variant">Build</button>
          <button id="installBtn" data-action-id="install" class="btn-secondary" aria-label="Install app on selected device">Install</button>
          <button id="cleanBtn" data-action-id="clean" class="btn-tertiary" aria-label="Clean project">Clean</button>
        </div>
      </div>
      <div class="action-group">
        <div class="action-group-title">Diagnostics/fixes</div>
        <div class="action-group-row">
          <button id="releaseGateBtn" data-action-id="releaseGate" class="btn-tertiary" aria-label="Run release quality gate">Release Gate</button>
          <button id="qaLogcatBtn" class="btn-tertiary">Logcat This App</button>
          <button id="qaCrashReproBtn" class="btn-secondary">Crash Repro</button>
          <button id="qaArtifactsBtn" class="btn-secondary">Export Artifacts</button>
          <button id="qaLastFailedBtn" class="btn-secondary">Open Last Failed</button>
          <button id="qaHealthBtn" class="btn-tertiary">Health Wizard</button>
          <button id="qaProjectDoctorBtn" class="btn-secondary">Project Doctor</button>
          <button id="qaCrashAnrTriageBtn" class="btn-secondary">Crash/ANR Triage</button>
          <button id="qaReleaseGateBtn" class="btn-tertiary">Run Full Gate</button>
        </div>
      </div>
    </div>
  </div>

  <div class="card" id="nextActionsCard">
    <div class="title">What Should I Do Next?</div>
    <div class="history-meta" style="margin-bottom:8px;">Recent actions stay pinned here. Team-recommended actions are always one click away.</div>
    <div class="row" style="align-items:flex-start; gap:12px; flex-wrap:wrap;">
      <div style="flex:1; min-width:260px;">
        <div class="action-group-title" style="margin-bottom:6px;">Recently Used</div>
        <div id="recentActions" class="pinned-row"></div>
      </div>
      <div style="flex:1; min-width:260px;">
        <div class="action-group-title" style="margin-bottom:6px;">Team Recommended</div>
        <div id="teamActions" class="pinned-row"></div>
      </div>
    </div>
  </div>

  <div class="card" id="presetsCard">
    <div class="title">Quick Presets</div>
    <div id="pinnedPresets" class="pinned-row"></div>
    <div class="preset-line">
      <button id="presetDebugEmuBtn">Debug on Emulator</button>
      <button id="pinDebugEmuBtn" class="btn-tertiary pin-btn" title="Pin preset">☆</button>
    </div>
    <div class="preset-line">
      <button id="presetReleaseDeviceBtn">Release on Device</button>
      <button id="pinReleaseDeviceBtn" class="btn-tertiary pin-btn" title="Pin preset">☆</button>
    </div>
  </div>

  <div class="card" id="moduleRulesCard">
    <div class="title">Per-Module Run Rules</div>
    <div class="row">
      <button id="saveRuleBtn" class="btn-secondary">Save Current As Module Rule</button>
      <button id="applyRuleBtn" class="btn-tertiary">Apply Module Rule</button>
    </div>
    <div class="history-meta">Stores default device, variant, and pre-run pipeline per module.</div>
  </div>

  <div class="card" id="intentCard">
    <div class="title">Intent Launcher</div>
    <div class="row">
      <div class="col" style="flex:1"><label>Action</label><input id="intentAction" placeholder="android.intent.action.VIEW" /></div>
      <div class="col" style="flex:1"><label>Category</label><input id="intentCategory" placeholder="android.intent.category.DEFAULT" /></div>
    </div>
    <div class="row">
      <div class="col" style="flex:1"><label>Data URI</label><input id="intentDataUri" placeholder="myapp://open/item/42" /></div>
      <div class="col" style="flex:1"><label>Flags (space-separated)</label><input id="intentFlags" placeholder="--activity-clear-top --activity-single-top" /></div>
    </div>
    <div class="row">
      <div class="col" style="flex:1"><label>Extras (key=value per line)</label><textarea id="intentExtras" rows="3" style="width:100%"></textarea></div>
    </div>
    <div class="row">
      <button id="launchIntentBtn" class="btn-secondary">Launch Intent</button>
    </div>
  </div>

  <div class="card" id="historyCard">
    <div class="title">Recent Runs</div>
    <div class="history-tools">
      <input id="historySearch" placeholder="Search module, variant, device" />
      <select id="historyFilter">
        <option value="all">All</option>
        <option value="module">This module</option>
        <option value="device">This device</option>
      </select>
    </div>
    <div id="historyList" class="history-list"></div>
  </div>

  <div class="card" id="timelineCard">
    <div class="title">Session Timeline</div>
    <div class="row">
      <button id="refreshTimelineBtn" class="btn-tertiary">Refresh Timeline</button>
    </div>
    <div id="timelineList" class="timeline-list"></div>
  </div>
  </details>

  <script>
    const vscode = acquireVsCodeApi();
    const moduleSelect = document.getElementById('moduleSelect');
    const deviceSelect = document.getElementById('deviceSelect');
    const variantSelect = document.getElementById('variantSelect');
    const flavorSelect = document.getElementById('flavorSelect');
    const buildTypeSelect = document.getElementById('buildTypeSelect');
    const launchTargetSelect = document.getElementById('launchTargetSelect');
    const refreshLaunchTargetsBtn = document.getElementById('refreshLaunchTargetsBtn');
    const installDiffMode = document.getElementById('installDiffMode');
    const pipelineClean = document.getElementById('pipelineClean');
    const pipelineAssemble = document.getElementById('pipelineAssemble');
    const pipelineInstall = document.getElementById('pipelineInstall');
    const pipelineRun = document.getElementById('pipelineRun');
    const moduleError = document.getElementById('moduleError');
    const deviceError = document.getElementById('deviceError');
    const variantError = document.getElementById('variantError');
    const runNowBtn = document.getElementById('runNowBtn');
    const statusEl = document.getElementById('status');
    const statusChipEl = document.getElementById('statusChip');
    const statusMessageEl = document.getElementById('statusMessage');
    const installDiffBox = document.getElementById('installDiffBox');
    const errorBox = document.getElementById('errorBox');
    const errorText = document.getElementById('errorText');
    const openGradleBtn = document.getElementById('openGradleBtn');
    const openErrLocationBtn = document.getElementById('openErrLocationBtn');
    const copyErrorCtxBtn = document.getElementById('copyErrorCtxBtn');
    const fixRow = document.getElementById('fixRow');
    const historyList = document.getElementById('historyList');
    const historySearch = document.getElementById('historySearch');
    const historyFilter = document.getElementById('historyFilter');
    const pinnedPresets = document.getElementById('pinnedPresets');
    const recentActions = document.getElementById('recentActions');
    const teamActions = document.getElementById('teamActions');
    const healthEl = document.getElementById('health');
    const hintBox = document.getElementById('hintBox');
    const hintTitle = document.getElementById('hintTitle');
    const hintActions = document.getElementById('hintActions');

    const buildBtn = document.getElementById('buildBtn');
    const installBtn = document.getElementById('installBtn');
    const runBtn = document.getElementById('runBtn');
    const stopBtn = document.getElementById('stopBtn');
    const cleanBtn = document.getElementById('cleanBtn');
    const releaseGateBtn = document.getElementById('releaseGateBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const rerunBtn = document.getElementById('rerunBtn');
    const pinDebugEmuBtn = document.getElementById('pinDebugEmuBtn');
    const pinReleaseDeviceBtn = document.getElementById('pinReleaseDeviceBtn');
    const qaLogcatBtn = document.getElementById('qaLogcatBtn');
    const qaCrashReproBtn = document.getElementById('qaCrashReproBtn');
    const qaArtifactsBtn = document.getElementById('qaArtifactsBtn');
    const qaLastFailedBtn = document.getElementById('qaLastFailedBtn');
    const qaHealthBtn = document.getElementById('qaHealthBtn');
    const qaProjectDoctorBtn = document.getElementById('qaProjectDoctorBtn');
    const qaCrashAnrTriageBtn = document.getElementById('qaCrashAnrTriageBtn');
    const qaReleaseGateBtn = document.getElementById('qaReleaseGateBtn');
    const saveRuleBtn = document.getElementById('saveRuleBtn');
    const applyRuleBtn = document.getElementById('applyRuleBtn');
    const intentAction = document.getElementById('intentAction');
    const intentCategory = document.getElementById('intentCategory');
    const intentDataUri = document.getElementById('intentDataUri');
    const intentFlags = document.getElementById('intentFlags');
    const intentExtras = document.getElementById('intentExtras');
    const launchIntentBtn = document.getElementById('launchIntentBtn');
    const refreshTimelineBtn = document.getElementById('refreshTimelineBtn');
    const timelineList = document.getElementById('timelineList');
    const presetsCard = document.getElementById('presetsCard');
    const moduleRulesCard = document.getElementById('moduleRulesCard');
    const intentCard = document.getElementById('intentCard');
    const historyCard = document.getElementById('historyCard');
    const timelineCard = document.getElementById('timelineCard');
    const advancedSection = document.getElementById('advancedSection');
    copyErrorCtxBtn.disabled = true;

    const actionButtonsById = {
      build: buildBtn,
      install: installBtn,
      run: runBtn,
      stop: stopBtn,
      clean: cleanBtn,
      releaseGate: releaseGateBtn,
    };
    let uiMode = 'standard';
    let shortcuts = {
      run: 'Enter',
      stop: 'Mod+Shift+S',
      rerun: 'Mod+R',
      releaseGate: 'Mod+Shift+G',
      refresh: 'Mod+Shift+R',
    };
    const buttonBaseLabels = new Map([
      [runNowBtn, 'Run'],
      [runBtn, 'Run'],
      [stopBtn, 'Stop'],
      [releaseGateBtn, 'Release Gate'],
      [qaReleaseGateBtn, 'Release Gate'],
      [rerunBtn, 'Re-run'],
      [refreshBtn, 'Refresh'],
    ]);
    function setButtonHint(btn, label, hint) {
      if (!btn) return;
      const safeHint = hint || '';
      if (!safeHint) {
        btn.textContent = label;
        return;
      }
      btn.innerHTML = label + '<span class=\"kbd-hint\">' + safeHint + '</span>';
    }
    function applyShortcutHints() {
      setButtonHint(runNowBtn, buttonBaseLabels.get(runNowBtn) || 'Run', shortcuts.run);
      setButtonHint(runBtn, buttonBaseLabels.get(runBtn) || 'Run', shortcuts.run);
      setButtonHint(stopBtn, buttonBaseLabels.get(stopBtn) || 'Stop', shortcuts.stop);
      setButtonHint(releaseGateBtn, buttonBaseLabels.get(releaseGateBtn) || 'Release Gate', shortcuts.releaseGate);
      setButtonHint(qaReleaseGateBtn, buttonBaseLabels.get(qaReleaseGateBtn) || 'Release Gate', shortcuts.releaseGate);
      setButtonHint(rerunBtn, buttonBaseLabels.get(rerunBtn) || 'Re-run', shortcuts.rerun);
      setButtonHint(refreshBtn, buttonBaseLabels.get(refreshBtn) || 'Refresh', shortcuts.refresh);
    }

    function applyUiConfig(config) {
      const nextMode = (config && typeof config.mode === 'string') ? config.mode : 'standard';
      uiMode = nextMode;
      if (config && config.shortcuts && typeof config.shortcuts === 'object') {
        shortcuts = {
          ...shortcuts,
          ...config.shortcuts,
        };
        applyShortcutHints();
      }
      const actions = Array.isArray(config && config.runActions) ? config.runActions.filter(v => typeof v === 'string') : [];
      const allowed = ['build', 'install', 'run', 'stop', 'clean', 'releaseGate'];
      const visible = actions.length
        ? actions.filter(id => allowed.includes(id))
        : [...allowed];
      const visibleSet = new Set(visible);
      Object.entries(actionButtonsById).forEach(([id, btn]) => {
        btn.style.display = visibleSet.has(id) ? '' : 'none';
      });
      const beginner = uiMode === 'beginner';
      if (advancedSection) {
        advancedSection.style.display = beginner ? 'none' : '';
      }
      presetsCard.style.display = beginner ? 'none' : '';
      moduleRulesCard.style.display = beginner ? 'none' : '';
      intentCard.style.display = beginner ? 'none' : '';
      historyCard.style.display = beginner ? 'none' : '';
      timelineCard.style.display = beginner ? 'none' : '';
    }

    function hasValidModule() {
      return !!moduleSelect.value && moduleSelect.value !== 'No modules';
    }

    function hasValidDevice() {
      return !!deviceSelect.value && deviceSelect.value !== 'No online devices';
    }

    function hasValidVariant() {
      return !!variantSelect.value;
    }

    function getPreRunPipeline() {
      return {
        clean: pipelineClean.checked,
        assemble: pipelineAssemble.checked,
        install: pipelineInstall.checked,
        run: pipelineRun.checked,
      };
    }

    function getLaunchTargetId() {
      return launchTargetSelect.value || 'launcher';
    }

    function renderLaunchTargets(targets) {
      const rows = Array.isArray(targets) ? targets : [];
      launchTargetSelect.innerHTML = '';
      if (!rows.length) {
        const opt = document.createElement('option');
        opt.value = 'launcher';
        opt.textContent = 'Default Launcher Activity';
        launchTargetSelect.appendChild(opt);
        return;
      }
      rows.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.label;
        launchTargetSelect.appendChild(opt);
      });
      if (restore.launchTargetId) {
        const exists = Array.from(launchTargetSelect.options).some(o => o.value === restore.launchTargetId);
        if (exists) {
          launchTargetSelect.value = restore.launchTargetId;
        }
        restore.launchTargetId = '';
      }
    }

    function setFieldError(selectEl, errorEl, message) {
      errorEl.textContent = message || '';
      if (message) {
        selectEl.classList.add('invalid');
      } else {
        selectEl.classList.remove('invalid');
      }
    }

    function clearInlineValidation() {
      setFieldError(moduleSelect, moduleError, '');
      setFieldError(deviceSelect, deviceError, '');
      setFieldError(variantSelect, variantError, '');
    }

    function validateFields(required, showStatusMessage) {
      const needs = new Set(required || []);
      const moduleErr = needs.has('module') && !hasValidModule() ? 'Select module' : '';
      const deviceErr = needs.has('device') && !hasValidDevice() ? 'Select device' : '';
      const variantErr = needs.has('variant') && !hasValidVariant() ? 'Select variant' : '';
      setFieldError(moduleSelect, moduleError, moduleErr);
      setFieldError(deviceSelect, deviceError, deviceErr);
      setFieldError(variantSelect, variantError, variantErr);
      const firstError = moduleErr || deviceErr || variantErr;
      if (showStatusMessage && firstError) {
        setStatusState('failed', 'Fix highlighted fields.');
      }
      return !firstError;
    }

    let isBusy = false;
    let modulesLoaded = false;
    let devicesLoaded = false;
    let historyLoaded = false;
    let selectedHistoryId = '';
    let lastErrorLocation = null;
    let lastErrorSummary = '';
    let historyItems = [];
    let lastHistoryIds = [];
    let lastTimelineIds = [];
    const MAX_RENDER_ROWS = 200;
    const presetDefs = [
      { id: 'debug-emulator', label: 'Debug on Emulator' },
      { id: 'release-device', label: 'Release on Device' },
    ];
    let pinnedPresetIds = [];
    const persisted = vscode.getState && vscode.getState();
    if (persisted && Array.isArray(persisted.pinnedPresetIds)) {
      pinnedPresetIds = persisted.pinnedPresetIds.filter(v => typeof v === 'string');
    } else {
      pinnedPresetIds = ['debug-emulator'];
    }
    const teamRecommendedDefs = [
      { id: 'run-now', label: 'Run now', type: 'runNow' },
      { id: 'what-next', label: 'What Next Surface', type: 'quickAction', actionId: 'what-next' },
      { id: 'align-policy', label: 'Align Team Policy', type: 'quickAction', actionId: 'align-policy' },
      { id: 'project-doctor', label: 'Project Doctor', type: 'quickAction', actionId: 'project-doctor' },
    ];
    let recentActionIds = Array.isArray(restore.recentActionIds) ? restore.recentActionIds.slice(0, 8) : [];
    let restore = {
      module: persisted && typeof persisted.module === 'string' ? persisted.module : '',
      device: persisted && typeof persisted.device === 'string' ? persisted.device : '',
      variant: persisted && typeof persisted.variant === 'string' ? persisted.variant : '',
      flavor: persisted && typeof persisted.flavor === 'string' ? persisted.flavor : '',
      buildType: persisted && typeof persisted.buildType === 'string' ? persisted.buildType : '',
      launchTargetId: persisted && typeof persisted.launchTargetId === 'string' ? persisted.launchTargetId : 'launcher',
      installDiffMode: persisted && typeof persisted.installDiffMode === 'boolean' ? persisted.installDiffMode : false,
      pipelineClean: persisted && typeof persisted.pipelineClean === 'boolean' ? persisted.pipelineClean : false,
      pipelineAssemble: persisted && typeof persisted.pipelineAssemble === 'boolean' ? persisted.pipelineAssemble : false,
      pipelineInstall: persisted && typeof persisted.pipelineInstall === 'boolean' ? persisted.pipelineInstall : true,
      pipelineRun: persisted && typeof persisted.pipelineRun === 'boolean' ? persisted.pipelineRun : true,
      intentAction: persisted && typeof persisted.intentAction === 'string' ? persisted.intentAction : '',
      intentCategory: persisted && typeof persisted.intentCategory === 'string' ? persisted.intentCategory : '',
      intentDataUri: persisted && typeof persisted.intentDataUri === 'string' ? persisted.intentDataUri : '',
      intentFlags: persisted && typeof persisted.intentFlags === 'string' ? persisted.intentFlags : '',
      intentExtras: persisted && typeof persisted.intentExtras === 'string' ? persisted.intentExtras : '',
      historySearch: persisted && typeof persisted.historySearch === 'string' ? persisted.historySearch : '',
      historyFilter: persisted && typeof persisted.historyFilter === 'string' ? persisted.historyFilter : 'all',
      selectedHistoryId: persisted && typeof persisted.selectedHistoryId === 'string' ? persisted.selectedHistoryId : '',
      recentActionIds: persisted && Array.isArray(persisted.recentActionIds) ? persisted.recentActionIds.filter(v => typeof v === 'string') : [],
      advancedOpen: persisted && typeof persisted.advancedOpen === 'boolean' ? persisted.advancedOpen : false,
    };
    installDiffMode.checked = restore.installDiffMode;
    pipelineClean.checked = restore.pipelineClean;
    pipelineAssemble.checked = restore.pipelineAssemble;
    pipelineInstall.checked = restore.pipelineInstall;
    pipelineRun.checked = restore.pipelineRun;
    intentAction.value = restore.intentAction;
    intentCategory.value = restore.intentCategory;
    intentDataUri.value = restore.intentDataUri;
    intentFlags.value = restore.intentFlags;
    intentExtras.value = restore.intentExtras;
    if (advancedSection) {
      advancedSection.open = restore.advancedOpen;
    }
    if (restore.historySearch) {
      historySearch.value = restore.historySearch;
    }
    if (restore.historyFilter) {
      historyFilter.value = restore.historyFilter;
    }

    function persistPanelState() {
      if (vscode.setState) {
        vscode.setState({
          pinnedPresetIds,
          module: moduleSelect.value,
          device: deviceSelect.value,
          variant: variantSelect.value,
          flavor: flavorSelect.value,
          buildType: buildTypeSelect.value,
          launchTargetId: launchTargetSelect.value,
          installDiffMode: installDiffMode.checked,
          pipelineClean: pipelineClean.checked,
          pipelineAssemble: pipelineAssemble.checked,
          pipelineInstall: pipelineInstall.checked,
          pipelineRun: pipelineRun.checked,
          intentAction: intentAction.value,
          intentCategory: intentCategory.value,
          intentDataUri: intentDataUri.value,
          intentFlags: intentFlags.value,
          intentExtras: intentExtras.value,
          historySearch: historySearch.value,
          historyFilter: historyFilter.value,
          selectedHistoryId,
          recentActionIds,
          advancedOpen: !!(advancedSection && advancedSection.open),
        });
      }
    }
    function setLoadingState() {
      const loading = !(modulesLoaded && devicesLoaded && historyLoaded);
      [moduleSelect, deviceSelect, variantSelect, flavorSelect, buildTypeSelect, launchTargetSelect].forEach(el => {
        if (loading) {
          el.classList.add('loading-skeleton');
        } else {
          el.classList.remove('loading-skeleton');
        }
      });
      if (loading) {
        historyList.classList.add('loading-skeleton');
      } else {
        historyList.classList.remove('loading-skeleton');
      }
    }

    function runPreset(presetId) {
      setBusy(true);
      vscode.postMessage({ type: 'runPreset', presetId, moduleName: moduleSelect.value });
      const label = (presetDefs.find(p => p.id === presetId) || { label: presetId }).label;
      setStatusState('running', 'Running preset: ' + label + '...');
    }

    function updatePinButtons() {
      const map = {
        'debug-emulator': pinDebugEmuBtn,
        'release-device': pinReleaseDeviceBtn,
      };
      Object.keys(map).forEach(id => {
        const btn = map[id];
        const pinned = pinnedPresetIds.includes(id);
        btn.textContent = pinned ? '★' : '☆';
        btn.title = pinned ? 'Unpin preset' : 'Pin preset';
      });
    }

    function renderPinnedPresets() {
      pinnedPresets.innerHTML = '';
      const pinned = presetDefs.filter(p => pinnedPresetIds.includes(p.id));
      if (!pinned.length) {
        const muted = document.createElement('span');
        muted.style.color = 'var(--muted)';
        muted.textContent = 'No pinned presets';
        pinnedPresets.appendChild(muted);
        updatePinButtons();
        return;
      }
      pinned.forEach(preset => {
        const b = document.createElement('button');
        b.className = 'secondary';
        b.textContent = preset.label;
        b.addEventListener('click', () => runPreset(preset.id));
        pinnedPresets.appendChild(b);
      });
      updatePinButtons();
    }

    function togglePresetPin(presetId) {
      if (pinnedPresetIds.includes(presetId)) {
        pinnedPresetIds = pinnedPresetIds.filter(id => id !== presetId);
      } else {
        pinnedPresetIds = [...pinnedPresetIds, presetId];
      }
      persistPanelState();
      renderPinnedPresets();
    }

    function registerRecentAction(actionId) {
      if (!actionId) return;
      recentActionIds = [actionId, ...recentActionIds.filter(id => id !== actionId)].slice(0, 8);
      persistPanelState();
      renderRecentActions();
    }

    function runActionById(actionId) {
      if (!actionId) return;
      if (actionId === 'run-now') {
        runNowBtn.click();
        return;
      }
      if (actionId === 'rerun') {
        rerunBtn.click();
        return;
      }
      if (actionId === 'release-gate') {
        releaseGateBtn.click();
        return;
      }
      if (actionId === 'refresh') {
        refreshBtn.click();
        return;
      }
      const mapping = {
        'what-next': 'what-next',
        'align-policy': 'align-policy',
        'project-doctor': 'project-doctor',
      };
      const mapped = mapping[actionId];
      if (!mapped) return;
      setBusy(true);
      vscode.postMessage({ type: 'quickAction', actionId: mapped, moduleName: moduleSelect.value, deviceId: deviceSelect.value });
      setStatusState('running', 'Running quick action...');
    }

    function renderRecentActions() {
      recentActions.innerHTML = '';
      if (!recentActionIds.length) {
        const muted = document.createElement('span');
        muted.style.color = 'var(--muted)';
        muted.textContent = 'No recent actions yet';
        recentActions.appendChild(muted);
        return;
      }
      recentActionIds.forEach(id => {
        const btn = document.createElement('button');
        btn.className = 'secondary';
        btn.textContent = id.replaceAll('-', ' ');
        btn.addEventListener('click', () => runActionById(id));
        recentActions.appendChild(btn);
      });
    }

    function renderTeamActions() {
      teamActions.innerHTML = '';
      teamRecommendedDefs.forEach(item => {
        const btn = document.createElement('button');
        btn.className = 'secondary';
        btn.textContent = item.label;
        btn.addEventListener('click', () => {
          registerRecentAction(item.id);
          runActionById(item.id);
        });
        teamActions.appendChild(btn);
      });
    }

    function updateActionButtons() {
      const hasModule = hasValidModule();
      const hasDevice = hasValidDevice();
      const hasVariant = hasValidVariant();
      buildBtn.disabled = isBusy || !hasModule || !hasVariant;
      cleanBtn.disabled = isBusy;
      stopBtn.disabled = isBusy || !hasModule || !hasDevice;
      installBtn.disabled = isBusy || !hasModule || !hasDevice || !hasVariant;
      runBtn.disabled = isBusy || !hasModule || !hasDevice || !hasVariant;
      runNowBtn.disabled = isBusy || !hasModule || !hasDevice || !hasVariant;
      refreshBtn.disabled = false;
      rerunBtn.disabled = isBusy || !selectedHistoryId;
      releaseGateBtn.disabled = isBusy;
      qaLogcatBtn.disabled = isBusy || !hasModule;
      qaCrashReproBtn.disabled = isBusy || !hasModule || !hasDevice;
      qaArtifactsBtn.disabled = isBusy || !hasModule || !hasDevice || !hasVariant;
      qaHealthBtn.disabled = isBusy;
      qaProjectDoctorBtn.disabled = isBusy;
      qaCrashAnrTriageBtn.disabled = isBusy;
      qaReleaseGateBtn.disabled = isBusy;
      launchIntentBtn.disabled = isBusy || !hasModule || !hasDevice;
      saveRuleBtn.disabled = isBusy || !hasModule;
      applyRuleBtn.disabled = isBusy || !hasModule;
      refreshTimelineBtn.disabled = isBusy;
      updateEmptyHints();
    }

    function setBusy(next) {
      isBusy = next;
      if (next) {
        renderInstallDiff(undefined);
      }
      updateActionButtons();
    }

    function updateBuildButtonLabel() {
      const variant = variantSelect.value || 'Variant';
      buildBtn.textContent = 'Build ' + variant;
    }

    let statusIdleTimer = null;
    function setStatusState(state, text) {
      const severity = state === 'failed' ? 'error' : state === 'fixed' ? 'success' : state === 'idle' ? 'info' : 'warn';
      const chipLabel = state === 'failed'
        ? 'Failed'
        : state === 'fixed'
          ? 'Fixed'
          : state === 'running'
            ? 'Running'
            : 'Idle';
      statusChipEl.textContent = chipLabel;
      statusMessageEl.textContent = text || '';
      statusEl.className = 'status ' + severity + ' state-change';
      setTimeout(() => statusEl.classList.remove('state-change'), 240);
      if (statusIdleTimer) {
        clearTimeout(statusIdleTimer);
      }
      if (state === 'fixed') {
        statusIdleTimer = setTimeout(() => {
          statusChipEl.textContent = 'Idle';
          statusMessageEl.textContent = 'Ready.';
          statusEl.className = 'status info';
        }, 2200);
      }
    }
    function setHealth(health) {
      const state = (health && health.state) || 'ok';
      const message = (health && health.message) || 'Runtime health: OK';
      const score = typeof (health && health.score) === 'number'
        ? Math.max(0, Math.min(100, Math.round(health.score)))
        : undefined;
      healthEl.className = 'health ' + state;
      healthEl.textContent = score === undefined
        ? message
        : ('Preflight score: ' + score + '% · ' + message);
      const recommendations = Array.isArray(health && health.recommendations)
        ? health.recommendations
        : [];
      if (recommendations.length > 0) {
        renderHint('Smart run recommendations', recommendations, 'quickAction');
      } else {
        updateEmptyHints();
      }
    }
    function renderHint(title, fixes, mode) {
      hintTitle.textContent = title;
      hintActions.innerHTML = '';
      (fixes || []).forEach((fix, index) => {
        const b = document.createElement('button');
        b.className = index === 0 ? 'btn-primary' : 'btn-secondary';
        b.textContent = fix.label;
        b.addEventListener('click', () => {
          setBusy(true);
          if (mode === 'quickAction') {
            vscode.postMessage({
              type: 'quickAction',
              actionId: fix.actionId || fix.id,
              moduleName: moduleSelect.value,
              deviceId: deviceSelect.value,
            });
            setStatusState('running', 'Running recommendation...');
          } else {
            vscode.postMessage({ type: 'applyFix', fixId: fix.id, moduleName: moduleSelect.value, deviceId: deviceSelect.value });
            setStatusState('running', 'Applying quick fix...');
          }
        });
        hintActions.appendChild(b);
      });
      hintBox.classList.add('visible');
    }
    function updateEmptyHints() {
      hintBox.classList.remove('visible');
      const hasModule = !!moduleSelect.value && moduleSelect.value !== 'No modules';
      const hasDevice = !!deviceSelect.value && deviceSelect.value !== 'No online devices';
      if (!hasModule) {
        renderHint('No module selected. Open or create an Android project.', [
          { id: 'openProjectWizard', label: 'Open Project' },
          { id: 'openWorkspace', label: 'Open Workspace' },
        ], 'fix');
        return;
      }
      if (!hasDevice) {
        renderHint('No online device. Start emulator or pick a device.', [
          { id: 'startEmulator', label: 'Start Emulator' },
          { id: 'selectDevice', label: 'Select Device' },
        ], 'fix');
      }
    }

    function showErrorBox(gradleError, fixes, errorLocation) {
      if (!gradleError) {
        errorBox.classList.remove('visible');
        errorBox.classList.remove('reveal');
        errorText.textContent = '';
        lastErrorSummary = '';
        fixRow.innerHTML = '';
        lastErrorLocation = null;
        openErrLocationBtn.disabled = true;
        copyErrorCtxBtn.disabled = true;
        return;
      }
      errorText.textContent = gradleError;
      lastErrorSummary = gradleError;
      errorBox.classList.add('visible');
      errorBox.classList.remove('reveal');
      requestAnimationFrame(() => errorBox.classList.add('reveal'));
      lastErrorLocation = errorLocation || null;
      openErrLocationBtn.disabled = !lastErrorLocation;
      copyErrorCtxBtn.disabled = false;
      fixRow.innerHTML = '';
      (fixes || []).forEach((fix, index) => {
        const b = document.createElement('button');
        b.className = index === 0 ? 'btn-primary' : 'btn-secondary';
        b.textContent = fix.label;
        b.addEventListener('click', () => {
          setBusy(true);
          vscode.postMessage({ type: 'applyFix', fixId: fix.id, moduleName: moduleSelect.value, deviceId: deviceSelect.value });
          setStatusState('running', 'Applying fix...');
        });
        fixRow.appendChild(b);
      });
    }

    function renderInstallDiff(installDiff) {
      if (!installDiff || !Array.isArray(installDiff.lines) || installDiff.lines.length === 0) {
        installDiffBox.classList.remove('visible');
        installDiffBox.innerHTML = '';
        return;
      }
      const title = installDiff.title || 'Install Diff';
      const rows = installDiff.lines.map(line => '<div class="diff-line">' + line + '</div>').join('');
      installDiffBox.innerHTML = '<div class="diff-title">' + title + '</div>' + rows;
      installDiffBox.classList.add('visible');
    }

    function renderTimeline(rows) {
      const list = Array.isArray(rows) ? rows : [];
      if (!list.length) {
        timelineList.innerHTML = '<div class="timeline-item">No timeline events yet.</div>';
        lastTimelineIds = [];
        return;
      }
      const windowed = list.slice(0, MAX_RENDER_ROWS);
      const nextIds = windowed.map(r => r.id);
      const canIncremental =
        lastTimelineIds.length > 0 &&
        nextIds.length === lastTimelineIds.length + 1 &&
        nextIds.slice(1).every((id, idx) => id === lastTimelineIds[idx]);
      if (canIncremental) {
        const r = windowed[0];
        const cls = r.status === 'failed' ? 'fail' : r.status === 'success' ? 'ok' : '';
        const ts = new Date(r.at).toLocaleTimeString();
        const duration = typeof r.durationMs === 'number' ? (' · ' + r.durationMs + ' ms') : '';
        const msg = r.message ? '<div class="timeline-meta">' + r.message + '</div>' : '';
        const node = document.createElement('div');
        node.className = 'timeline-item ' + cls;
        node.innerHTML = '<div>' + ts + ' · ' + r.action + ' / ' + r.stage + ' · ' + r.status + duration + '</div>' + msg;
        timelineList.insertBefore(node, timelineList.firstChild);
        while (timelineList.childElementCount > MAX_RENDER_ROWS) {
          timelineList.removeChild(timelineList.lastChild);
        }
      } else {
        const prefix = list.length > MAX_RENDER_ROWS
          ? '<div class="timeline-item">Showing latest ' + MAX_RENDER_ROWS + ' of ' + list.length + ' events.</div>'
          : '';
        timelineList.innerHTML = prefix + windowed.map(r => {
          const cls = r.status === 'failed' ? 'fail' : r.status === 'success' ? 'ok' : '';
          const ts = new Date(r.at).toLocaleTimeString();
          const duration = typeof r.durationMs === 'number' ? (' · ' + r.durationMs + ' ms') : '';
          const msg = r.message ? '<div class="timeline-meta">' + r.message + '</div>' : '';
          return '<div class="timeline-item ' + cls + '"><div>' + ts + ' · ' + r.action + ' / ' + r.stage + ' · ' + r.status + duration + '</div>' + msg + '</div>';
        }).join('');
      }
      lastTimelineIds = nextIds;
    }

    function renderHistory(history) {
      historyItems = history || [];
      const query = (historySearch.value || '').toLowerCase().trim();
      const filter = historyFilter.value || 'all';
      const filtered = historyItems.filter(h => {
        if (filter === 'module' && moduleSelect.value && h.moduleName !== moduleSelect.value) {
          return false;
        }
        if (filter === 'device' && deviceSelect.value && h.deviceId !== deviceSelect.value) {
          return false;
        }
        if (!query) {
          return true;
        }
        const hay = (h.label + ' ' + h.moduleName + ' ' + h.variant + ' ' + h.deviceId).toLowerCase();
        return hay.includes(query);
      });
      if (!filtered.length) {
        historyList.innerHTML = '';
        lastHistoryIds = [];
        const empty = document.createElement('div');
        empty.className = 'empty-card';
        if (historyItems.length) {
          empty.innerHTML =
            '<div class="empty-card-icon" aria-hidden="true">i</div>' +
            '<div>' +
            '<div class="empty-card-title">No matching runs</div>' +
            '<div class="empty-card-meta">Change filters or search query to see run history.</div>' +
            '<div class="empty-card-actions">' +
            '<button id="historyResetBtn" class="btn-primary">Reset filters</button>' +
            '<button id="historyRefreshBtn" class="btn-secondary">Refresh history</button>' +
            '</div>' +
            '</div>';
        } else {
          empty.innerHTML =
            '<div class="empty-card-icon" aria-hidden="true">i</div>' +
            '<div>' +
            '<div class="empty-card-title">No recent runs</div>' +
            '<div class="empty-card-meta">Start your first run to populate history.</div>' +
            '<div class="empty-card-actions">' +
            '<button id="historyRunNowBtn" class="btn-primary">Run now</button>' +
            '<button id="historyRefreshBtn" class="btn-secondary">Refresh history</button>' +
            '</div>' +
            '</div>';
        }
        historyList.appendChild(empty);
        selectedHistoryId = '';
        persistPanelState();
        updateActionButtons();
        const historyRefreshBtn = document.getElementById('historyRefreshBtn');
        if (historyRefreshBtn) {
          historyRefreshBtn.addEventListener('click', () => refreshAll());
        }
        const historyResetBtn = document.getElementById('historyResetBtn');
        if (historyResetBtn) {
          historyResetBtn.addEventListener('click', () => {
            historySearch.value = '';
            historyFilter.value = 'all';
            persistPanelState();
            renderHistory(historyItems);
          });
        }
        const historyRunNowBtn = document.getElementById('historyRunNowBtn');
        if (historyRunNowBtn) {
          historyRunNowBtn.addEventListener('click', () => {
            if (!validateFields(['module', 'device', 'variant'], true)) return;
            setBusy(true);
            vscode.postMessage({
              type: 'run',
              moduleName: moduleSelect.value,
              deviceId: deviceSelect.value,
              launchTargetId: getLaunchTargetId(),
              installDiffMode: installDiffMode.checked,
              preRunPipeline: getPreRunPipeline(),
            });
            setStatusState('running', 'Starting app...');
          });
        }
        return;
      }
      const windowed = filtered.slice(0, MAX_RENDER_ROWS);
      const nextIds = windowed.map(h => h.id);
      const canIncremental =
        !query &&
        filter === 'all' &&
        lastHistoryIds.length > 0 &&
        nextIds.length === lastHistoryIds.length + 1 &&
        nextIds.slice(1).every((id, idx) => id === lastHistoryIds[idx]);
      if (canIncremental) {
        const h = windowed[0];
        const item = document.createElement('div');
        item.className = 'history-item';
        const ts = new Date(h.timestamp).toLocaleString();
        item.innerHTML = '<div>' + h.label + '</div><div class="history-meta">' + ts + '</div>';
        item.addEventListener('click', () => {
          selectedHistoryId = h.id;
          renderHistory(historyItems);
        });
        historyList.insertBefore(item, historyList.firstChild);
        while (historyList.childElementCount > MAX_RENDER_ROWS) {
          historyList.removeChild(historyList.lastChild);
        }
      } else {
        historyList.innerHTML = '';
        if (filtered.length > MAX_RENDER_ROWS) {
          const note = document.createElement('div');
          note.className = 'history-item';
          note.textContent = 'Showing latest ' + MAX_RENDER_ROWS + ' of ' + filtered.length + ' runs.';
          historyList.appendChild(note);
        }
        windowed.forEach(h => {
          const item = document.createElement('div');
          item.className = 'history-item' + (h.id === selectedHistoryId ? ' sel' : '');
          const ts = new Date(h.timestamp).toLocaleString();
          item.innerHTML = '<div>' + h.label + '</div><div class="history-meta">' + ts + '</div>';
          item.addEventListener('click', () => {
            selectedHistoryId = h.id;
            renderHistory(historyItems);
          });
          historyList.appendChild(item);
        });
      }
      lastHistoryIds = nextIds;
      if (!selectedHistoryId) {
        selectedHistoryId = windowed[0].id;
      }
      if (!windowed.some(h => h.id === selectedHistoryId)) {
        selectedHistoryId = windowed[0].id;
      }
      persistPanelState();
      updateActionButtons();
    }

    function refreshAll() {
      vscode.postMessage({ type: 'refresh' });
      vscode.postMessage({ type: 'getHistory' });
      vscode.postMessage({ type: 'getTimeline' });
      requestHealth();
      if (moduleSelect.value) {
        vscode.postMessage({ type: 'getLaunchTargets', moduleName: moduleSelect.value });
      }
    }

    function requestHealth() {
      vscode.postMessage({
        type: 'getHealth',
        moduleName: moduleSelect.value,
        deviceId: deviceSelect.value,
        variant: variantSelect.value,
      });
    }

    refreshBtn.addEventListener('click', refreshAll);
    if (advancedSection) {
      advancedSection.addEventListener('toggle', () => persistPanelState());
    }
    openGradleBtn.addEventListener('click', () => vscode.postMessage({ type: 'openGradleOutput' }));
    copyErrorCtxBtn.addEventListener('click', () => {
      vscode.postMessage({
        type: 'copyErrorContext',
        moduleName: moduleSelect.value,
        variant: variantSelect.value,
        deviceId: deviceSelect.value,
        errorSummary: lastErrorSummary,
        ...(lastErrorLocation || {}),
      });
    });
    openErrLocationBtn.addEventListener('click', () => {
      if (!lastErrorLocation) return;
      vscode.postMessage({ type: 'openErrorLocation', ...lastErrorLocation });
    });

    buildBtn.addEventListener('click', () => {
      if (!validateFields(['module', 'variant'], true)) return;
      registerRecentAction('build');
      setBusy(true);
      vscode.postMessage({ type: 'build', moduleName: moduleSelect.value, deviceId: deviceSelect.value });
      setStatusState('running', 'Building selected variant...');
    });
    installBtn.addEventListener('click', () => {
      if (!validateFields(['module', 'device', 'variant'], true)) return;
      registerRecentAction('install');
      setBusy(true);
      vscode.postMessage({
        type: 'install',
        moduleName: moduleSelect.value,
        deviceId: deviceSelect.value,
        installDiffMode: installDiffMode.checked,
      });
      setStatusState('running', 'Installing on selected device...');
    });
    runBtn.addEventListener('click', () => {
      if (!validateFields(['module', 'device', 'variant'], true)) return;
      registerRecentAction('run-now');
      setBusy(true);
      vscode.postMessage({
        type: 'run',
        moduleName: moduleSelect.value,
        deviceId: deviceSelect.value,
        launchTargetId: getLaunchTargetId(),
        installDiffMode: installDiffMode.checked,
        preRunPipeline: getPreRunPipeline(),
      });
      setStatusState('running', 'Starting app...');
    });
    runNowBtn.addEventListener('click', () => {
      if (!validateFields(['module', 'device', 'variant'], true)) return;
      registerRecentAction('run-now');
      setBusy(true);
      vscode.postMessage({
        type: 'run',
        moduleName: moduleSelect.value,
        deviceId: deviceSelect.value,
        launchTargetId: getLaunchTargetId(),
        installDiffMode: installDiffMode.checked,
        preRunPipeline: getPreRunPipeline(),
      });
      setStatusState('running', 'Starting app...');
    });
    stopBtn.addEventListener('click', () => {
      if (!validateFields(['module', 'device'], true)) return;
      registerRecentAction('stop');
      setBusy(true);
      vscode.postMessage({ type: 'stop', moduleName: moduleSelect.value, deviceId: deviceSelect.value });
      setStatusState('running', 'Stopping app...');
    });
    cleanBtn.addEventListener('click', () => {
      registerRecentAction('clean');
      setBusy(true);
      vscode.postMessage({ type: 'clean' });
      setStatusState('running', 'Cleaning project...');
    });
    releaseGateBtn.addEventListener('click', () => {
      registerRecentAction('release-gate');
      setBusy(true);
      vscode.postMessage({ type: 'releaseQualityGate' });
      setStatusState('running', 'Running release quality gate...');
    });

    document.getElementById('presetDebugEmuBtn').addEventListener('click', () => runPreset('debug-emulator'));
    document.getElementById('presetReleaseDeviceBtn').addEventListener('click', () => runPreset('release-device'));
    pinDebugEmuBtn.addEventListener('click', () => togglePresetPin('debug-emulator'));
    pinReleaseDeviceBtn.addEventListener('click', () => togglePresetPin('release-device'));

    rerunBtn.addEventListener('click', () => {
      if (!selectedHistoryId) return;
      registerRecentAction('rerun');
      setBusy(true);
      vscode.postMessage({ type: 'rerunHistory', historyId: selectedHistoryId });
      setStatusState('running', 'Re-running selected history item...');
    });
    qaLogcatBtn.addEventListener('click', () => {
      if (!validateFields(['module'], true)) return;
      setBusy(true);
      vscode.postMessage({ type: 'quickAction', actionId: 'logcat-this-app', moduleName: moduleSelect.value, deviceId: deviceSelect.value });
      setStatusState('running', 'Opening Logcat quick view...');
    });
    qaCrashReproBtn.addEventListener('click', () => {
      if (!validateFields(['module', 'device'], true)) return;
      setBusy(true);
      vscode.postMessage({ type: 'quickAction', actionId: 'crash-repro', moduleName: moduleSelect.value, deviceId: deviceSelect.value });
      setStatusState('running', 'Running crash repro flow...');
    });
    qaArtifactsBtn.addEventListener('click', () => {
      if (!validateFields(['module', 'device', 'variant'], true)) return;
      setBusy(true);
      vscode.postMessage({ type: 'quickAction', actionId: 'export-run-artifacts', moduleName: moduleSelect.value, deviceId: deviceSelect.value });
      setStatusState('running', 'Exporting run artifacts bundle...');
    });
    qaLastFailedBtn.addEventListener('click', () => {
      setBusy(true);
      vscode.postMessage({ type: 'quickAction', actionId: 'open-last-failed', moduleName: moduleSelect.value, deviceId: deviceSelect.value });
      setStatusState('running', 'Opening last failed step...');
    });
    qaHealthBtn.addEventListener('click', () => {
      setBusy(true);
      vscode.postMessage({ type: 'quickAction', actionId: 'health-wizard', moduleName: moduleSelect.value, deviceId: deviceSelect.value });
      setStatusState('running', 'Opening health wizard...');
    });
    qaProjectDoctorBtn.addEventListener('click', () => {
      registerRecentAction('project-doctor');
      setBusy(true);
      vscode.postMessage({ type: 'quickAction', actionId: 'project-doctor', moduleName: moduleSelect.value, deviceId: deviceSelect.value });
      setStatusState('running', 'Running project doctor...');
    });
    qaCrashAnrTriageBtn.addEventListener('click', () => {
      setBusy(true);
      vscode.postMessage({ type: 'quickAction', actionId: 'crash-anr-triage', moduleName: moduleSelect.value, deviceId: deviceSelect.value });
      setStatusState('running', 'Opening crash/ANR triage...');
    });
    qaReleaseGateBtn.addEventListener('click', () => {
      registerRecentAction('release-gate');
      setBusy(true);
      vscode.postMessage({ type: 'releaseQualityGate' });
      setStatusState('running', 'Running release quality gate...');
    });

    moduleSelect.addEventListener('change', () => {
      vscode.postMessage({ type: 'getVariants', moduleName: moduleSelect.value });
      vscode.postMessage({ type: 'getLaunchTargets', moduleName: moduleSelect.value });
      vscode.postMessage({ type: 'getModuleRunRule', moduleName: moduleSelect.value });
      persistPanelState();
      clearInlineValidation();
      updateActionButtons();
      requestHealth();
    });
    deviceSelect.addEventListener('change', () => {
      persistPanelState();
      clearInlineValidation();
      updateActionButtons();
      requestHealth();
    });
    variantSelect.addEventListener('change', () => {
      vscode.postMessage({ type: 'setVariant', moduleName: moduleSelect.value, variant: variantSelect.value });
      persistPanelState();
      clearInlineValidation();
      updateBuildButtonLabel();
      requestHealth();
    });
    flavorSelect.addEventListener('change', () => {
      vscode.postMessage({ type: 'setFlavor', moduleName: moduleSelect.value, flavor: flavorSelect.value });
      persistPanelState();
      updateVariantFromSelections();
    });
    buildTypeSelect.addEventListener('change', () => {
      vscode.postMessage({ type: 'setBuildType', moduleName: moduleSelect.value, buildType: buildTypeSelect.value });
      persistPanelState();
      updateVariantFromSelections();
    });
    launchTargetSelect.addEventListener('change', () => {
      vscode.postMessage({ type: 'setLaunchTarget', moduleName: moduleSelect.value, launchTargetId: launchTargetSelect.value });
      persistPanelState();
    });
    refreshLaunchTargetsBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'getLaunchTargets', moduleName: moduleSelect.value });
    });
    [installDiffMode, pipelineClean, pipelineAssemble, pipelineInstall, pipelineRun].forEach(el => {
      el.addEventListener('change', () => persistPanelState());
    });
    [intentAction, intentCategory, intentDataUri, intentFlags, intentExtras].forEach(el => {
      el.addEventListener('input', () => persistPanelState());
    });
    saveRuleBtn.addEventListener('click', () => {
      if (!moduleSelect.value) return;
      vscode.postMessage({
        type: 'saveModuleRunRule',
        moduleName: moduleSelect.value,
        defaultDeviceId: deviceSelect.value,
        defaultVariant: variantSelect.value,
        preRunPipeline: getPreRunPipeline(),
      });
      setStatusState('fixed', 'Per-module rule saved.');
    });
    applyRuleBtn.addEventListener('click', () => {
      if (!moduleSelect.value) return;
      vscode.postMessage({ type: 'getModuleRunRule', moduleName: moduleSelect.value });
    });
    launchIntentBtn.addEventListener('click', () => {
      if (!validateFields(['module', 'device'], true)) return;
      setBusy(true);
      vscode.postMessage({
        type: 'launchIntent',
        moduleName: moduleSelect.value,
        deviceId: deviceSelect.value,
        action: intentAction.value.trim(),
        category: intentCategory.value.trim(),
        dataUri: intentDataUri.value.trim(),
        flags: intentFlags.value.trim(),
        extras: intentExtras.value,
      });
      setStatusState('running', 'Launching intent...');
    });
    refreshTimelineBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'getTimeline' });
    });
    historySearch.addEventListener('input', () => {
      persistPanelState();
      renderHistory(historyItems);
    });
    historyFilter.addEventListener('change', () => {
      persistPanelState();
      renderHistory(historyItems);
    });
    window.addEventListener('keydown', (e) => {
      const tag = (document.activeElement && document.activeElement.tagName || '').toLowerCase();
      const typingContext = tag === 'input' || tag === 'textarea' || tag === 'select' || (document.activeElement && document.activeElement.isContentEditable);
      const hasModule = hasValidModule();
      const hasDevice = hasValidDevice();
      const keyToToken = (key) => {
        if (!key) return '';
        if (key.length === 1) return key.toUpperCase();
        if (key === ' ') return 'Space';
        if (key === 'Escape') return 'Esc';
        return key;
      };
      const eventCombo = () => {
        const parts = [];
        if (e.metaKey || e.ctrlKey) parts.push('Mod');
        if (e.shiftKey) parts.push('Shift');
        if (e.altKey) parts.push('Alt');
        parts.push(keyToToken(e.key));
        return parts.join('+');
      };
      const normalized = eventCombo();
      const compareCombo = (left, right) => String(left || '').toUpperCase() === String(right || '').toUpperCase();
      const triggerRun = () => {
        if (isBusy) return true;
        if (!validateFields(['module', 'device', 'variant'], true)) return true;
        setBusy(true);
        vscode.postMessage({
          type: 'run',
          moduleName: moduleSelect.value,
          deviceId: deviceSelect.value,
          launchTargetId: getLaunchTargetId(),
          installDiffMode: installDiffMode.checked,
          preRunPipeline: getPreRunPipeline(),
        });
        setStatusState('running', 'Starting app...');
        return true;
      };
      const triggerStop = () => {
        if (isBusy) return true;
        if (!validateFields(['module', 'device'], true)) return true;
        setBusy(true);
        vscode.postMessage({ type: 'stop', moduleName: moduleSelect.value, deviceId: deviceSelect.value });
        setStatusState('running', 'Stopping app...');
        return true;
      };
      const triggerRerun = () => {
        if (isBusy || !selectedHistoryId) return true;
        setBusy(true);
        vscode.postMessage({ type: 'rerunHistory', historyId: selectedHistoryId });
        setStatusState('running', 'Re-running selected history item...');
        return true;
      };
      const triggerReleaseGate = () => {
        if (isBusy) return true;
        setBusy(true);
        vscode.postMessage({ type: 'releaseQualityGate' });
        setStatusState('running', 'Running release quality gate...');
        return true;
      };
      const triggerRefresh = () => {
        if (isBusy) return true;
        refreshAll();
        setStatusState('running', 'Refreshing panel...');
        return true;
      };
      if (typingContext && normalized === 'Enter') {
        return;
      }
      const handlers = [
        [shortcuts.run, triggerRun],
        [shortcuts.stop, triggerStop],
        [shortcuts.rerun, triggerRerun],
        [shortcuts.releaseGate, triggerReleaseGate],
        [shortcuts.refresh, triggerRefresh],
      ];

      if (compareCombo(normalized, 'Alt+M')) {
        e.preventDefault();
        moduleSelect.focus();
        return;
      }
      if (compareCombo(normalized, 'Alt+D')) {
        e.preventDefault();
        deviceSelect.focus();
        return;
      }
      if (compareCombo(normalized, 'Alt+V')) {
        e.preventDefault();
        variantSelect.focus();
        return;
      }
      if (compareCombo(normalized, 'Alt+R')) {
        e.preventDefault();
        registerRecentAction('rerun');
        triggerRerun();
        return;
      }
      if (compareCombo(normalized, 'Alt+A')) {
        e.preventDefault();
        registerRecentAction('align-policy');
        runActionById('align-policy');
        return;
      }

      for (const [combo, handler] of handlers) {
        if (compareCombo(normalized, combo)) {
          e.preventDefault();
          handler();
          return;
        }
      }
    });

    function updateVariantFromSelections() {
      const flavor = flavorSelect.value || '';
      const buildType = buildTypeSelect.value || '';
      if (!buildType) return;
      const variant = flavor ? flavor + buildType : buildType;
      variantSelect.value = variant;
      vscode.postMessage({ type: 'setVariant', moduleName: moduleSelect.value, variant });
      updateBuildButtonLabel();
    }

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'devices') {
        devicesLoaded = true;
        deviceSelect.innerHTML = '';
        if (!message.devices || message.devices.length === 0) {
          const opt = document.createElement('option');
          opt.value = '';
          opt.textContent = 'No online devices';
          deviceSelect.appendChild(opt);
        } else {
          message.devices.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.id;
            opt.textContent = d.label;
            deviceSelect.appendChild(opt);
          });
          if (restore.device) {
            const exists = Array.from(deviceSelect.options).some(o => o.value === restore.device);
            if (exists) {
              deviceSelect.value = restore.device;
            }
            restore.device = '';
          }
        }
        persistPanelState();
        updateActionButtons();
        clearInlineValidation();
        setLoadingState();
      }
      if (message.type === 'modules') {
        modulesLoaded = true;
        moduleSelect.innerHTML = '';
        if (!message.modules || message.modules.length === 0) {
          const opt = document.createElement('option');
          opt.value = '';
          opt.textContent = 'No modules';
          moduleSelect.appendChild(opt);
        } else {
          message.modules.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            moduleSelect.appendChild(opt);
          });
        if (restore.module) {
            const exists = Array.from(moduleSelect.options).some(o => o.value === restore.module);
            if (exists) {
              moduleSelect.value = restore.module;
            }
            restore.module = '';
          }
        }
        if (moduleSelect.value) {
          vscode.postMessage({ type: 'getVariants', moduleName: moduleSelect.value });
          vscode.postMessage({ type: 'getLaunchTargets', moduleName: moduleSelect.value });
          vscode.postMessage({ type: 'getModuleRunRule', moduleName: moduleSelect.value });
        }
        persistPanelState();
        updateActionButtons();
        clearInlineValidation();
        setLoadingState();
      }
      if (message.type === 'launchTargets') {
        renderLaunchTargets(message.launchTargets || []);
        persistPanelState();
      }
      if (message.type === 'moduleRunRule') {
        const rule = message.rule || {};
        if (rule.defaultDeviceId) {
          const exists = Array.from(deviceSelect.options).some(o => o.value === rule.defaultDeviceId);
          if (exists) {
            deviceSelect.value = rule.defaultDeviceId;
          }
        }
        if (rule.defaultVariant) {
          const exists = Array.from(variantSelect.options).some(o => o.value === rule.defaultVariant);
          if (exists) {
            variantSelect.value = rule.defaultVariant;
            updateBuildButtonLabel();
          }
        }
        if (rule.preRunPipeline) {
          pipelineClean.checked = !!rule.preRunPipeline.clean;
          pipelineAssemble.checked = !!rule.preRunPipeline.assemble;
          pipelineInstall.checked = !!rule.preRunPipeline.install;
          pipelineRun.checked = !!rule.preRunPipeline.run;
        }
        persistPanelState();
        updateActionButtons();
      }
      if (message.type === 'variants') {
        variantSelect.innerHTML = '';
        (message.variants || []).forEach(v => {
          const opt = document.createElement('option');
          opt.value = v;
          opt.textContent = v;
          variantSelect.appendChild(opt);
        });
        if (message.selected) {
          variantSelect.value = message.selected;
        }
        if (restore.variant) {
          const exists = Array.from(variantSelect.options).some(o => o.value === restore.variant);
          if (exists) {
            variantSelect.value = restore.variant;
          }
          restore.variant = '';
        }

        flavorSelect.innerHTML = '';
        (message.flavors || []).forEach(f => {
          const opt = document.createElement('option');
          opt.value = f;
          opt.textContent = f;
          flavorSelect.appendChild(opt);
        });
        if (message.selectedFlavor) {
          flavorSelect.value = message.selectedFlavor;
        }
        if (restore.flavor) {
          const exists = Array.from(flavorSelect.options).some(o => o.value === restore.flavor);
          if (exists) {
            flavorSelect.value = restore.flavor;
          }
          restore.flavor = '';
        }

        buildTypeSelect.innerHTML = '';
        (message.buildTypes || []).forEach(b => {
          const opt = document.createElement('option');
          opt.value = b;
          opt.textContent = b;
          buildTypeSelect.appendChild(opt);
        });
        if (message.selectedBuildType) {
          buildTypeSelect.value = message.selectedBuildType;
        }
        if (restore.buildType) {
          const exists = Array.from(buildTypeSelect.options).some(o => o.value === restore.buildType);
          if (exists) {
            buildTypeSelect.value = restore.buildType;
          }
          restore.buildType = '';
        }

        updateBuildButtonLabel();
        persistPanelState();
        clearInlineValidation();
        updateActionButtons();
      }
      if (message.type === 'history') {
        historyLoaded = true;
        renderHistory(message.history || []);
        setLoadingState();
      }
      if (message.type === 'timeline') {
        renderTimeline(message.timeline || []);
      }
      if (message.type === 'config') {
        applyUiConfig(message.config || {});
        updateActionButtons();
      }
      if (message.type === 'result') {
        setBusy(false);
        const isFixAction = message.action === 'fix';
        const nextState = message.success ? (isFixAction ? 'fixed' : 'fixed') : 'failed';
        setStatusState(nextState, message.message);
        renderInstallDiff(message.installDiff);
        showErrorBox(message.success ? '' : (message.gradleError || ''), message.fixSuggestions || [], message.errorLocation);
        const refreshHistoryActions = new Set(['run', 'rerun', 'preset']);
        if (message.success && refreshHistoryActions.has(String(message.action || ''))) {
          vscode.postMessage({ type: 'getHistory' });
        }
        vscode.postMessage({ type: 'getTimeline' });
      }
      if (message.type === 'health') {
        setHealth(message.health);
      }
    });

    moduleSelect.innerHTML = '<option>Loading modules...</option>';
    deviceSelect.innerHTML = '<option>Loading devices...</option>';
    launchTargetSelect.innerHTML = '<option>Loading launch targets...</option>';
    historyList.innerHTML = '<div class="history-item">Loading recent runs...</div>';
    timelineList.innerHTML = '<div class="timeline-item">Loading timeline...</div>';
    setLoadingState();
    vscode.postMessage({ type: 'refresh' });
    vscode.postMessage({ type: 'getTimeline' });
    requestHealth();
    updateBuildButtonLabel();
    updateActionButtons();
    clearInlineValidation();
    renderPinnedPresets();
    renderRecentActions();
    renderTeamActions();
    applyShortcutHints();
    showErrorBox('', [], null);
  </script>
</body>
</html>`;
  }

  public dispose(): void {
    RunPanel.currentPanel = undefined;
    RunPanel.isVisible = false;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    this.pendingByType.clear();
    this.disposables.forEach(d => d.dispose());
  }
}
