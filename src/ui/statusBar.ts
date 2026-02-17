import * as vscode from 'vscode';
import { listDevices } from '../devices/deviceManager';
let statusBarItem: vscode.StatusBarItem | undefined;
let deviceItem: vscode.StatusBarItem | undefined;
let moduleItem: vscode.StatusBarItem | undefined;
let variantItem: vscode.StatusBarItem | undefined;
let runItem: vscode.StatusBarItem | undefined;
let debugItem: vscode.StatusBarItem | undefined;
let stopItem: vscode.StatusBarItem | undefined;
let selectedDeviceLabel = 'Device: auto';
let selectedModuleLabel = 'Module: app';
let selectedVariantLabel = 'Variant: Debug';
export function createStatusBar(context: vscode.ExtensionContext): vscode.StatusBarItem {
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.command = 'android-toolkit.listDevices';
  statusBarItem.tooltip = 'Click to list Android devices';
  context.subscriptions.push(statusBarItem);
  deviceItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
  deviceItem.command = 'android-toolkit.selectDevice';
  deviceItem.tooltip = 'Select device';
  context.subscriptions.push(deviceItem);
  moduleItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
  moduleItem.command = 'android-toolkit.selectModule';
  moduleItem.tooltip = 'Select module';
  context.subscriptions.push(moduleItem);
  variantItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 97);
  variantItem.command = 'android-toolkit.selectBuildVariant';
  variantItem.tooltip = 'Select build variant';
  context.subscriptions.push(variantItem);
  runItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 96);
  runItem.command = 'android-toolkit.runAppOnTargetSelected';
  runItem.text = '$(play) Run';
  runItem.tooltip = 'Run app';
  context.subscriptions.push(runItem);
  debugItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 95);
  debugItem.command = 'android-toolkit.openDebugPanel';
  debugItem.text = '$(debug) Debug';
  debugItem.tooltip = 'Open debug panel';
  context.subscriptions.push(debugItem);
  stopItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 94);
  stopItem.command = 'android-toolkit.stopApp';
  stopItem.text = '$(debug-stop) Stop';
  stopItem.tooltip = 'Force stop app';
  context.subscriptions.push(stopItem);
  updateStatusBar();
  statusBarItem.show();
  deviceItem.show();
  moduleItem.show();
  variantItem.show();
  runItem.show();
  debugItem.show();
  stopItem.show();
  return statusBarItem;
}
async function updateStatusBar(): Promise<void> {
  if (!statusBarItem) {
    return;
  }
  try {
    const devices = await listDevices();
    const onlineDevices = devices.filter(d => d.status === 'online');
    const runningEmulators = onlineDevices.filter(d => d.type === 'emulator');
    const physicalDevices = onlineDevices.filter(d => d.type === 'physical');
    const parts: string[] = [];
    if (physicalDevices.length > 0) {
      parts.push(`$(device-mobile) ${physicalDevices.length}`);
    }
    if (runningEmulators.length > 0) {
      parts.push(`$(vm) ${runningEmulators.length}`);
    }
    if (parts.length > 0) {
      statusBarItem.text = `$(android) ${parts.join(' ')}`;
      statusBarItem.backgroundColor = undefined;
    } else {
      statusBarItem.text = '$(android) No devices';
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
  } catch {
    statusBarItem.text = '$(android) SDK error';
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  }
  if (deviceItem) {
    deviceItem.text = `$(device-mobile) ${selectedDeviceLabel}`;
  }
  if (moduleItem) {
    moduleItem.text = `$(symbol-class) ${selectedModuleLabel}`;
  }
  if (variantItem) {
    variantItem.text = `$(symbol-enum) ${selectedVariantLabel}`;
  }
}
export function refreshStatusBar(): void {
  updateStatusBar();
}
export function setSelectedDeviceLabel(label: string): void {
  selectedDeviceLabel = label || selectedDeviceLabel;
  if (deviceItem) {
    deviceItem.text = `$(device-mobile) ${selectedDeviceLabel}`;
  }
}
export function setSelectedModuleLabel(label: string): void {
  selectedModuleLabel = label || selectedModuleLabel;
  if (moduleItem) {
    moduleItem.text = `$(symbol-class) ${selectedModuleLabel}`;
  }
}
export function setSelectedVariantLabel(label: string): void {
  selectedVariantLabel = label || selectedVariantLabel;
  if (variantItem) {
    variantItem.text = `$(symbol-enum) ${selectedVariantLabel}`;
  }
}
export function disposeStatusBar(): void {
  if (statusBarItem) {
    statusBarItem.dispose();
    statusBarItem = undefined;
  }
  deviceItem?.dispose();
  moduleItem?.dispose();
  variantItem?.dispose();
  runItem?.dispose();
  debugItem?.dispose();
  stopItem?.dispose();
}
