import * as vscode from 'vscode';

export type DeviceFarmMode = 'install' | 'run' | 'smoke' | 'tests';

export interface DeviceFarmPreset {
  id: string;
  name: string;
  mode: DeviceFarmMode;
  moduleName: string;
  variant: string;
  deviceIds: string[];
  packageName?: string;
  runner?: string;
}

const DEVICE_FARM_KEY = 'deviceFarm.presets';

const BUILTIN_PRESETS: DeviceFarmPreset[] = [
  {
    id: 'qa',
    name: 'QA',
    mode: 'tests',
    moduleName: 'app',
    variant: 'Debug',
    deviceIds: [],
    runner: 'com.example.test/androidx.test.runner.AndroidJUnitRunner',
  },
  {
    id: 'release',
    name: 'Release',
    mode: 'run',
    moduleName: 'app',
    variant: 'Release',
    deviceIds: [],
  },
  {
    id: 'smoke',
    name: 'Smoke',
    mode: 'smoke',
    moduleName: 'app',
    variant: 'Debug',
    deviceIds: [],
  },
];

function normalizePreset(raw: unknown): DeviceFarmPreset | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const value = raw as Record<string, unknown>;
  const id = String(value.id || '').trim();
  const name = String(value.name || '').trim();
  const mode = String(value.mode || 'run') as DeviceFarmMode;
  if (!id || !name) {
    return undefined;
  }
  if (!['install', 'run', 'smoke', 'tests'].includes(mode)) {
    return undefined;
  }
  const moduleName = String(value.moduleName || 'app').trim() || 'app';
  const variant = String(value.variant || 'Debug').trim() || 'Debug';
  const deviceIds = Array.isArray(value.deviceIds) ? value.deviceIds.map(String) : [];
  const packageName = value.packageName ? String(value.packageName) : undefined;
  const runner = value.runner ? String(value.runner) : undefined;
  return { id, name, mode, moduleName, variant, deviceIds, packageName, runner };
}

function mergeWithBuiltins(stored: DeviceFarmPreset[]): DeviceFarmPreset[] {
  const map = new Map<string, DeviceFarmPreset>();
  for (const builtin of BUILTIN_PRESETS) {
    map.set(builtin.id, { ...builtin });
  }
  for (const preset of stored) {
    map.set(preset.id, preset);
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function getDeviceFarmPresets(context: vscode.ExtensionContext): DeviceFarmPreset[] {
  const raw = context.globalState.get<unknown[]>(DEVICE_FARM_KEY, []);
  const parsed = raw.map(normalizePreset).filter((item): item is DeviceFarmPreset => Boolean(item));
  return mergeWithBuiltins(parsed);
}

export async function saveDeviceFarmPresets(context: vscode.ExtensionContext, presets: DeviceFarmPreset[]): Promise<void> {
  await context.globalState.update(DEVICE_FARM_KEY, presets);
}

export async function upsertDeviceFarmPreset(context: vscode.ExtensionContext, preset: DeviceFarmPreset): Promise<void> {
  const current = getDeviceFarmPresets(context).filter(item => item.id !== preset.id);
  current.push(preset);
  await saveDeviceFarmPresets(context, current);
}

export async function removeDeviceFarmPreset(context: vscode.ExtensionContext, presetId: string): Promise<void> {
  const current = getDeviceFarmPresets(context).filter(item => item.id !== presetId);
  await saveDeviceFarmPresets(context, current);
}
