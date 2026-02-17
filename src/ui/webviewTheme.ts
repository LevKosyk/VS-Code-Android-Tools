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
