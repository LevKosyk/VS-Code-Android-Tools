export type SimulatorState = 'Booted' | 'Shutdown' | 'Unknown';
export interface iOSSimulator {
  udid: string;
  name: string;
  deviceType: string;
  runtime: string;
  state: SimulatorState;
  isAvailable: boolean;
}
export interface iOSDeviceType {
  identifier: string;
  name: string;
  productFamily: 'iPhone' | 'iPad' | 'Apple Watch' | 'Apple TV' | 'Unknown';
}
export interface iOSRuntime {
  identifier: string;
  name: string;
  version: string;
  buildversion?: string;
  isAvailable: boolean;
}
export interface CreateSimulatorOptions {
  name: string;
  deviceTypeIdentifier: string;
  runtimeIdentifier: string;
}
