import * as vscode from 'vscode';

type ThemeToken = 'success' | 'warn' | 'error' | 'info';

const defaults: Record<ThemeToken, string> = {
  success: '#22c55e',
  warn: '#f59e0b',
  error: '#ef4444',
  info: '#0ea5e9',
};

function sanitizeHex(value: string | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return fallback;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function contrast(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.56 ? '#111827' : '#f8fafc';
}

export function getWebviewThemeStyle(): string {
  const cfg = vscode.workspace.getConfiguration('androidToolkit');
  const success = sanitizeHex(cfg.get<string>('theme.tokens.success'), defaults.success);
  const warn = sanitizeHex(cfg.get<string>('theme.tokens.warn'), defaults.warn);
  const error = sanitizeHex(cfg.get<string>('theme.tokens.error'), defaults.error);
  const info = sanitizeHex(cfg.get<string>('theme.tokens.info'), defaults.info);
  const density = cfg.get<string>('ui.density', 'comfortable') === 'compact' ? 'compact' : 'comfortable';
  const fontSizeRaw = Number(cfg.get<number>('ui.fontSize', 13));
  const fontSize = Number.isFinite(fontSizeRaw) ? Math.max(11, Math.min(18, Math.round(fontSizeRaw))) : 13;
  const tableRowRaw = Number(cfg.get<number>('ui.tableRowHeight', density === 'compact' ? 28 : 34));
  const logRowRaw = Number(cfg.get<number>('ui.logRowHeight', density === 'compact' ? 20 : 24));
  const tableRowHeight = Number.isFinite(tableRowRaw) ? Math.max(22, Math.min(52, Math.round(tableRowRaw))) : 34;
  const logRowHeight = Number.isFinite(logRowRaw) ? Math.max(16, Math.min(42, Math.round(logRowRaw))) : 24;
  const controlPaddingY = density === 'compact' ? 5 : 7;
  const controlPaddingX = density === 'compact' ? 8 : 10;
  const cardPadding = density === 'compact' ? 10 : 12;
  const typeTitle = Math.max(14, Math.round(fontSize + 1));
  const typeSection = Math.max(13, Math.round(fontSize));
  const typeLabel = Math.max(12, Math.round(fontSize - 1));
  const typeHelper = Math.max(11, Math.round(fontSize - 2));
  return `
    :root {
      --at-success: ${success};
      --at-success-bg: ${rgba(success, 0.16)};
      --at-success-contrast: ${contrast(success)};
      --at-warn: ${warn};
      --at-warn-bg: ${rgba(warn, 0.16)};
      --at-warn-contrast: ${contrast(warn)};
      --at-error: ${error};
      --at-error-bg: ${rgba(error, 0.16)};
      --at-error-contrast: ${contrast(error)};
      --at-info: ${info};
      --at-info-bg: ${rgba(info, 0.16)};
      --at-info-contrast: ${contrast(info)};
      --at-density: ${density};
      --at-font-size: ${fontSize}px;
      --at-table-row-height: ${tableRowHeight}px;
      --at-log-row-height: ${logRowHeight}px;
      --at-control-padding-y: ${controlPaddingY}px;
      --at-control-padding-x: ${controlPaddingX}px;
      --at-card-padding: ${cardPadding}px;
      --at-space-1: 4px;
      --at-space-2: 8px;
      --at-space-3: 12px;
      --at-space-4: 16px;
      --at-space-5: 24px;
      --at-radius-sm: 6px;
      --at-radius-md: 10px;
      --at-radius-lg: 12px;
      --at-type-title: ${typeTitle}px;
      --at-type-section: ${typeSection}px;
      --at-type-label: ${typeLabel}px;
      --at-type-helper: ${typeHelper}px;
    }
  `;
}

export function getSharedPanelUiKitStyle(): string {
  return `
    .at-page { font-family: var(--vscode-font-family); color: var(--vscode-foreground); font-size: var(--at-font-size, 13px); padding: var(--at-space-4); }
    .at-title { margin: 0 0 var(--at-space-3) 0; font-size: var(--at-type-title); font-weight: 700; }
    .at-card { border: 1px solid var(--vscode-widget-border); border-radius: var(--at-radius-md); padding: var(--at-space-3); margin-bottom: var(--at-space-3); }
    .at-row { display: flex; justify-content: space-between; gap: var(--at-space-3); align-items: center; }
    .at-actions { display: flex; gap: var(--at-space-2); flex-wrap: wrap; }
    .at-title-sm { font-weight: 700; margin-bottom: var(--at-space-1); font-size: var(--at-type-label); }
    .at-meta { opacity: 0.86; font-size: var(--at-type-helper); }
    .at-btn { border: 1px solid var(--vscode-widget-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: var(--at-radius-sm); padding: var(--at-control-padding-y, 6px) var(--at-control-padding-x, 8px); cursor: pointer; min-height: var(--at-table-row-height, 34px); font-size: var(--at-type-label); font-weight: 600; }
    .at-btn-primary { background: var(--at-info); color: var(--at-info-contrast); border-color: transparent; }
    .at-btn-secondary { background: transparent; color: var(--vscode-foreground); }
    .at-btn-tertiary { background: transparent; border-style: dashed; color: var(--vscode-descriptionForeground); font-weight: 500; }
    .at-btn:focus-visible { outline: 2px solid var(--vscode-focusBorder); outline-offset: 1px; }
    .at-chip { display: inline-flex; align-items: center; border-radius: 999px; padding: 2px 10px; font-size: var(--at-type-helper); font-weight: 700; border: 1px solid transparent; }
    .at-chip-ok { color: var(--at-success-contrast); border-color: var(--at-success); background: var(--at-success-bg); }
    .at-chip-warn { color: var(--at-warn-contrast); border-color: var(--at-warn); background: var(--at-warn-bg); }
    .at-chip-error { color: var(--at-error-contrast); border-color: var(--at-error); background: var(--at-error-bg); }
    .at-empty { border: 1px dashed var(--vscode-widget-border); border-radius: var(--at-radius-md); padding: var(--at-space-3); }
    .at-loading-text { font-size: var(--at-type-helper); color: var(--vscode-descriptionForeground); margin-bottom: var(--at-space-2); }
    .at-skeleton { border-radius: var(--at-radius-sm); min-height: 14px; background: linear-gradient(90deg, transparent 0%, #ffffff20 50%, transparent 100%); background-size: 220% 100%; animation: atShimmer 1.1s infinite; }
    .at-skeleton-lg { min-height: 36px; }
    .at-summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--at-space-2); }
    .at-summary-card { border: 1px solid var(--vscode-widget-border); border-radius: var(--at-radius-sm); padding: var(--at-space-2); }
    @keyframes atShimmer {
      from { background-position: 180% 0; }
      to { background-position: -40% 0; }
    }
    @media (max-width: 860px) {
      .at-summary-grid { grid-template-columns: 1fr; }
    }
  `;
}
