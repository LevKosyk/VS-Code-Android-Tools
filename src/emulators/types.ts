export type AvdStatus = 'running' | 'stopped';
export interface Avd {
  name: string;
  status: AvdStatus;
  deviceId?: string;
}
export interface SystemImage {
  id: string;
  apiLevel: number;
  tag: string;
  abi: string;
  displayName: string;
}
export interface DeviceProfile {
  id: string;
  name: string;
  manufacturer: string;
}
export interface CreateAvdOptions {
  name: string;
  systemImage: string;
  device?: string;
  force?: boolean;
}
