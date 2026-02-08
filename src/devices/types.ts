export type DeviceType = 'physical' | 'emulator';
export type DeviceStatus = 'online' | 'offline' | 'unauthorized' | 'unknown';
export interface AndroidDevice {
  id: string;
  type: DeviceType;
  status: DeviceStatus;
  model?: string;
  androidVersion?: string;
}
