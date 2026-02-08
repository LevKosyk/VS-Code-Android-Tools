export type EmulatorAction = 
  | 'rotate'
  | 'screenshot'
  | 'coldBoot'
  | 'warmBoot'
  | 'wipeData'
  | 'networkOn'
  | 'networkOff';
export type ScreenOrientation = 0 | 1 | 2 | 3; 
export type NetworkStatus = 'enabled' | 'disabled' | 'unknown';
export interface EmulatorControlState {
  deviceId: string;
  avdName?: string;
  isOnline: boolean;
  orientation: ScreenOrientation;
  networkStatus: NetworkStatus;
}
export interface ActionResult {
  success: boolean;
  message: string;
  data?: unknown;
}
