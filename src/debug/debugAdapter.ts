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
  DebugState 
} from './types';
import { listDevices } from '../devices/deviceManager';
import { showError, showInfo, showWarning } from '../ui/notifications';
export class AndroidDebugSession {
  private _state: DebugState = 'disconnected';
  private _deviceId: string | null = null;
  private _processInfo: DebuggableProcess | null = null;
  private _port: number | null = null;
  private _debugSession: vscode.DebugSession | null = null;
  private _debugSessionName: string | null = null;
  private _debugListeners: vscode.Disposable[] = [];
  private _statusBarItem: vscode.StatusBarItem | null = null;
  private _onStateChange: vscode.EventEmitter<DebugState>;
  constructor() {
    this._onStateChange = new vscode.EventEmitter<DebugState>();
    this.createStatusBarItem();
    this.registerDebugListeners();
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
  private createStatusBarItem(): void {
    this._statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      98
    );
    this._statusBarItem.command = 'android-toolkit.debugStatus';
    this.updateStatusBar();
    this._statusBarItem.show();
  }
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
  private setState(state: DebugState): void {
    this._state = state;
    this.updateStatusBar();
    this._onStateChange.fire(state);
  }
  private registerDebugListeners(): void {
    this._debugListeners.push(
      vscode.debug.onDidStartDebugSession((session) => {
        if (this._debugSessionName && session.name === this._debugSessionName) {
          this._debugSession = session;
          this.setState('running');
        }
      }),
      vscode.debug.onDidTerminateDebugSession(async (session) => {
        if (this._debugSession && session.id === this._debugSession.id) {
          await this.cleanupAfterDebug();
        }
      })
    );
  }
  private async cleanupAfterDebug(): Promise<void> {
    if (this._deviceId && this._port) {
      await removeJdwpForward(this._deviceId, this._port);
    }
    this._deviceId = null;
    this._processInfo = null;
    this._port = null;
    this._debugSession = null;
    this._debugSessionName = null;
    this.setState('disconnected');
  }
  async selectDevice(): Promise<string | undefined> {
    const devices = await listDevices();
    const onlineDevices = devices.filter(d => d.status === 'online');
    if (onlineDevices.length === 0) {
      showError('No online Android devices found.');
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
  async selectProcess(deviceId: string): Promise<DebuggableProcess | undefined> {
    const processes = await listDebuggableProcesses(deviceId);
    if (processes.length === 0) {
      showError(
        'No debuggable processes found. Run a Debug build (installDebug) and ensure debuggable=true.'
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
  async attach(): Promise<boolean> {
    if (this.isAttached) {
      showWarning('Debugger already attached. Detach first.');
      return false;
    }
    this.setState('connecting');
    try {
      const javaDebug = vscode.extensions.getExtension('vscjava.vscode-java-debug');
      if (!javaDebug) {
        this.setState('disconnected');
        showError(
          'Java Debugger extension not found. Install "Debugger for Java" to use Android debugging.'
        );
        return false;
      }
      const deviceId = await this.selectDevice();
      if (!deviceId) {
        this.setState('disconnected');
        return false;
      }
      const process = await this.selectProcess(deviceId);
      if (!process) {
        this.setState('disconnected');
        return false;
      }
      const localPort = await findAvailablePort();
      await forwardJdwpPort(deviceId, process.pid, localPort);
      const connected = await verifyJdwpConnection(localPort);
      if (!connected) {
        await removeJdwpForward(deviceId, localPort);
        throw new Error('Failed to establish JDWP connection');
      }
      this._deviceId = deviceId;
      this._processInfo = process;
      this._port = localPort;
      this._debugSessionName = `Android JDWP: ${process.packageName}`;
      await javaDebug.activate();
      const started = await vscode.debug.startDebugging(
        undefined,
        {
          type: 'java',
          name: this._debugSessionName,
          request: 'attach',
          hostName: '127.0.0.1',
          port: localPort,
        }
      );
      if (!started) {
        await removeJdwpForward(deviceId, localPort);
        this.setState('disconnected');
        showError('Failed to start Java debug session.');
        return false;
      }
      this.setState('attached');
      showInfo(
        `Debugger attached to ${process.packageName} (PID: ${process.pid})`
      );
      return true;
    } catch (error) {
      this.setState('error');
      showError(
        `Failed to attach debugger: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return false;
    }
  }
  async attachTo(deviceId: string, process: DebuggableProcess): Promise<boolean> {
    if (this.isAttached) {
      showWarning('Debugger already attached. Detach first.');
      return false;
    }
    this.setState('connecting');
    try {
      const localPort = await findAvailablePort();
      await forwardJdwpPort(deviceId, process.pid, localPort);
      const connected = await verifyJdwpConnection(localPort);
      if (!connected) {
        await removeJdwpForward(deviceId, localPort);
        throw new Error('Failed to establish JDWP connection');
      }
      this._deviceId = deviceId;
      this._processInfo = process;
      this._port = localPort;
      this._debugSessionName = `Android JDWP: ${process.packageName}`;
      const javaDebug = vscode.extensions.getExtension('vscjava.vscode-java-debug');
      if (javaDebug) {
        await javaDebug.activate();
      }
      const started = await vscode.debug.startDebugging(
        undefined,
        {
          type: 'java',
          name: this._debugSessionName,
          request: 'attach',
          hostName: '127.0.0.1',
          port: localPort,
        }
      );
      if (!started) {
        await removeJdwpForward(deviceId, localPort);
        this.setState('disconnected');
        showError('Failed to start Java debug session.');
        return false;
      }
      this.setState('attached');
      showInfo(
        `Debugger attached to ${process.packageName} (PID: ${process.pid})`
      );
      return true;
    } catch (error) {
      this.setState('error');
      showError(
        `Failed to attach debugger: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return false;
    }
  }
  async detach(): Promise<void> {
    if (!this.isAttached) {
      return;
    }
    const packageName = this._processInfo?.packageName;
    if (this._debugSession) {
      await vscode.debug.stopDebugging(this._debugSession);
      showInfo(`Debugger detached from ${packageName || 'app'}.`);
      return;
    }
    await this.cleanupAfterDebug();
    showInfo(`Debugger detached from ${packageName || 'app'}.`);
  }
  async toggleBreakpoint(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      showWarning('No active editor.');
      return;
    }
    const lang = editor.document.languageId;
    if (lang !== 'java' && lang !== 'kotlin') {
      showWarning('Breakpoints are only supported in Java/Kotlin files.');
      return;
    }
    await vscode.commands.executeCommand('editor.debug.action.toggleBreakpoint');
  }
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
  dispose(): void {
    this.detach();
    this._statusBarItem?.dispose();
    this._onStateChange.dispose();
    this._debugListeners.forEach(d => d.dispose());
  }
}
export const debugSession = new AndroidDebugSession();
