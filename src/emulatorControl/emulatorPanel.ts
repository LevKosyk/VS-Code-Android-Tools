import * as vscode from 'vscode';
import { AdbService, EmulatorService, EmulatorStateService, EmulatorInfo, DEFAULT_LOCATION_PRESETS, NetworkProfile } from '../services';
import { showError, showInfo, showWarning, withProgress } from '../ui/notifications';
interface WebviewMessage {
  type: string;
  deviceId?: string;
  payload?: any;
}
export class EmulatorControlPanel {
  public static currentPanel: EmulatorControlPanel | undefined;
  private static readonly viewType = 'emulatorControl';
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];
  private selectedDeviceId: string | undefined;
  private refreshInterval: NodeJS.Timeout | undefined;
  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.panel.webview.html = this.getHtmlContent();
    this.panel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => this.handleMessage(message),
      null,
      this.disposables
    );
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.onDidChangeViewState(
      () => {
        if (this.panel.visible) {
          this.refreshStatus();
        }
      },
      null,
      this.disposables
    );
    const stateService = EmulatorStateService.getInstance();
    stateService.on('change', (emulators: EmulatorInfo[]) => {
      this.handleEmulatorChange(emulators);
    });
    this.refreshEmulators();
  }
  public static createOrShow(extensionUri: vscode.Uri): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;
    if (EmulatorControlPanel.currentPanel) {
      EmulatorControlPanel.currentPanel.panel.reveal(column);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      EmulatorControlPanel.viewType,
      'Emulator Control',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );
    EmulatorControlPanel.currentPanel = new EmulatorControlPanel(panel, extensionUri);
  }
  private handleEmulatorChange(emulators: EmulatorInfo[]): void {
    this.postMessage({ type: 'emulators', data: emulators });
    const selectedExists = emulators.find(e => e.deviceId === this.selectedDeviceId);
    if (!this.selectedDeviceId && emulators.length > 0) {
      this.selectedDeviceId = emulators[0].deviceId;
      this.refreshStatus();
    } else if (this.selectedDeviceId && !selectedExists) {
      if (emulators.length > 0) {
        this.selectedDeviceId = emulators[0].deviceId;
      } else {
        this.selectedDeviceId = undefined;
      }
      this.refreshStatus();
    } else if (this.selectedDeviceId) {
      this.refreshStatus();
    }
  }
  private stopRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = undefined;
    }
  }
  private async refreshEmulators(): Promise<void> {
    const emulators = await EmulatorService.listRunning();
    this.handleEmulatorChange(emulators);
  }
  private async refreshStatus(): Promise<void> {
    if (!this.selectedDeviceId) {
      this.postMessage({ type: 'status', data: null });
      return;
    }
    try {
      const status = await EmulatorService.getStatus(this.selectedDeviceId);
      const isRecording = AdbService.isRecording(this.selectedDeviceId);
      this.postMessage({ 
        type: 'status', 
        data: { ...status, isRecording } 
      });
    } catch (error) {
      console.error('Error refreshing status:', error);
    }
  }
  private postMessage(data: any): void {
    this.panel.webview.postMessage(data);
  }
  private async handleMessage(message: WebviewMessage): Promise<void> {
    const deviceId = message.deviceId || this.selectedDeviceId;
    if (!deviceId && message.type !== 'refresh' && message.type !== 'selectDevice' && message.type !== 'installApk') {
      showWarning('No emulator selected.');
      return;
    }
    try {
      switch (message.type) {
        case 'refresh':
          await this.refreshEmulators();
          break;
        case 'selectDevice':
          this.selectedDeviceId = message.payload;
          await this.refreshStatus();
          break;
        case 'rotate':
          await this.runWithProgress('Rotating screen...', async () => {
            const { rotateScreen } = await import('../emulatorControl/emulatorCommands');
            const result = await rotateScreen(deviceId!);
            this.showResult(result);
          });
          break;
        case 'screenshot':
          await this.runWithProgress('Taking screenshot...', async () => {
            const { takeScreenshot } = await import('../emulatorControl/emulatorCommands');
            const result = await takeScreenshot(deviceId!);
            this.showResult(result);
            const screenshotData = result.data as { path?: string } | undefined;
            if (result.success && screenshotData?.path) {
              vscode.commands.executeCommand('vscode.open', vscode.Uri.file(screenshotData.path));
            }
          });
          break;
        case 'startRecording':
          await this.runWithProgress('Starting recording...', async () => {
            const result = await AdbService.startScreenRecording(deviceId!);
            this.showResult(result);
            this.refreshStatus();
          });
          break;
        case 'stopRecording':
          await this.runWithProgress('Stopping recording...', async () => {
            const result = await AdbService.stopScreenRecording(deviceId!);
            this.showResult(result);
            if (result.success && result.data) {
              vscode.commands.executeCommand('vscode.open', vscode.Uri.file(result.data));
            }
            this.refreshStatus();
          });
          break;
        case 'coldBoot':
          await this.runWithProgress('Cold booting...', async () => {
            const { coldBoot } = await import('../emulatorControl/emulatorCommands');
            const status = await EmulatorService.getStatus(deviceId!);
            if (status?.avdName) {
              const result = await coldBoot(deviceId!, status.avdName);
              this.showResult(result);
            }
          });
          break;
        case 'warmBoot':
          await this.runWithProgress('Warm booting...', async () => {
            const { warmBoot } = await import('../emulatorControl/emulatorCommands');
            const status = await EmulatorService.getStatus(deviceId!);
            if (status?.avdName) {
              const result = await warmBoot(deviceId!, status.avdName);
              this.showResult(result);
            }
          });
          break;
        case 'wipeData':
          const confirm = await vscode.window.showWarningMessage(
            'Wipe all emulator data? This cannot be undone.',
            { modal: true },
            'Wipe Data'
          );
          if (confirm === 'Wipe Data') {
            await this.runWithProgress('Wiping data...', async () => {
              const { wipeData } = await import('../emulatorControl/emulatorCommands');
              const status = await EmulatorService.getStatus(deviceId!);
              if (status?.avdName) {
                const result = await wipeData(deviceId!, status.avdName);
                this.showResult(result);
              }
            });
          }
          break;
        case 'installApk':
          const apkUri = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            filters: { 'APK Files': ['apk'] },
            title: 'Select APK to Install',
          });
          if (apkUri && apkUri[0] && deviceId) {
            await this.runWithProgress('Installing APK...', async () => {
              const result = await AdbService.installApk(deviceId!, apkUri[0].fsPath);
              this.showResult(result);
            });
          }
          break;
        case 'uninstallApp':
          const packages = await AdbService.listPackages(deviceId!);
          const selected = await vscode.window.showQuickPick(packages, {
            placeHolder: 'Select app to uninstall',
            title: 'Uninstall App',
          });
          if (selected) {
            await this.runWithProgress('Uninstalling...', async () => {
              const result = await AdbService.uninstallApp(deviceId!, selected);
              this.showResult(result);
            });
          }
          break;
        case 'restartApp':
          const allPackages = await AdbService.listPackages(deviceId!);
          const appToRestart = await vscode.window.showQuickPick(allPackages, {
            placeHolder: 'Select app to restart',
            title: 'Restart App',
          });
          if (appToRestart) {
            await this.runWithProgress('Restarting app...', async () => {
              const result = await AdbService.restartApp(deviceId!, appToRestart);
              this.showResult(result);
            });
          }
          break;
        case 'setLocation':
          const { latitude, longitude } = message.payload;
          await this.runWithProgress('Setting location...', async () => {
            const result = await AdbService.setLocation(deviceId!, latitude, longitude);
            this.showResult(result);
          });
          break;
        case 'setLocationPreset':
          const preset = DEFAULT_LOCATION_PRESETS.find(p => p.id === message.payload);
          if (preset) {
            await this.runWithProgress('Setting location...', async () => {
              const result = await AdbService.setLocation(deviceId!, preset.latitude, preset.longitude);
              this.showResult(result);
            });
          }
          break;
        case 'toggleNetwork':
          await this.runWithProgress('Toggling network...', async () => {
            const result = await EmulatorService.toggleNetwork(deviceId!);
            this.showResult(result);
            this.refreshStatus();
          });
          break;
        case 'setNetworkProfile':
          const profile = message.payload as NetworkProfile;
          await this.runWithProgress('Setting network profile...', async () => {
            const result = await EmulatorService.setNetworkProfile(deviceId!, profile);
            this.showResult(result);
          });
          break;
        case 'setBattery':
          const { level, status } = message.payload;
          await this.runWithProgress('Setting battery...', async () => {
            if (level !== undefined) {
              await AdbService.setBatteryLevel(deviceId!, level);
            }
            if (status) {
              await AdbService.setBatteryStatus(deviceId!, status);
            }
            this.refreshStatus();
            showInfo('Battery updated.');
          });
          break;
      }
    } catch (error) {
      showError(
        error instanceof Error ? error.message : 'Operation failed'
      );
    }
  }
  private async runWithProgress<T>(title: string, operation: () => Promise<T>): Promise<T> {
    return withProgress(title, () => operation());
  }
  private showResult(result: { success: boolean; message: string }): void {
    if (result.success) {
      showInfo(result.message);
    } else {
      showError(result.message);
    }
  }
  public dispose(): void {
    EmulatorControlPanel.currentPanel = undefined;
    this.stopRefresh();
    this.panel.dispose();
    while (this.disposables.length) {
      const d = this.disposables.pop();
      if (d) d.dispose();
    }
  }
  private getHtmlContent(): string {
    const nonce = this.getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Emulator Control</title>
  <style>
    :root {
      --vscode-font: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, sans-serif);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font);
      padding: 16px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }
    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .header select {
      flex: 1;
      padding: 6px 10px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      font-size: 13px;
    }
    .status-indicator {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
    }
    .status-indicator.running {
      background: rgba(40, 167, 69, 0.15);
      color: #28a745;
    }
    .status-indicator.booting {
      background: rgba(255, 193, 7, 0.15);
      color: #ffc107;
    }
    .status-indicator.offline {
      background: rgba(220, 53, 69, 0.15);
      color: #dc3545;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
    }
    .icon-btn {
      background: transparent;
      border: none;
      color: var(--vscode-foreground);
      cursor: pointer;
      padding: 6px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .icon-btn:hover {
      background: var(--vscode-toolbar-hoverBackground);
    }
    .section {
      margin-bottom: 20px;
    }
    .section-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 10px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 8px;
    }
    .info-item {
      background: var(--vscode-input-background);
      padding: 10px 12px;
      border-radius: 6px;
    }
    .info-label {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    .info-value {
      font-size: 14px;
      font-weight: 500;
    }
    .btn-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 8px;
    }
    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 10px 16px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      border-radius: 4px;
      font-size: 13px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .btn.primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .btn.primary:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .btn.danger {
      background: rgba(220, 53, 69, 0.15);
      color: #dc3545;
    }
    .btn.recording {
      background: rgba(220, 53, 69, 0.2);
      color: #dc3545;
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }
    .location-form {
      display: flex;
      gap: 8px;
      margin-bottom: 10px;
    }
    .location-form input {
      flex: 1;
      padding: 8px 10px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      font-size: 13px;
    }
    .battery-control {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .battery-slider {
      flex: 1;
      height: 8px;
      -webkit-appearance: none;
      background: var(--vscode-input-background);
      border-radius: 4px;
      outline: none;
    }
    .battery-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--vscode-button-background);
      cursor: pointer;
    }
    .battery-value {
      min-width: 45px;
      text-align: right;
      font-weight: 500;
    }
    .network-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .network-row select {
      flex: 1;
      padding: 8px 10px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
    }
    .empty-state {
      text-align: center;
      padding: 40px 20px;
      color: var(--vscode-descriptionForeground);
    }
    .empty-state h3 {
      margin-bottom: 8px;
      color: var(--vscode-foreground);
    }
  </style>
