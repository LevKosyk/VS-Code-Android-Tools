/**
 * Android Debug Adapter
 * Implements VS Code Debug Adapter Protocol for Android debugging
 */

import * as vscode from 'vscode';
import { 
  listDebuggableProcesses, 
  forwardJdwpPort, 
  removeJdwpForward,
  verifyJdwpConnection,
  findAvailablePort,
} from './jdwpConnection';
import { 
  DebuggableProcess, 
  DebugState, 
  Breakpoint, 
  StackFrame, 
  Variable, 
  ThreadInfo 
} from './types';
import { listDevices } from '../devices/deviceManager';

/**
 * Debug session manager
 * This is a minimal implementation that provides attach/detach functionality
 * and basic debug state management. Full JDWP protocol would require
 * additional libraries (e.g., jdwp-protocol npm package).
 */
export class AndroidDebugSession {
  private _state: DebugState = 'disconnected';
  private _deviceId: string | null = null;
  private _processInfo: DebuggableProcess | null = null;
  private _port: number | null = null;
  private _breakpoints: Map<string, Breakpoint[]> = new Map();
  private _statusBarItem: vscode.StatusBarItem | null = null;
  private _onStateChange: vscode.EventEmitter<DebugState>;

  constructor() {
    this._onStateChange = new vscode.EventEmitter<DebugState>();
    this.createStatusBarItem();
  }

  get state(): DebugState {
    return this._state;
  }

  get onStateChange(): vscode.Event<DebugState> {
    return this._onStateChange.event;
  }

  get isAttached(): boolean {
    return this._state === 'attached' || this._state === 'running' || this._state === 'paused';
  }

