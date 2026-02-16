import * as vscode from 'vscode';
import { LaunchProfile, readLaunchProfiles, writeLaunchProfiles } from '../run/launchProfiles';
import { readProjectConfig, writeProjectConfig } from './projectConfigStore';

export interface TeamProjectConfig {
  schemaVersion: 2;
  exportedAt: string;
  androidToolkitSettings?: Record<string, unknown>;
  launchProfiles?: LaunchProfile[];
  matrixPresets?: Array<{ name: string; deviceIds: string[] }>;
  logcatPresets?: Array<{ name: string; filter: { packageName: string; tag: string; level: string } }>;
  logcatPinnedPresets?: string[];
}

const MATRIX_PRESETS_KEY = 'matrixDashboard.presets';
const LOGCAT_PRESETS_KEY = 'android-tools.logcatPresets';
const LOGCAT_PINNED_PRESETS_KEY = 'android-tools.logcatPinnedPresets';
const EXPORTABLE_SETTING_KEYS = [
  'notifications.mode',
  'performance.deferBackgroundMonitoring',
  'sync.autoSync.enabled',
  'sync.autoSync.intervalMs',
  'xml.lintOnSave',
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function flattenObject(input: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (isObject(value)) {
      Object.assign(out, flattenObject(value, nextKey));
    } else {
      out[nextKey] = value;
    }
  }
  return out;
}

export async function exportTeamConfig(context: vscode.ExtensionContext, workspaceRoot: string): Promise<string> {
  const settings = vscode.workspace.getConfiguration('androidToolkit');
  const androidToolkitSettings: Record<string, unknown> = {};
  for (const key of EXPORTABLE_SETTING_KEYS) {
    androidToolkitSettings[key] = settings.get(key);
  }
  const payload: TeamProjectConfig = {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    androidToolkitSettings,
    launchProfiles: readLaunchProfiles(workspaceRoot),
    matrixPresets: context.globalState.get<Array<{ name: string; deviceIds: string[] }>>(MATRIX_PRESETS_KEY, []),
    logcatPresets: context.globalState.get<Array<{ name: string; filter: { packageName: string; tag: string; level: string } }>>(LOGCAT_PRESETS_KEY, []),
    logcatPinnedPresets: context.globalState.get<string[]>(LOGCAT_PINNED_PRESETS_KEY, []),
  };
  const existing = readProjectConfig(workspaceRoot);
  const merged = { ...existing.config, ...payload };
  const filePath = writeProjectConfig(workspaceRoot, merged);
  return filePath;
}

export async function importTeamConfig(context: vscode.ExtensionContext, workspaceRoot: string): Promise<{ filePath: string; warnings: string[] }> {
  const read = readProjectConfig(workspaceRoot);
  const parsed = read.config as Partial<TeamProjectConfig>;
  const warnings: string[] = [...read.warnings];

  const settingsObj = parsed.androidToolkitSettings;
  if (isObject(settingsObj)) {
    const flat = flattenObject(settingsObj);
    const folderTarget = vscode.workspace.workspaceFolders?.[0];
    for (const [key, value] of Object.entries(flat)) {
      try {
        await vscode.workspace
          .getConfiguration('androidToolkit', folderTarget)
          .update(key, value, vscode.ConfigurationTarget.WorkspaceFolder);
      } catch {
        warnings.push(`Failed to apply setting: androidToolkit.${key}`);
      }
    }
  }

  if (Array.isArray(parsed.launchProfiles)) {
    writeLaunchProfiles(workspaceRoot, parsed.launchProfiles);
  }

  if (Array.isArray(parsed.matrixPresets)) {
    await context.globalState.update(MATRIX_PRESETS_KEY, parsed.matrixPresets);
  }
  if (Array.isArray(parsed.logcatPresets)) {
    await context.globalState.update(LOGCAT_PRESETS_KEY, parsed.logcatPresets);
  }
  if (Array.isArray(parsed.logcatPinnedPresets)) {
    await context.globalState.update(LOGCAT_PINNED_PRESETS_KEY, parsed.logcatPinnedPresets);
  }

  return { filePath: read.filePath, warnings };
}
