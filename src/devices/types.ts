/**
 * Device type definitions
 */

/**
 * Type of Android device
 */
export type DeviceType = 'physical' | 'emulator';

/**
 * Device connection status
 */
export type DeviceStatus = 'online' | 'offline' | 'unauthorized' | 'unknown';

/**
 * Represents a connected Android device or running emulator
 */
export interface AndroidDevice {
  /**
   * Device serial/ID (e.g., "emulator-5554" or "RFXXXXXXXXX")
   */
  id: string;

  /**
   * Physical device or emulator
   */
  type: DeviceType;

  /**
   * Current connection status
   */
  status: DeviceStatus;

  /**
   * Device model (if available)
   */
  model?: string;

  /**
   * Android version (if available)
   */
  androidVersion?: string;
}
