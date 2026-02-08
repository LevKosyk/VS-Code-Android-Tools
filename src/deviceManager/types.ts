export type Platform = 'android' | 'ios';
export type DeviceState = 'running' | 'stopped' | 'unknown';
export interface UnifiedDevice {
  id: string;
  name: string;
  platform: Platform;
  state: DeviceState;
  deviceType: string;
  osVersion: string;
  platformId: string;
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
