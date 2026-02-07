/**
 * Device Manager Types
 * Unified types for Android and iOS device management
 */

/**
 * Platform identifier
 */
export type Platform = 'android' | 'ios';

/**
 * Device state
 */
export type DeviceState = 'running' | 'stopped' | 'unknown';

/**
 * Unified device representation
 */
export interface UnifiedDevice {
  /**
   * Unique identifier
   */
  id: string;

  /**
   * Display name
   */
  name: string;

  /**
   * Platform
   */
  platform: Platform;

  /**
   * Current state
   */
  state: DeviceState;

  /**
   * Device type/model description
   */
  deviceType: string;

  /**
   * OS version
   */
  osVersion: string;

  /**
   * Platform-specific identifier (UDID for iOS, AVD name for Android)
   */
  platformId: string;
}

/**
 * Tree node types for Device Manager
 */
export type DeviceNodeType = 
  | 'platform'      // Android or iOS header
  | 'device'        // Individual device
  | 'action'        // Device action (launch, stop, delete)
  | 'create'        // Create new device
  | 'placeholder';  // Info/empty message

/**
 * Action types for devices
 */
export type DeviceAction = 'launch' | 'stop' | 'delete';

/**
 * Device node data
 */
export interface DeviceNodeData {
  type: DeviceNodeType;
  platform?: Platform;
  device?: UnifiedDevice;
  action?: DeviceAction;
  message?: string;
}
