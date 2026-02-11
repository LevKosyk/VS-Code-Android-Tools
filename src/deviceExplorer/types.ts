export type DeviceExplorerNodeType = 'device' | 'folder' | 'file' | 'placeholder';

export interface DeviceFileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
}
