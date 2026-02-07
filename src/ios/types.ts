/**
 * iOS Simulator Types
 * Type definitions for iOS simulator management
 */

/**
 * State of an iOS simulator
 */
export type SimulatorState = 'Booted' | 'Shutdown' | 'Unknown';

/**
 * Represents an iOS Simulator
 */
export interface iOSSimulator {
  /**
   * Unique device identifier (UDID)
   */
  udid: string;

  /**
   * Simulator name
   */
  name: string;

  /**
   * Device type (iPhone 15, iPad Pro, etc.)
   */
  deviceType: string;

  /**
   * iOS runtime version (iOS 17.2)
   */
  runtime: string;

  /**
   * Current state
   */
  state: SimulatorState;

  /**
   * Whether this is available (runtime installed)
   */
  isAvailable: boolean;
}

/**
 * iOS Device type for creating simulators
 */
export interface iOSDeviceType {
  /**
   * Full identifier (com.apple.CoreSimulator.SimDeviceType.iPhone-15)
   */
  identifier: string;

  /**
   * Display name (iPhone 15)
   */
  name: string;

  /**
   * Product family (iPhone, iPad, Apple Watch, Apple TV)
   */
  productFamily: 'iPhone' | 'iPad' | 'Apple Watch' | 'Apple TV' | 'Unknown';
}

/**
 * iOS Runtime for creating simulators
 */
export interface iOSRuntime {
  /**
   * Full identifier (com.apple.CoreSimulator.SimRuntime.iOS-17-2)
   */
  identifier: string;

  /**
   * Display name (iOS 17.2)
   */
  name: string;

  /**
   * Version string (17.2)
   */
  version: string;

  /**
   * Build version
   */
  buildversion?: string;

  /**
   * Whether the runtime is available
   */
  isAvailable: boolean;
}

/**
 * Options for creating an iOS simulator
 */
export interface CreateSimulatorOptions {
  /**
   * Simulator name
   */
  name: string;

  /**
   * Device type identifier
   */
  deviceTypeIdentifier: string;

  /**
   * Runtime identifier
   */
  runtimeIdentifier: string;
}
