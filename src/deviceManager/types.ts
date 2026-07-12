export type Platform = 'android';
export type DeviceState = 'running' | 'stopped' | 'unknown';
export interface UnifiedDevice {
  id: string;
  name: string;
  platform: Platform;
  state: DeviceState;
  deviceType: string;
  osVersion: string;
  platformId: string;
  kind: 'emulator' | 'physical';
}
export type DeviceNodeType = 
  | 'platform'      
  | 'device'        
  | 'action'        
  | 'create'        
  | 'placeholder';  
export type DeviceAction = 'launch' | 'stop' | 'delete';
export interface DeviceNodeData {
  type: DeviceNodeType;
  platform?: Platform;
  device?: UnifiedDevice;
  action?: DeviceAction;
  message?: string;
}
