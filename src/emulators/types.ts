/**
 * Emulator type definitions
 */

/**
 * Status of an AVD (Android Virtual Device)
 */
export type AvdStatus = 'running' | 'stopped';

/**
 * Represents an Android Virtual Device (AVD)
 */
export interface Avd {
  /**
   * AVD name (as shown in avdmanager)
   */
  name: string;

  /**
   * Current status
   */
  status: AvdStatus;

  /**
   * Device ID if running (e.g., "emulator-5554")
   */
  deviceId?: string;
}

/**
 * System image for creating AVDs
 */
export interface SystemImage {
  /**
   * Full path identifier (e.g., "system-images;android-34;google_apis;x86_64")
   */
  id: string;

  /**
   * API level (e.g., 34)
   */
  apiLevel: number;

  /**
   * Tag (e.g., "google_apis", "google_apis_playstore", "default")
   */
  tag: string;

  /**
   * ABI (e.g., "x86_64", "arm64-v8a")
   */
  abi: string;

  /**
   * Human-readable description
   */
  displayName: string;
}

/**
 * Device profile (hardware configuration)
 */
export interface DeviceProfile {
  /**
   * Profile ID (e.g., "pixel_7")
   */
  id: string;

  /**
   * Display name (e.g., "Pixel 7")
   */
  name: string;

  /**
   * Manufacturer (e.g., "Google")
   */
  manufacturer: string;
}

/**
 * Options for creating an AVD
 */
export interface CreateAvdOptions {
  /**
   * AVD name
   */
  name: string;

  /**
   * System image to use
   */
  systemImage: string;

  /**
   * Device profile (optional)
   */
  device?: string;

  /**
   * Force overwrite if exists
   */
  force?: boolean;
}
