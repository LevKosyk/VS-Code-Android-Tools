import * as fs from 'fs';
import * as path from 'path';
import type { LaunchProfile } from '../run/launchProfiles';

export const PROJECT_CONFIG_SCHEMA_VERSION = 2;

export interface ProjectConfigV2 {
  schemaVersion: 2;
  exportedAt?: string;
  androidToolkitSettings?: Record<string, unknown>;
  policy?: {
    requiredSettings?: Record<string, unknown>;
    allowedVariants?: string[];
    enforceModule?: string;
  };
  launchProfiles?: LaunchProfile[];
  matrixPresets?: Array<{ name: string; deviceIds: string[] }>;
  logcatPresets?: Array<{ name: string; filter: { packageName: string; tag: string; level: string } }>;
  logcatPinnedPresets?: string[];
}

export interface ReadProjectConfigResult {
  filePath: string;
  config: ProjectConfigV2;
  migrated: boolean;
  warnings: string[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function configPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.vscode', 'android-tools.json');
}

function ensureParent(filePath: string): void {
  const parent = path.dirname(filePath);
  if (!fs.existsSync(parent)) {
    fs.mkdirSync(parent, { recursive: true });
  }
}

function normalizeLaunchProfiles(value: unknown): LaunchProfile[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(item => isObject(item))
    .map(item => ({
      name: String(item.name || ''),
      module: String(item.module || ''),
      variant: String(item.variant || 'Debug'),
      target: ((item.target === 'device' || item.target === 'ask') ? item.target : 'emulator') as LaunchProfile['target'],
      task: item.task ? String(item.task) : undefined,
    }))
    .filter(item => item.name && item.module);
}

function migrateToV2(raw: unknown): { config: ProjectConfigV2; migrated: boolean; warnings: string[] } {
  const warnings: string[] = [];
  if (!isObject(raw)) {
    return { config: { schemaVersion: 2 }, migrated: false, warnings };
  }
  const schemaVersion = Number(raw.schemaVersion);
  if (schemaVersion === 2) {
    return {
      config: {
        schemaVersion: 2,
        exportedAt: raw.exportedAt ? String(raw.exportedAt) : undefined,
        androidToolkitSettings: isObject(raw.androidToolkitSettings) ? raw.androidToolkitSettings : undefined,
        policy: isObject(raw.policy) ? raw.policy as ProjectConfigV2['policy'] : undefined,
        launchProfiles: normalizeLaunchProfiles(raw.launchProfiles),
        matrixPresets: Array.isArray(raw.matrixPresets) ? raw.matrixPresets as ProjectConfigV2['matrixPresets'] : undefined,
        logcatPresets: Array.isArray(raw.logcatPresets) ? raw.logcatPresets as ProjectConfigV2['logcatPresets'] : undefined,
        logcatPinnedPresets: Array.isArray(raw.logcatPinnedPresets) ? raw.logcatPinnedPresets as string[] : undefined,
      },
      migrated: false,
      warnings,
    };
  }

  const legacyVersion = Number(raw.version);
  if (legacyVersion === 1 || Array.isArray(raw.launchProfiles)) {
    return {
      config: {
        schemaVersion: 2,
        exportedAt: raw.exportedAt ? String(raw.exportedAt) : undefined,
        androidToolkitSettings: isObject(raw.androidToolkitSettings) ? raw.androidToolkitSettings : undefined,
        policy: isObject(raw.policy) ? raw.policy as ProjectConfigV2['policy'] : undefined,
        launchProfiles: normalizeLaunchProfiles(raw.launchProfiles),
        matrixPresets: Array.isArray(raw.matrixPresets) ? raw.matrixPresets as ProjectConfigV2['matrixPresets'] : undefined,
        logcatPresets: Array.isArray(raw.logcatPresets) ? raw.logcatPresets as ProjectConfigV2['logcatPresets'] : undefined,
        logcatPinnedPresets: Array.isArray(raw.logcatPinnedPresets) ? raw.logcatPinnedPresets as string[] : undefined,
      },
      migrated: true,
      warnings,
    };
  }

  warnings.push('Unsupported android-tools.json schema. Reset to schemaVersion 2.');
  return { config: { schemaVersion: 2 }, migrated: true, warnings };
}

export function readProjectConfig(workspaceRoot: string): ReadProjectConfigResult {
  const filePath = configPath(workspaceRoot);
  if (!fs.existsSync(filePath)) {
    return {
      filePath,
      config: { schemaVersion: PROJECT_CONFIG_SCHEMA_VERSION },
      migrated: false,
      warnings: [],
    };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    const migrated = migrateToV2(raw);
    if (migrated.migrated) {
      writeProjectConfig(workspaceRoot, migrated.config);
    }
    return { filePath, ...migrated };
  } catch {
    return {
      filePath,
      config: { schemaVersion: PROJECT_CONFIG_SCHEMA_VERSION },
      migrated: false,
      warnings: ['Invalid JSON in android-tools.json.'],
    };
  }
}

export function writeProjectConfig(workspaceRoot: string, config: ProjectConfigV2): string {
  const filePath = configPath(workspaceRoot);
  ensureParent(filePath);
  const payload: ProjectConfigV2 = { ...config, schemaVersion: PROJECT_CONFIG_SCHEMA_VERSION };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return filePath;
}
