/**
 * Emulator Control Types
 * Type definitions for emulator control actions
 */

/**
 * Emulator control action type
 */
export type EmulatorAction = 
  | 'rotate'
  | 'screenshot'
  | 'coldBoot'
  | 'warmBoot'
  | 'wipeData'
  | 'networkOn'
  | 'networkOff';

/**
 * Screen orientation values
 */
export type ScreenOrientation = 0 | 1 | 2 | 3; // 0=portrait, 1=landscape, 2=reverse portrait, 3=reverse landscape

/**
 * Network status
 */
export type NetworkStatus = 'enabled' | 'disabled' | 'unknown';

/**
 * Emulator control state
 */
export interface EmulatorControlState {
  deviceId: string;
  avdName?: string;
  isOnline: boolean;
  orientation: ScreenOrientation;
  networkStatus: NetworkStatus;
}

/**
 * Control action result
 */
export interface ActionResult {
  success: boolean;
  message: string;
  data?: unknown;
}