</head>
<body>
  <div id="app">
    <div class="empty-state" id="emptyState">
      <h3>No Running Emulators</h3>
      <p>Start an emulator to use these controls</p>
    </div>
    <div id="controlPanel" style="display: none;">
      <div class="header">
        <select id="deviceSelect"></select>
        <span class="status-indicator running" id="statusIndicator">
          <span class="status-dot"></span>
          <span id="statusText">Running</span>
        </span>
        <button class="icon-btn" onclick="refresh()" title="Refresh">↻</button>
      </div>
      <div class="section">
        <div class="section-title">Device Info</div>
        <div class="info-grid" id="infoGrid">
          <div class="info-item"><div class="info-label">Android</div><div class="info-value" id="infoAndroid">-</div></div>
          <div class="info-item"><div class="info-label">API Level</div><div class="info-value" id="infoApi">-</div></div>
          <div class="info-item"><div class="info-label">ABI</div><div class="info-value" id="infoAbi">-</div></div>
          <div class="info-item"><div class="info-label">Resolution</div><div class="info-value" id="infoRes">-</div></div>
          <div class="info-item"><div class="info-label">Memory</div><div class="info-value" id="infoMem">-</div></div>
          <div class="info-item"><div class="info-label">Battery</div><div class="info-value" id="infoBat">-</div></div>
        </div>
      </div>
      <div class="section">
        <div class="section-title">Screen</div>
        <div class="btn-grid">
          <button class="btn" onclick="send('rotate')">Rotate</button>
          <button class="btn" onclick="send('screenshot')">Screenshot</button>
          <button class="btn" id="recordBtn" onclick="toggleRecording()">Record</button>
        </div>
      </div>
      <div class="section">
        <div class="section-title">Actions</div>
        <div class="btn-grid">
          <button class="btn" onclick="send('coldBoot')">Cold Boot</button>
          <button class="btn" onclick="send('warmBoot')">Warm Boot</button>
          <button class="btn danger" onclick="send('wipeData')">Wipe Data</button>
        </div>
      </div>
      <div class="section">
        <div class="section-title">App Management</div>
        <div class="btn-grid">
          <button class="btn primary" onclick="send('installApk')">Install APK</button>
          <button class="btn" onclick="send('uninstallApp')">Uninstall</button>
          <button class="btn" onclick="send('restartApp')">Restart App</button>
        </div>
      </div>
      <div class="section">
        <div class="section-title">Location</div>
        <div class="location-form">
          <input type="number" id="latitude" placeholder="Latitude" step="0.0001" value="37.4220">
          <input type="number" id="longitude" placeholder="Longitude" step="0.0001" value="-122.0841">
          <button class="btn primary" onclick="setLocation()">Set</button>
        </div>
        <div class="btn-grid">
          <button class="btn" onclick="send('setLocationPreset', 'googleplex')">Googleplex</button>
          <button class="btn" onclick="send('setLocationPreset', 'nyc')">New York</button>
          <button class="btn" onclick="send('setLocationPreset', 'london')">London</button>
          <button class="btn" onclick="send('setLocationPreset', 'tokyo')">Tokyo</button>
        </div>
      </div>
      <div class="section">
        <div class="section-title">Network</div>
        <div class="network-row">
          <button class="btn" id="networkToggle" onclick="send('toggleNetwork')">Toggle</button>
          <select id="networkProfile" onchange="setNetworkProfile()">
            <option value="full">Full Speed</option>
            <option value="lte">LTE</option>
            <option value="3g">3G</option>
            <option value="2g">2G</option>
            <option value="edge">EDGE</option>
            <option value="offline">Offline</option>
          </select>
        </div>
      </div>
      <div class="section">
        <div class="section-title">Battery Simulation</div>
        <div class="battery-control">
          <input type="range" class="battery-slider" id="batteryLevel" min="0" max="100" value="100" oninput="updateBatteryDisplay()">
          <span class="battery-value" id="batteryValue">100%</span>
          <select id="batteryStatus">
            <option value="charging">Charging</option>
            <option value="discharging">Discharging</option>
            <option value="not-charging">Not Charging</option>
            <option value="full">Full</option>
          </select>
          <button class="btn" onclick="setBattery()">Set</button>
        </div>
      </div>
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let emulators = [];
    let selectedDeviceId = null;
    let isRecording = false;
    function send(type, payload) {
      vscode.postMessage({ type, deviceId: selectedDeviceId, payload });
    }
    function refresh() {
      send('refresh');
    }
    function setLocation() {
      const lat = parseFloat(document.getElementById('latitude').value);
      const lng = parseFloat(document.getElementById('longitude').value);
      if (!isNaN(lat) && !isNaN(lng)) {
        send('setLocation', { latitude: lat, longitude: lng });
      }
    }
    function setNetworkProfile() {
      const profile = document.getElementById('networkProfile').value;
      send('setNetworkProfile', profile);
    }
    function setBattery() {
      const level = parseInt(document.getElementById('batteryLevel').value);
      const status = document.getElementById('batteryStatus').value;
      send('setBattery', { level: level, status: status });
    }
    function updateBatteryDisplay() {
      const val = document.getElementById('batteryLevel').value;
      document.getElementById('batteryValue').textContent = val + '%';
    }
    function toggleRecording() {
      if (isRecording) {
        send('stopRecording');
      } else {
        send('startRecording');
      }
    }
    function updateUI() {
      const empty = document.getElementById('emptyState');
      const panel = document.getElementById('controlPanel');
      if (emulators.length === 0) {
        empty.style.display = 'block';
        panel.style.display = 'none';
      } else {
        empty.style.display = 'none';
        panel.style.display = 'block';
        const select = document.getElementById('deviceSelect');
        select.innerHTML = emulators.map(e => {
          const isBooting = e.state === 'booting';
          const label = e.avdName + (isBooting ? ' (Booting...)' : '');
          return '<option value="' + e.deviceId + '"' + (e.deviceId === selectedDeviceId ? ' selected' : '') + '>' + 
            label + '</option>';
        }).join('');
      }
    }
    document.getElementById('deviceSelect').addEventListener('change', (e) => {
      selectedDeviceId = e.target.value;
      send('selectDevice', selectedDeviceId);
    });
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'emulators') {
        emulators = msg.data || [];
        if (emulators.length > 0 && !selectedDeviceId) {
          selectedDeviceId = emulators[0].deviceId;
        }
        updateUI();
      }
      if (msg.type === 'status' && msg.data) {
        const d = msg.data;
        document.getElementById('infoAndroid').textContent = d.avdName || '-';
        document.getElementById('infoMem').textContent = d.memory ? d.memory.usedPercent + '% used' : '-';
        document.getElementById('infoBat').textContent = d.battery ? d.battery.level + '%' : '-';
        const indicator = document.getElementById('statusIndicator');
        indicator.className = 'status-indicator ' + d.state;
        let statusText = 'Unknown';
        if (d.state === 'running') statusText = 'Running';
        else if (d.state === 'booting') statusText = 'Booting...';
        else statusText = 'Offline';
        document.getElementById('statusText').textContent = statusText;
        const isBooting = d.state === 'booting';
        const btns = document.querySelectorAll('.btn:not(.danger)');
        btns.forEach(b => {
             if (b.id !== 'networkToggle') {
                 (b as HTMLButtonElement).disabled = isBooting;
             }
        });
        const actions = document.querySelectorAll('.btn');
        actions.forEach(b => {
             const text = b.textContent;
             if (text !== 'Cold Boot' && text !== 'Warm Boot' && text !== 'Wipe Data') {
                 (b as HTMLButtonElement).disabled = isBooting;
             }
        });
        isRecording = d.isRecording || false;
        const recordBtn = document.getElementById('recordBtn');
        recordBtn.textContent = isRecording ? 'Stop Recording' : 'Record';
        recordBtn.className = isRecording ? 'btn recording' : 'btn';
      }
    });
  </script>
</body>
</html>`;
  }
  private getNonce(): string {
    let text = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
  }
}
