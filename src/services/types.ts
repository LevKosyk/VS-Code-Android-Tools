/**
 * Service Layer Types
 * Shared types for AdbService and EmulatorService
 */

/**
 * Device properties from getprop
 */
export interface DeviceProperties {
  model: string;
  manufacturer: string;
  androidVersion: string;
  apiLevel: number;
  abi: string;
  screenResolution: string;
  serialNumber: string;
}

/**
 * Battery information
 */
export interface BatteryInfo {
  level: number;
  status: BatteryStatus;
  plugged: 'ac' | 'usb' | 'wireless' | 'none';
  temperature: number;
}

export type BatteryStatus = 'charging' | 'discharging' | 'full' | 'not-charging' | 'unknown';

/**
 * Memory information
 */
export interface MemoryInfo {
  totalMb: number;
  availableMb: number;
  usedPercent: number;
}

/**
 * Storage information
 */
export interface StorageInfo {
  totalGb: number;
  usedGb: number;
  availableGb: number;
}

/**
 * Emulator status for live updates
 */
export interface EmulatorStatus {
  deviceId: string;
  avdName: string;
  state: 'booting' | 'running' | 'offline';
  battery: BatteryInfo;
  memory: MemoryInfo;
  network: NetworkStatus;
}

/**
 * Network status
 */
export type NetworkStatus = 'connected' | 'disconnected' | 'unknown';

/**
 * Network profile presets
 */
export type NetworkProfile = 'full' | 'lte' | '3g' | '2g' | 'edge' | 'offline';

/**
 * Screen recording session
 */
export interface RecordingSession {
  deviceId: string;
  remotePath: string;
  startTime: number;
  process?: any;
}

/**
 * Location preset
 */
export interface LocationPreset {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

/**
 * Default location presets
 */
export const DEFAULT_LOCATION_PRESETS: LocationPreset[] = [
  { id: 'googleplex', name: 'Googleplex', latitude: 37.4220, longitude: -122.0841 },
  { id: 'nyc', name: 'New York City', latitude: 40.7128, longitude: -74.0060 },
  { id: 'london', name: 'London', latitude: 51.5074, longitude: -0.1278 },
  { id: 'tokyo', name: 'Tokyo', latitude: 35.6762, longitude: 139.6503 },
];

/**
 * Installed package info
 */
export interface PackageInfo {
  packageName: string;
  versionName?: string;
  versionCode?: number;
  isSystem: boolean;
}

/**
 * Action result
 */
export interface ServiceResult<T = void> {
  success: boolean;
  message: string;
  data?: T;
}