  /**
   * Create debug status bar item
   */
  private createStatusBarItem(): void {
    this._statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      98
    );
    this._statusBarItem.command = 'android-toolkit.debugStatus';
    this.updateStatusBar();
    this._statusBarItem.show();
  }

  /**
   * Update status bar display
   */
  private updateStatusBar(): void {
    if (!this._statusBarItem) {return;}

    switch (this._state) {
      case 'disconnected':
        this._statusBarItem.text = '$(debug-disconnect) Android Debug';
        this._statusBarItem.tooltip = 'Click to attach debugger';
        this._statusBarItem.backgroundColor = undefined;
        break;
      case 'connecting':
        this._statusBarItem.text = '$(loading~spin) Connecting...';
        this._statusBarItem.tooltip = 'Establishing debug connection';
        break;
      case 'attached':
      case 'running':
        this._statusBarItem.text = `$(debug) ${this._processInfo?.packageName || 'Attached'}`;
        this._statusBarItem.tooltip = 'Debugger attached - Click to detach';
        this._statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        break;
      case 'paused':
        this._statusBarItem.text = `$(debug-pause) ${this._processInfo?.packageName || 'Paused'}`;
        this._statusBarItem.tooltip = 'Debugger paused at breakpoint';
        this._statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        break;
      case 'error':
        this._statusBarItem.text = '$(error) Debug Error';
        this._statusBarItem.tooltip = 'Debug connection failed';
        this._statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        break;
    }
  }

  /**
   * Set debug state
   */
  private setState(state: DebugState): void {
    this._state = state;
    this.updateStatusBar();
    this._onStateChange.fire(state);
  }

  /**
   * Select device for debugging
   */
  async selectDevice(): Promise<string | undefined> {
    const devices = await listDevices();
    const onlineDevices = devices.filter(d => d.status === 'online');

    if (onlineDevices.length === 0) {
      vscode.window.showErrorMessage('No online Android devices found.');
      return undefined;
    }

    if (onlineDevices.length === 1) {
      return onlineDevices[0].id;
    }

    const picked = await vscode.window.showQuickPick(
      onlineDevices.map(d => ({
        label: d.id,
        description: d.type,
        deviceId: d.id,
      })),
      { placeHolder: 'Select device for debugging' }
    );

    return picked?.deviceId;
  }

  /**
   * Select process to debug
   */
  async selectProcess(deviceId: string): Promise<DebuggableProcess | undefined> {
    const processes = await listDebuggableProcesses(deviceId);

    if (processes.length === 0) {
      vscode.window.showErrorMessage(
        'No debuggable processes found. Make sure your app is running and has debuggable=true.'
      );
      return undefined;
    }

    const picked = await vscode.window.showQuickPick(
      processes.map(p => ({
        label: p.packageName,
        description: `PID: ${p.pid}`,
        process: p,
      })),
      { placeHolder: 'Select process to debug' }
    );

    return picked?.process;
  }

  /**
   * Attach debugger to a running process
   */
  async attach(): Promise<boolean> {
    if (this.isAttached) {
      vscode.window.showWarningMessage('Debugger already attached. Detach first.');
      return false;
    }

    this.setState('connecting');

    try {
      // Select device
      const deviceId = await this.selectDevice();
      if (!deviceId) {
        this.setState('disconnected');
        return false;
      }

      // Select process
      const process = await this.selectProcess(deviceId);
      if (!process) {
        this.setState('disconnected');
        return false;
      }

      // Find available port and forward JDWP
      const localPort = await findAvailablePort();
      await forwardJdwpPort(deviceId, process.pid, localPort);

      // Verify connection
      const connected = await verifyJdwpConnection(localPort);
      if (!connected) {
        await removeJdwpForward(deviceId, localPort);
        throw new Error('Failed to establish JDWP connection');
      }

      // Store session info
      this._deviceId = deviceId;
      this._processInfo = process;
      this._port = localPort;

      this.setState('attached');
      vscode.window.showInformationMessage(
        `Debugger attached to ${process.packageName} (PID: ${process.pid})`
      );

      return true;
    } catch (error) {
      this.setState('error');
      vscode.window.showErrorMessage(
        `Failed to attach debugger: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return false;
    }
  }

  /**
   * Detach debugger
   */
  async detach(): Promise<void> {
    if (!this.isAttached) {
      return;
    }

    // Remove port forward
    if (this._deviceId && this._port) {
      await removeJdwpForward(this._deviceId, this._port);
    }

    const packageName = this._processInfo?.packageName;

    // Clear session
    this._deviceId = null;
    this._processInfo = null;
    this._port = null;

    this.setState('disconnected');
    vscode.window.showInformationMessage(`Debugger detached from ${packageName || 'app'}`);
  }

  /**
   * Toggle breakpoint at current cursor position
   */
  async toggleBreakpoint(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor');
      return;
    }

    const file = editor.document.uri.fsPath;
    const line = editor.selection.active.line + 1; // Convert to 1-indexed

    // Check if file is Java or Kotlin
    const lang = editor.document.languageId;
    if (lang !== 'java' && lang !== 'kotlin') {
      vscode.window.showWarningMessage('Breakpoints only supported in Java/Kotlin files');
      return;
    }

    // Get or create breakpoints for this file
    let fileBreakpoints = this._breakpoints.get(file) || [];
    
    // Check if breakpoint exists at this line
    const existingIndex = fileBreakpoints.findIndex(bp => bp.line === line);
    
    if (existingIndex >= 0) {
      // Remove existing breakpoint
      fileBreakpoints.splice(existingIndex, 1);
      vscode.window.showInformationMessage(`Breakpoint removed at line ${line}`);
    } else {
      // Add new breakpoint
      const bp: Breakpoint = {
        id: Date.now(),
        file,
        line,
        verified: this.isAttached, // Only verified if debugger is attached
      };
      fileBreakpoints.push(bp);
      vscode.window.showInformationMessage(`Breakpoint added at line ${line}`);
    }

    this._breakpoints.set(file, fileBreakpoints);
    
    // Update VS Code breakpoint decorations
    this.updateBreakpointDecorations(editor);
  }

  /**
   * Update breakpoint decorations in editor
   */
  private updateBreakpointDecorations(editor: vscode.TextEditor): void {
    const file = editor.document.uri.fsPath;
    const breakpoints = this._breakpoints.get(file) || [];

    // Note: VS Code has its own breakpoint management via debug.breakpoints
    // This is a simplified implementation showing the concept
    // In production, you'd use the VS Code debug API directly
  }

  /**
   * Get all breakpoints
   */
  getBreakpoints(): Breakpoint[] {
    const all: Breakpoint[] = [];
    for (const bps of this._breakpoints.values()) {
      all.push(...bps);
    }
    return all;
  }

  /**
   * Show debug status info
   */
  showStatus(): void {
    if (this.isAttached) {
      vscode.window.showInformationMessage(
        `Debugger attached to ${this._processInfo?.packageName} (PID: ${this._processInfo?.pid}) on port ${this._port}`,
        'Detach'
      ).then(selection => {
        if (selection === 'Detach') {
          this.detach();
        }
      });
    } else {
      vscode.window.showInformationMessage(
        'Debugger not attached',
        'Attach'
      ).then(selection => {
        if (selection === 'Attach') {
          this.attach();
        }
      });
    }
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.detach();
    this._statusBarItem?.dispose();
    this._onStateChange.dispose();
  }
}

// Global debug session instance
export const debugSession = new AndroidDebugSession();
