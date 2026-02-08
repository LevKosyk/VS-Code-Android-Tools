import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { EmulatorService, EmulatorInfo } from './emulatorService';
export class EmulatorStateService extends EventEmitter {
  private static instance: EmulatorStateService;
  private checkInterval: NodeJS.Timeout | undefined;
  private lastEmulators: EmulatorInfo[] = [];
  private isMonitoring = false;
  private constructor() {
    super();
  }
  public static getInstance(): EmulatorStateService {
    if (!EmulatorStateService.instance) {
      EmulatorStateService.instance = new EmulatorStateService();
    }
    return EmulatorStateService.instance;
  }
  public startMonitoring(intervalMs: number = 2000): void {
    if (this.isMonitoring) return;
    console.log('Starting emulator state monitoring...');
    this.isMonitoring = true;
    this.check(); 
    this.checkInterval = setInterval(() => this.check(), intervalMs);
  }
  public stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
    this.isMonitoring = false;
    console.log('Stopped emulator state monitoring.');
  }
  public async forceCheck(): Promise<void> {
    await this.check();
  }
  private async check(): Promise<void> {
    try {
      const currentEmulators = await EmulatorService.listRunning();
      if (this.hasChanged(this.lastEmulators, currentEmulators)) {
        console.log('Emulator state changed:', currentEmulators);
        this.lastEmulators = currentEmulators;
        this.emit('change', currentEmulators);
      }
    } catch (error) {
      console.error('Error checking emulator state:', error);
    }
  }
  private hasChanged(oldList: EmulatorInfo[], newList: EmulatorInfo[]): boolean {
    if (oldList.length !== newList.length) return true;
    const oldMap = new Map(oldList.map(e => [e.deviceId, e]));
    for (const newEmu of newList) {
      const oldEmu = oldMap.get(newEmu.deviceId);
      if (!oldEmu) return true; 
      if (oldEmu.state !== newEmu.state) return true; 
    }
    return false;
  }
}
