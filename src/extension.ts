import * as vscode from 'vscode';
import { detectSdk, isBuildToolsInstalled, isSdkAvailable } from './core/sdkDetector';
import { AndroidToolsError } from './core/errors';
import { checkLanguageExtensions, ensureLanguageMode } from './core/languageSupport';
import { listDevicesDetailed, listRunningEmulators } from './devices/deviceManager';
import { listAvds, startEmulator, stopEmulatorByName } from './emulators/emulatorManager';
import { listSystemImages, listDeviceProfiles, createAvd } from './emulators/avdCreator';
import { AndroidProjectProvider } from './projectView/projectTreeProvider';
import { ProjectTreeItem } from './projectView/projectTreeItem';
import {
  createResourceFlow,
  createFolderFlow,
  createAssetFlow,
  createLocaleFlow,
} from './projectView/androidCreator';
import {
  createFileCommand,
  createFolderCommand,
  renameItemCommand,
  deleteItemCommand,
} from './projectView/fileActions';
import { createAndroidProjectWizard } from './projectView/projectCreator';
import { EmulatorControlProvider } from './emulatorControl/emulatorControlProvider';
import { EmulatorControlPanel } from './emulatorControl/emulatorPanel';
import {
  rotateScreen,
  takeScreenshot,
  coldBoot,
  warmBoot,
  wipeData,
  toggleNetwork,
  getAvdNameForDevice,
  listSnapshots,
  saveSnapshot,
  loadSnapshot,
} from './emulatorControl/emulatorCommands';
import { AdbService, EmulatorService, EmulatorStateService, DEFAULT_LOCATION_PRESETS } from './services';
import { ProfilerPanel } from './profiler/profilerPanel';
import { 
  DeviceManagerProvider,
  createDeviceWizard,
  launchDevice,
  stopDevice,
  deleteDevice,
  UnifiedDevice,
} from './deviceManager';
import { AndroidXmlSymbolProvider, GradleSymbolProvider } from './codeStructure';
import { 
  showInfo, 
  showWarning,
  showError, 
  showToolkitError, 
  withProgress 
} from './ui/notifications';
import { createStatusBar, refreshStatusBar, setSelectedDeviceLabel, setSelectedModuleLabel, setSelectedVariantLabel } from './ui/statusBar';
import { 
  pickDevice, 
  pickAvd, 
  pickSystemImage, 
  pickDeviceProfile, 
  inputAvdName 
} from './ui/quickPicks';
import { findApplicationId, findApplicationModules, findBuildToolsVersion, findLatestApk } from './core/androidProject';
import { RunPanel } from './run/runPanel';
import { ApkAnalyzerPanel } from './apk/apkAnalyzerPanel';
import { ApkComparePanel } from './apk/apkComparePanel';
import { AppInspectionPanel } from './inspection/appInspectionPanel';
import { GradleTasksProvider, runGradleTaskCommand } from './gradle/gradleTasksProvider';
import { listGradleTasks, listVariantsFromTasks, parseVariants, runGradleTaskWithResult } from './gradle/gradleService';
import { createLaunchProfileFlow, deleteLaunchProfileFlow, selectLaunchProfile } from './run/launchProfiles';
import { DeviceFileExplorerProvider } from './deviceExplorer/deviceFileExplorerProvider';
import { deleteDevicePath, pullDeviceFile, pushDeviceFile } from './deviceExplorer/deviceFileService';
import { LayoutPreviewPanel } from './layout/layoutPreviewPanel';
import { LayoutEditorPanel } from './layout/layoutEditorPanel';
import { insertManifestTemplate, validateManifest, openManifestEditor, addManifestEntryFlow } from './projectView/manifestTools';
import { insertValuesTemplate, validateResources } from './projectView/resourceTools';
import { openResourceInspector, openResourceByQuery } from './projectView/resourceInspector';
import { jumpToNavigationArgument, jumpToNavigationDestination, previewNavigationGraphSvg } from './projectView/navigationTools';
import * as path from 'path';
import { DatabaseInspectorPanel } from './database/databaseInspectorPanel';
import { DebugPanel } from './debug/debugPanel';
import { LayoutInspectorPanel } from './layout/layoutInspectorPanel';
import {
  runSigningWizard,
  buildSignedApk,
  buildSignedBundle,
  openPlaySigningHelper,
  bundletoolBuildApks,
  bundletoolInstallApks,
  bumpVersionCodeWizard,
} from './signing/signingWizard';
import { checkProjectHealth } from './core/projectHealth';
import { showGradleOutput, revealGradleOutput } from './gradle/gradleOutput';
import { QuickActionsPanel } from './deviceActions/quickActionsPanel';
import { MappingViewerPanel } from './mapping/mappingViewerPanel';
import { PerformanceMonitorPanel } from './monitor/performanceMonitorPanel';
import { inspectBuildCache } from './gradle/buildCacheInspector';
import { runGradleDoctor } from './gradle/gradleDoctor';
import { runDependencyInsight } from './gradle/dependencyInsight';
import { ComposePreviewPanel } from './compose/composePreviewPanel';
import { ComposeLivePreviewPanel } from './compose/composeLivePreviewPanel';
import { TestRunnerPanel } from './tests/testRunnerPanel';
import { MatrixDashboardPanel } from './matrix/matrixDashboardPanel';
let extensionContext: vscode.ExtensionContext | undefined;
let lastGradleErrorSummary: string | undefined;
interface RunConfiguration {
  id: string;
  name: string;
  moduleName: string;
  variant: string;
  deviceId?: string;
  preTasks: string[];
  gradleArgs: string[];
  env: Record<string, string>;
  launchType: 'default' | 'activity' | 'deeplink';
  activity?: string;
  deepLink?: string;
  extras: Array<{ key: string; value: string }>;
}
const RUN_CONFIGS_KEY = 'runConfigurations';
function handleError(error: unknown): void {
  if (error instanceof AndroidToolsError) {
    showToolkitError(error);
  } else if (error instanceof Error) {
    showError(error.message);
  } else {
    showError('An unexpected error occurred.');
  }
}
function getRunConfigurations(): RunConfiguration[] {
  if (!extensionContext) {
    return [];
  }
  return extensionContext.globalState.get<RunConfiguration[]>(RUN_CONFIGS_KEY, []);
}
async function saveRunConfigurations(configs: RunConfiguration[]): Promise<void> {
  if (!extensionContext) {
    return;
  }
  await extensionContext.globalState.update(RUN_CONFIGS_KEY, configs);
}
function parseCommaList(input: string | undefined): string[] {
  if (!input) {
    return [];
  }
  return input
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}
function parseGradleArgs(input: string | undefined): string[] {
  if (!input) {
    return [];
  }
  return input.split(/\s+/).map(v => v.trim()).filter(Boolean);
}
function parseEnvVars(input: string | undefined): Record<string, string> {
  if (!input) {
    return {};
  }
  const env: Record<string, string> = {};
  for (const pair of input.split(',')) {
    const trimmed = pair.trim();
    if (!trimmed) {
      continue;
    }
    const [key, ...rest] = trimmed.split('=');
    if (!key) {
      continue;
    }
    env[key.trim()] = rest.join('=').trim();
  }
  return env;
}
function parseExtras(input: string | undefined): Array<{ key: string; value: string }> {
  if (!input) {
    return [];
  }
  const extras: Array<{ key: string; value: string }> = [];
  for (const pair of input.split(',')) {
    const trimmed = pair.trim();
    if (!trimmed) {
      continue;
    }
    const [key, ...rest] = trimmed.split('=');
    if (!key) {
      continue;
    }
    extras.push({ key: key.trim(), value: rest.join('=').trim() });
  }
  return extras;
}
async function selectEmulator(): Promise<{ deviceId: string; avdName?: string } | undefined> {
  const emulators = await listRunningEmulators();
  if (emulators.length === 0) {
    showWarning('No running emulators. Start an emulator first.');
    return undefined;
  }
  if (emulators.length === 1) {
    const avdName = await getAvdNameForDevice(emulators[0].id);
    return { deviceId: emulators[0].id, avdName };
  }
  const items = await Promise.all(
    emulators.map(async (emu) => {
      const avdName = await getAvdNameForDevice(emu.id);
      return {
        label: avdName || emu.id,
        description: emu.id,
        deviceId: emu.id,
        avdName,
      };
    })
  );
  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select an emulator',
  });
  return selected ? { deviceId: selected.deviceId, avdName: selected.avdName } : undefined;
}
async function listDevicesCommand(): Promise<void> {
  try {
    const devices = await withProgress('Scanning for devices...', async () => {
      return listDevicesDetailed();
    });
    if (devices.length === 0) {
      showInfo('No Android devices found. Connect a device or start an emulator.');
      return;
    }
    const device = await pickDevice(devices, {
      title: 'Android Devices',
      placeholder: 'Select a device to see details',
    });
    if (device) {
      const details = [
        `ID: ${device.id}`,
        `Type: ${device.type}`,
        `Status: ${device.status}`,
      ];
      if (device.model) {
        details.push(`Model: ${device.model}`);
      }
      if (device.androidVersion) {
        details.push(`Android: ${device.androidVersion}`);
      }
      showInfo(details.join(' | '));
    }
  } catch (error) {
    handleError(error);
  }
}
async function startEmulatorCommand(): Promise<void> {
  try {
    if (!isSdkAvailable()) {
      detectSdk();
    }
    const avds = await withProgress('Loading emulators...', async () => {
      return listAvds();
    });
    const avd = await pickAvd(avds, {
      title: 'Start Emulator',
      filter: 'stopped',
    });
    if (!avd) {
      return;
    }
    await withProgress(`Starting ${avd.name}...`, async (progress) => {
      progress.report({ message: 'Launching emulator...' });
      const deviceId = await startEmulator(avd.name);
      progress.report({ message: 'Waiting for boot...' });
      showInfo(`Emulator ${avd.name} started (${deviceId})`);
      refreshStatusBar();
    });
  } catch (error) {
    handleError(error);
  }
}
async function stopEmulatorCommand(): Promise<void> {
  try {
    const avds = await withProgress('Loading emulators...', async () => {
      return listAvds();
    });
    const avd = await pickAvd(avds, {
      title: 'Stop Emulator',
      filter: 'running',
    });
    if (!avd) {
      return;
    }
    if (avd.deviceId) {
      await saveSnapshot(avd.deviceId, 'auto');
    }
    await withProgress(`Stopping ${avd.name}...`, async () => {
      await stopEmulatorByName(avd.name);
      showInfo(`Emulator ${avd.name} stopped.`);
      refreshStatusBar();
    });
  } catch (error) {
    handleError(error);
  }
}
async function createEmulatorCommand(): Promise<void> {
  try {
    if (!isSdkAvailable()) {
      detectSdk();
    }
    const name = await inputAvdName();
    if (!name) {
      return;
    }
    const images = await withProgress('Loading system images...', async () => {
      return listSystemImages();
    });
    const image = await pickSystemImage(images, {
      title: `Create Emulator: ${name}`,
    });
    if (!image) {
      return;
    }
    const profiles = await withProgress('Loading device profiles...', async () => {
      return listDeviceProfiles();
    });
    const profile = await pickDeviceProfile(profiles, {
      title: `Create Emulator: ${name}`,
    });
    await withProgress(`Creating ${name}...`, async () => {
      await createAvd({
        name,
        systemImage: image.id,
        device: profile?.id,
      });
      showInfo(`Emulator "${name}" created successfully!`);
    });
  } catch (error) {
    handleError(error);
  }
}
async function selectModule(workspaceRoot: string): Promise<string | undefined> {
  const modules = findApplicationModules(workspaceRoot);
  if (modules.length === 0) {
    showError('No Android modules found.');
    return undefined;
  }
  if (modules.length === 1) {
    return modules[0];
  }
  const picked = await vscode.window.showQuickPick(modules, {
    placeHolder: 'Select module',
  });
  return picked || undefined;
}
function getVariantKey(moduleName: string): string {
  return `android-tools.variant.${moduleName}`;
}
function getFlavorKey(moduleName: string): string {
  return `android-tools.flavor.${moduleName}`;
}
function getBuildTypeKey(moduleName: string): string {
  return `android-tools.buildType.${moduleName}`;
}
function getDeviceKey(): string {
  return 'android-tools.selectedDevice';
}
function getModuleKey(): string {
  return 'android-tools.selectedModule';
}
async function getSelectedVariant(moduleName: string): Promise<string> {
  const stored = extensionContext?.globalState.get<string>(getVariantKey(moduleName));
  return stored || 'Debug';
}
async function setSelectedVariant(moduleName: string, variant: string): Promise<void> {
  await extensionContext?.globalState.update(getVariantKey(moduleName), variant);
  setSelectedVariantLabel(`Variant: ${variant}`);
}
async function getSelectedFlavor(moduleName: string): Promise<string> {
  return extensionContext?.globalState.get<string>(getFlavorKey(moduleName)) || '';
}
async function setSelectedFlavor(moduleName: string, flavor: string): Promise<void> {
  await extensionContext?.globalState.update(getFlavorKey(moduleName), flavor);
}
async function getSelectedBuildType(moduleName: string): Promise<string> {
  return extensionContext?.globalState.get<string>(getBuildTypeKey(moduleName)) || 'Debug';
}
async function setSelectedBuildType(moduleName: string, buildType: string): Promise<void> {
  await extensionContext?.globalState.update(getBuildTypeKey(moduleName), buildType);
}
async function getSelectedDeviceId(): Promise<string | undefined> {
  return extensionContext?.globalState.get<string>(getDeviceKey());
}
async function setSelectedDeviceId(deviceId: string, label: string): Promise<void> {
  await extensionContext?.globalState.update(getDeviceKey(), deviceId);
  setSelectedDeviceLabel(`Device: ${label}`);
}
async function getSelectedModule(): Promise<string | undefined> {
  return extensionContext?.globalState.get<string>(getModuleKey());
}
async function setSelectedModule(moduleName: string): Promise<void> {
  await extensionContext?.globalState.update(getModuleKey(), moduleName);
  setSelectedModuleLabel(`Module: ${moduleName}`);
}
async function getAvailableVariants(workspaceRoot: string, moduleName: string): Promise<string[]> {
  const tasks = await listGradleTasks(workspaceRoot);
  return listVariantsFromTasks(tasks, moduleName);
}
async function getVariantOptions(workspaceRoot: string, moduleName: string): Promise<{ buildTypes: string[]; flavors: string[]; variants: string[] }> {
  const tasks = await listGradleTasks(workspaceRoot);
  return parseVariants(tasks, moduleName);
}
async function selectDeviceCommand(): Promise<void> {
  const devices = await listDevicesDetailed();
  const online = devices.filter(d => d.status === 'online');
  if (online.length === 0) {
    showWarning('No online devices found.');
    return;
  }
  const picked = await pickDevice(online, { title: 'Select Device' });
  if (!picked) {
    return;
  }
  await setSelectedDeviceId(picked.id, `${picked.id} (${picked.type})`);
}
async function selectModuleCommand(): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    showError('No workspace folder open.');
    return;
  }
  const modules = findApplicationModules(workspaceRoot);
  if (modules.length === 0) {
    showError('No Android modules found.');
    return;
  }
  const picked = modules.length === 1
    ? modules[0]
    : await vscode.window.showQuickPick(modules, { placeHolder: 'Select module' });
  if (!picked) {
    return;
  }
  await setSelectedModule(picked);
}
async function runAppOnTargetSelected(): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    showError('No workspace folder open.');
    return;
  }
  const moduleName = (await getSelectedModule()) || (await selectModule(workspaceRoot));
  if (!moduleName) {
    return;
  }
  const deviceId = await getSelectedDeviceId();
  if (!deviceId) {
    await selectDeviceCommand();
  }
  const finalDeviceId = await getSelectedDeviceId();
  if (!finalDeviceId) {
    return;
  }
  const variant = await getSelectedVariant(moduleName);
  await runAppOnTarget(workspaceRoot, moduleName, variant, finalDeviceId);
}
async function stopAppCommand(): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    showError('No workspace folder open.');
    return;
  }
  const moduleName = (await getSelectedModule()) || (await selectModule(workspaceRoot));
  if (!moduleName) {
    return;
  }
  const deviceId = await getSelectedDeviceId();
  if (!deviceId) {
    await selectDeviceCommand();
  }
  const finalDeviceId = await getSelectedDeviceId();
  if (!finalDeviceId) {
    return;
  }
  const packageName = findApplicationId(workspaceRoot, moduleName) ||
    await vscode.window.showInputBox({ prompt: 'Application package name (applicationId)' });
  if (!packageName) {
    return;
  }
  const result = await AdbService.forceStopApp(finalDeviceId, packageName);
  result.success ? showInfo(result.message) : showError(result.message);
}
async function killRestartClearDataCommand(): Promise<void> {
  const devices = await listDevicesDetailed();
  const online = devices.filter(d => d.status === 'online');
  if (online.length === 0) {
    showWarning('No online devices found.');
    return;
  }
  const picked = online.length === 1 ? online[0] : await pickDevice(online, { title: 'Select Device' });
  if (!picked) {
    return;
  }
  const packageName = await vscode.window.showInputBox({
    prompt: 'Application package name',
    placeHolder: 'com.example.app',
  });
  if (!packageName) {
    return;
  }
  const result = await AdbService.killRestartWithClearData(picked.id, packageName);
  result.success ? showInfo(result.message) : showError(result.message);
}
async function buildVariant(
  workspaceRoot: string,
  moduleName: string,
  variant: string,
  gradleArgs: string[] = [],
  env?: NodeJS.ProcessEnv
): Promise<boolean> {
  const task = `:${moduleName}:assemble${variant}`;
  const result = await runGradleTaskWithResult(workspaceRoot, task, gradleArgs, env);
  showGradleOutput(task, result, workspaceRoot);
  if (result.exitCode === 0) {
    lastGradleErrorSummary = undefined;
  } else {
    lastGradleErrorSummary = summarizeGradleError(result.stderr || result.stdout || '');
  }
  return result.exitCode === 0;
}
function summarizeGradleError(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return 'Gradle task failed. See Android Gradle output for details.';
  }
  const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean);
  const whatIdx = lines.findIndex(l => /What went wrong/i.test(l));
  if (whatIdx >= 0) {
    return lines.slice(whatIdx, Math.min(lines.length, whatIdx + 8)).join('\n');
  }
  return lines.slice(0, 8).join('\n');
}
function extractBuildToolsVersionFromGradleError(output: string): string | undefined {
  const lines = output.split('\n');
  const idx = lines.findIndex(line => line.includes('What went wrong'));
  if (idx !== -1) {
    for (let i = idx + 1; i < Math.min(lines.length, idx + 4); i++) {
      const match = lines[i].match(/\\b(\\d+\\.\\d+\\.\\d+)\\b/);
      if (match) {
        return match[1];
      }
    }
  }
  const loose = output.match(/\\b(\\d+\\.\\d+\\.\\d+)\\b/);
  return loose ? loose[1] : undefined;
}
function ensureBuildToolsInstalled(workspaceRoot: string, moduleName: string, fallbackError?: string): boolean {
  const version = findBuildToolsVersion(workspaceRoot, moduleName) || (fallbackError ? extractBuildToolsVersionFromGradleError(fallbackError) : undefined);
  if (!version) {
    return true;
  }
  if (isBuildToolsInstalled(version)) {
    return true;
  }
  showError(`Android Build Tools ${version} not found. Install with: sdkmanager "build-tools;${version}"`);
  return false;
}
async function installVariant(
  workspaceRoot: string,
  moduleName: string,
  variant: string,
  deviceId: string,
  gradleArgs: string[] = [],
  env?: NodeJS.ProcessEnv
): Promise<boolean> {
  const installTask = `:${moduleName}:install${variant}`;
  const availableTasks = await listGradleTasks(workspaceRoot);
  const hasInstallTask = availableTasks.some(t => t.fullName === installTask);
  if (hasInstallTask) {
    const installResult = await runGradleTaskWithResult(workspaceRoot, installTask, gradleArgs, env);
    showGradleOutput(installTask, installResult, workspaceRoot);
    if (installResult.exitCode === 0) {
      lastGradleErrorSummary = undefined;
      return true;
    }
    lastGradleErrorSummary = summarizeGradleError(installResult.stderr || installResult.stdout || '');
  }
  const initialApk = findLatestApk(workspaceRoot, moduleName, variant);
  if (!initialApk) {
    const task = `:${moduleName}:assemble${variant}`;
    const buildResult = await runGradleTaskWithResult(workspaceRoot, task, gradleArgs, env);
    showGradleOutput(task, buildResult, workspaceRoot);
    if (buildResult.exitCode !== 0) {
      const gradleMessage = (buildResult.stderr || buildResult.stdout || '').trim();
      if (!ensureBuildToolsInstalled(workspaceRoot, moduleName, gradleMessage)) {
        return false;
      }
      if (gradleMessage) {
        showError(`Gradle build failed: ${gradleMessage}`);
      }
      lastGradleErrorSummary = summarizeGradleError(gradleMessage);
      return false;
    }
    lastGradleErrorSummary = undefined;
  } else {
    if (!ensureBuildToolsInstalled(workspaceRoot, moduleName)) {
      return false;
    }
  }
  const apkPath = findLatestApk(workspaceRoot, moduleName, variant);
  if (!apkPath) {
    return false;
  }
  const result = await AdbService.installApk(deviceId, apkPath);
  if (!result.success) {
    showError(result.message);
    return false;
  }
  return true;
}
async function runAppOnTarget(workspaceRoot: string, moduleName: string, variant: string, deviceId: string): Promise<void> {
  const installed = await installVariant(workspaceRoot, moduleName, variant, deviceId);
  if (!installed) {
    showError('Failed to install app. Check Gradle output or APK build logs for details.');
    return;
  }
  let packageName = findApplicationId(workspaceRoot, moduleName);
  if (!packageName) {
    packageName = await vscode.window.showInputBox({
      prompt: 'Application package name (applicationId)',
      placeHolder: 'com.example.app',
    });
  }
  if (!packageName) {
    return;
  }
  await withProgress('Starting app...', async () => {
    const result = await AdbService.startApp(deviceId, packageName as string);
    result.success ? showInfo(result.message) : showError(result.message);
  });
}
async function runAppOnEmulator(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    showError('No workspace folder open.');
    return;
  }
  const moduleName = await selectModule(workspaceFolder.uri.fsPath);
  if (!moduleName) {
    return;
  }
  const variant = await getSelectedVariant(moduleName);
  const emulators = await listRunningEmulators();
  if (emulators.length === 0) {
    showWarning('No running emulators. Start an emulator first.');
    return;
  }
  const targetDevice = emulators.length === 1
    ? emulators[0]
    : await pickDevice(emulators, { title: 'Select Emulator', placeholder: 'Choose a running emulator' });
  if (!targetDevice) {
    return;
  }
  await runAppOnTarget(workspaceFolder.uri.fsPath, moduleName, variant, targetDevice.id);
}
async function runAppOnDevice(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    showError('No workspace folder open.');
    return;
  }
  const moduleName = await selectModule(workspaceFolder.uri.fsPath);
  if (!moduleName) {
    return;
  }
  const variant = await getSelectedVariant(moduleName);
  const devices = await listDevicesDetailed();
  const physical = devices.filter(d => d.type === 'physical' && d.status === 'online');
  if (physical.length === 0) {
    showWarning('No physical devices found. Connect a device first.');
    return;
  }
  const targetDevice = physical.length === 1
    ? physical[0]
    : await pickDevice(physical, { title: 'Select Device', placeholder: 'Choose a device' });
  if (!targetDevice) {
    return;
  }
  await runAppOnTarget(workspaceFolder.uri.fsPath, moduleName, variant, targetDevice.id);
}
async function gradleAssembleDebug(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    showError('No workspace folder open.');
    return;
  }
  const moduleName = await selectModule(workspaceFolder.uri.fsPath);
  if (!moduleName) {
    return;
  }
  const variant = await getSelectedVariant(moduleName);
  const ok = await withProgress(`Assembling ${variant}...`, async () => {
    return buildVariant(workspaceFolder.uri.fsPath, moduleName, variant);
  });
  ok ? showInfo(`Assemble${variant} completed.`) : showError(`Assemble${variant} failed.`);
}
async function gradleInstallDebug(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    showError('No workspace folder open.');
    return;
  }
  const moduleName = await selectModule(workspaceFolder.uri.fsPath);
  if (!moduleName) {
    return;
  }
  const variant = await getSelectedVariant(moduleName);
  const task = `:${moduleName}:install${variant}`;
  const result = await withProgress(`Installing ${variant} via Gradle...`, async () => {
    return runGradleTaskWithResult(workspaceFolder.uri.fsPath, task);
  });
  showGradleOutput(task, result, workspaceFolder.uri.fsPath);
  result.exitCode === 0 ? showInfo(`Install${variant} completed.`) : showError(`Install${variant} failed.`);
}
async function gradleClean(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    showError('No workspace folder open.');
    return;
  }
  const result = await withProgress('Cleaning project...', async () => {
    return runGradleTaskWithResult(workspaceFolder.uri.fsPath, 'clean');
  });
  showGradleOutput('clean', result, workspaceFolder.uri.fsPath);
  result.exitCode === 0 ? showInfo('Clean completed') : showError('Clean failed');
}
async function createRunConfiguration(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    showError('No workspace folder open.');
    return;
  }
  const name = await vscode.window.showInputBox({ prompt: 'Run configuration name' });
  if (!name) {
    return;
  }
  const moduleName = await selectModule(workspaceFolder.uri.fsPath);
  if (!moduleName) {
    return;
  }
  const variant = await getSelectedVariant(moduleName);
  const devices = await listDevicesDetailed();
  const online = devices.filter(d => d.status === 'online');
  const devicePick = await vscode.window.showQuickPick(
    [
      { label: 'Ask each time', description: 'Select device on run', deviceId: undefined },
      ...online.map(d => ({ label: d.id, description: d.type, deviceId: d.id })),
    ],
    { placeHolder: 'Select device for this configuration' }
  );
  if (!devicePick) {
    return;
  }
  const preTaskInput = await vscode.window.showInputBox({
    prompt: 'Pre-run Gradle tasks (comma separated)',
    placeHolder: ':app:lint, :app:testDebugUnitTest',
  });
  const argsInput = await vscode.window.showInputBox({
    prompt: 'Gradle arguments (space separated)',
    placeHolder: '--stacktrace -Pci=true',
  });
  const envInput = await vscode.window.showInputBox({
    prompt: 'Environment variables (KEY=VALUE, comma separated)',
    placeHolder: 'JAVA_HOME=/path/to/jdk, CI=true',
  });
  const launchTypePick = await vscode.window.showQuickPick(
    [
      { label: 'Default launcher', type: 'default' as const },
      { label: 'Specific Activity', type: 'activity' as const },
      { label: 'Deep Link URI', type: 'deeplink' as const },
    ],
    { placeHolder: 'Select launch type' }
  );
  const launchType = launchTypePick?.type || 'default';
  let activity: string | undefined;
  let deepLink: string | undefined;
  let extrasInput: string | undefined;
  if (launchType === 'activity') {
    activity = await vscode.window.showInputBox({
      prompt: 'Activity name (e.g. .MainActivity or com.example/.MainActivity)',
    }) || undefined;
    extrasInput = await vscode.window.showInputBox({
      prompt: 'Intent extras (key=value, comma separated)',
      placeHolder: 'userId=123, feature=on',
    });
  }
  if (launchType === 'deeplink') {
    deepLink = await vscode.window.showInputBox({
      prompt: 'Deep link URI',
      placeHolder: 'myapp://open?foo=bar',
    }) || undefined;
  }
  const config: RunConfiguration = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    moduleName,
    variant,
    deviceId: devicePick.deviceId,
    preTasks: parseCommaList(preTaskInput),
    gradleArgs: parseGradleArgs(argsInput),
    env: parseEnvVars(envInput),
    launchType,
    activity,
    deepLink,
    extras: parseExtras(extrasInput),
  };
  const configs = getRunConfigurations();
  configs.push(config);
  await saveRunConfigurations(configs);
  showInfo(`Run configuration saved: ${name}`);
}
async function selectRunConfiguration(): Promise<RunConfiguration | undefined> {
  const configs = getRunConfigurations();
  if (configs.length === 0) {
    showWarning('No run configurations found.');
    return undefined;
  }
  const picked = await vscode.window.showQuickPick(
    configs.map(c => ({
      label: c.name,
      description: `${c.moduleName} • ${c.variant}`,
      config: c,
    })),
    { placeHolder: 'Select run configuration' }
  );
  return picked?.config;
}
async function runRunConfiguration(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    showError('No workspace folder open.');
    return;
  }
  const config = await selectRunConfiguration();
  if (!config) {
    return;
  }
  const env = Object.keys(config.env).length > 0
    ? { ...process.env, ...config.env }
    : process.env;
  for (const task of config.preTasks) {
    const result = await runGradleTaskWithResult(workspaceFolder.uri.fsPath, task, config.gradleArgs, env);
    showGradleOutput(task, result, workspaceFolder.uri.fsPath);
    if (result.exitCode !== 0) {
      showError(`Pre-task failed: ${task}`);
      return;
    }
  }
  let deviceId = config.deviceId;
  if (!deviceId) {
    const devices = await listDevicesDetailed();
    const online = devices.filter(d => d.status === 'online');
    if (online.length === 0) {
      showWarning('No online devices found.');
      return;
    }
    const picked = online.length === 1 ? online[0] : await pickDevice(online, { title: 'Select Device' });
    if (!picked) {
      return;
    }
    deviceId = picked.id;
  }
  const installed = await installVariant(
    workspaceFolder.uri.fsPath,
    config.moduleName,
    config.variant,
    deviceId,
    config.gradleArgs,
    env
  );
  if (!installed) {
    showError('Failed to install app. Check Gradle output for details.');
    return;
  }
  if (config.launchType === 'deeplink' && config.deepLink) {
    const res = await AdbService.startDeepLink(deviceId, config.deepLink, findApplicationId(workspaceFolder.uri.fsPath, config.moduleName));
    res.success ? showInfo(res.message) : showError(res.message);
    return;
  }
  if (config.launchType === 'activity' && config.activity) {
    const res = await AdbService.startActivity(deviceId, findApplicationId(workspaceFolder.uri.fsPath, config.moduleName) || '', config.activity, config.extras);
    res.success ? showInfo(res.message) : showError(res.message);
    return;
  }
  await runAppOnTarget(workspaceFolder.uri.fsPath, config.moduleName, config.variant, deviceId);
}
async function deleteRunConfiguration(): Promise<void> {
  const configs = getRunConfigurations();
  if (configs.length === 0) {
    showWarning('No run configurations found.');
    return;
  }
  const picked = await vscode.window.showQuickPick(
    configs.map(c => ({
      label: c.name,
      description: `${c.moduleName} • ${c.variant}`,
      config: c,
    })),
    { placeHolder: 'Select run configuration to delete' }
  );
  if (!picked) {
    return;
  }
  const updated = configs.filter(c => c.id !== picked.config.id);
  await saveRunConfigurations(updated);
  showInfo(`Deleted run configuration: ${picked.config.name}`);
}
async function installApkMatrix(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const apkPick = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectMany: false,
    filters: { 'APK Files': ['apk'] },
    title: 'Select APK to install',
  });
  let apkPath = apkPick?.[0]?.fsPath;
  if (!apkPath && workspaceFolder) {
    const moduleName = await selectModule(workspaceFolder.uri.fsPath);
    if (!moduleName) {
      return;
    }
    const variant = await getSelectedVariant(moduleName);
    apkPath = findLatestApk(workspaceFolder.uri.fsPath, moduleName, variant);
    if (!apkPath) {
      const built = await buildVariant(workspaceFolder.uri.fsPath, moduleName, variant);
      if (!built) {
        return;
      }
      apkPath = findLatestApk(workspaceFolder.uri.fsPath, moduleName, variant);
    }
  }
  if (!apkPath) {
    showError('No APK selected.');
    return;
  }
  const devices = await listDevicesDetailed();
  const online = devices.filter(d => d.status === 'online');
  if (online.length === 0) {
    showWarning('No online devices found.');
    return;
  }
  const picked = await vscode.window.showQuickPick(
    online.map(d => ({ label: d.id, description: d.type, deviceId: d.id })),
    { placeHolder: 'Select devices to install', canPickMany: true }
  );
  if (!picked || picked.length === 0) {
    return;
  }
  const output = vscode.window.createOutputChannel('Android Install Matrix');
  output.clear();
  output.appendLine(`APK: ${apkPath}`);
  const results = await withProgress('Installing APK on devices...', async () => {
    return Promise.all(
      picked.map(async (device) => {
        const res = await AdbService.installApk(device.deviceId, apkPath as string);
        return { device, res };
      })
    );
  });
  for (const item of results) {
    const prefix = item.res.success ? '[OK]' : '[FAIL]';
    output.appendLine(`${prefix} ${item.device.label} - ${item.res.message}`);
  }
  output.show(true);
  const failures = results.filter(r => !r.res.success);
  failures.length === 0
    ? showInfo('APK installed on all selected devices.')
    : showWarning(`APK install completed with ${failures.length} failures. See output.`);
}
async function runDeviceMatrix(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    showError('No workspace folder open.');
    return;
  }
  const action = await vscode.window.showQuickPick(
    ['Run app on devices', 'Run instrumentation tests on devices'],
    { placeHolder: 'Select matrix action' }
  );
  if (!action) {
    return;
  }
  const devices = await listDevicesDetailed();
  const online = devices.filter(d => d.status === 'online');
  if (online.length === 0) {
    showWarning('No online devices found.');
    return;
  }
  const picked = await vscode.window.showQuickPick(
    online.map(d => ({ label: d.id, description: d.type, deviceId: d.id })),
    { canPickMany: true, placeHolder: 'Select devices' }
  );
  if (!picked || picked.length === 0) {
    return;
  }
  const output = vscode.window.createOutputChannel('Android Device Matrix');
  output.clear();
  output.show(true);
  if (action === 'Run app on devices') {
    const moduleName = await selectModule(workspaceFolder.uri.fsPath);
    if (!moduleName) {
      return;
    }
    const variant = await getSelectedVariant(moduleName);
    const built = await buildVariant(workspaceFolder.uri.fsPath, moduleName, variant);
    if (!built) {
      showError('Build failed.');
      return;
    }
    const apkPath = findLatestApk(workspaceFolder.uri.fsPath, moduleName, variant);
    if (!apkPath) {
      showError('APK not found after build.');
      return;
    }
    const packageName = findApplicationId(workspaceFolder.uri.fsPath, moduleName);
    const results = await Promise.all(
      picked.map(async d => {
        const install = await AdbService.installApk(d.deviceId, apkPath);
        if (!install.success) {
          return { id: d.deviceId, ok: false, msg: install.message };
        }
        if (packageName) {
          const start = await AdbService.startApp(d.deviceId, packageName);
          return { id: d.deviceId, ok: start.success, msg: start.message };
        }
        return { id: d.deviceId, ok: true, msg: 'Installed (packageName unknown, start skipped)' };
      })
    );
    for (const r of results) {
      output.appendLine(`${r.ok ? '[OK]' : '[FAIL]'} ${r.id} - ${r.msg}`);
    }
    return;
  }
  const runner = await vscode.window.showInputBox({
    prompt: 'Instrumentation runner',
    placeHolder: 'com.example.test/androidx.test.runner.AndroidJUnitRunner',
  });
  if (!runner) {
    return;
  }
  const results = await Promise.all(
    picked.map(async d => {
      const res = await AdbService.runInstrumentation(d.deviceId, runner);
      return {
        id: d.deviceId,
        ok: res.success,
        msg: (res.data || res.message).split('\n').slice(-20).join('\n'),
      };
    })
  );
  for (const r of results) {
    output.appendLine(`${r.ok ? '[OK]' : '[FAIL]'} ${r.id}`);
    output.appendLine(r.msg);
    output.appendLine('');
  }
}
async function openAdbShell(): Promise<void> {
  const devices = await listDevicesDetailed();
  const online = devices.filter(d => d.status === 'online');
  if (online.length === 0) {
    showWarning('No online devices found.');
    return;
  }
  const picked = online.length === 1 ? online[0] : await pickDevice(online, { title: 'Select Device' });
  if (!picked) {
    return;
  }
  const sdk = detectSdk();
  const terminal = vscode.window.createTerminal(`ADB Shell: ${picked.id}`);
  terminal.sendText(`"${sdk.adb}" -s ${picked.id} shell`);
  terminal.show();
}
async function openLayoutPreview(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    showError('No active editor.');
    return;
  }
  const doc = editor.document;
  if (!doc.fileName.endsWith('.xml')) {
    showError('Open a layout XML file.');
    return;
  }
  if (!doc.fileName.includes(`${path.sep}res${path.sep}layout`)) {
    showWarning('This file is not in res/layout.');
  }
  LayoutPreviewPanel.createOrShow(doc.getText(), path.basename(doc.fileName));
}
async function openLayoutEditor(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    showError('No active editor.');
    return;
  }
  const doc = editor.document;
  if (!doc.fileName.endsWith('.xml')) {
    showError('Open a layout XML file.');
    return;
  }
  if (!doc.fileName.includes(`${path.sep}res${path.sep}layout`)) {
    showWarning('This file is not in res/layout.');
  }
  LayoutEditorPanel.createOrShow(doc);
}
async function validateManifestCommand(): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    showError('No workspace folder open.');
    return;
  }
  const issues = validateManifest(workspaceRoot);
  if (issues.length === 0) {
    showInfo('Manifest looks good.');
    return;
  }
  showWarning(`Manifest issues:\\n- ${issues.join('\\n- ')}`);
}
async function validateResourcesCommand(): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    showError('No workspace folder open.');
    return;
  }
  const issues = validateResources(workspaceRoot);
  if (issues.length === 0) {
    showInfo('Resources look good.');
    return;
  }
  showWarning(`Resource issues:\\n- ${issues.join('\\n- ')}`);
}
async function deviceExplorerPull(item: any): Promise<void> {
  if (!item?.data?.deviceId || !item?.data?.path) {
    return;
  }
  const targetDir = await vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    canSelectMany: false,
    title: 'Select download folder',
  });
  if (!targetDir || !targetDir[0]) {
    return;
  }
  const ok = await pullDeviceFile(item.data.deviceId, item.data.path, targetDir[0].fsPath);
  ok ? showInfo('Pull completed') : showError('Pull failed');
}
async function deviceExplorerPush(item: any): Promise<void> {
  if (!item?.data?.deviceId) {
    return;
  }
  const files = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectMany: true,
    title: 'Select files to push',
  });
  if (!files || files.length === 0) {
    return;
  }
  const targetPath = item.data.type === 'folder' ? item.data.path : '/sdcard';
  for (const file of files) {
    const remote = `${targetPath}/${path.basename(file.fsPath)}`;
    await pushDeviceFile(item.data.deviceId, file.fsPath, remote);
  }
  showInfo('Push completed');
}
async function deviceExplorerDelete(item: any): Promise<void> {
  if (!item?.data?.deviceId || !item?.data?.path) {
    return;
  }
  const confirm = await vscode.window.showWarningMessage(
    `Delete ${item.data.path}?`,
    { modal: true },
    'Delete'
  );
  if (confirm !== 'Delete') {
    return;
  }
  const ok = await deleteDevicePath(item.data.deviceId, item.data.path);
  ok ? showInfo('Delete completed') : showError('Delete failed');
}
function createEmulatorControlCommands(
  controlProvider: EmulatorControlProvider
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(
      'android-toolkit.emulator.rotate',
      async (deviceId?: string) => {
        const target = deviceId ? { deviceId } : await selectEmulator();
        if (!target) { return; }
        const result = await withProgress('Rotating screen...', async () => {
          return rotateScreen(target.deviceId);
        });
        if (result.success) {
          showInfo(result.message);
        } else {
          showError(result.message);
        }
        controlProvider.refresh();
      }
    ),
    vscode.commands.registerCommand(
      'android-toolkit.emulator.screenshot',
      async (deviceId?: string) => {
        const target = deviceId ? { deviceId } : await selectEmulator();
        if (!target) { return; }
        const result = await withProgress('Capturing screenshot...', async () => {
          return takeScreenshot(target.deviceId);
        });
        if (result.success) {
          showInfo(result.message);
          if (result.data && typeof result.data === 'object' && 'path' in result.data) {
            const uri = vscode.Uri.file(result.data.path as string);
            vscode.commands.executeCommand('vscode.open', uri);
          }
        } else {
          showError(result.message);
        }
      }
    ),
    vscode.commands.registerCommand(
      'android-toolkit.emulator.coldBoot',
      async (deviceId?: string, avdName?: string) => {
        const target = deviceId 
          ? { deviceId, avdName } 
          : await selectEmulator();
        if (!target || !target.avdName) {
          showError('Could not determine AVD name for cold boot.');
          return;
        }
        const confirm = await vscode.window.showWarningMessage(
          `Cold boot "${target.avdName}"? This will fully restart the emulator.`,
          'Cold Boot', 'Cancel'
        );
        if (confirm !== 'Cold Boot') { return; }
        const result = await coldBoot(target.deviceId, target.avdName);
        if (result.success) {
          showInfo(result.message);
        } else {
          showError(result.message);
        }
        controlProvider.refresh();
        refreshStatusBar();
      }
    ),
    vscode.commands.registerCommand(
      'android-toolkit.emulator.warmBoot',
      async (deviceId?: string, avdName?: string) => {
        const target = deviceId 
          ? { deviceId, avdName } 
          : await selectEmulator();
        if (!target || !target.avdName) {
          showError('Could not determine AVD name for warm boot.');
          return;
        }
        const result = await warmBoot(target.deviceId, target.avdName);
        if (result.success) {
          showInfo(result.message);
        } else {
          showError(result.message);
        }
        controlProvider.refresh();
        refreshStatusBar();
      }
    ),
    vscode.commands.registerCommand(
      'android-toolkit.emulator.wipeData',
      async (deviceId?: string, avdName?: string) => {
        const target = deviceId 
          ? { deviceId, avdName } 
          : await selectEmulator();
        if (!target || !target.avdName) {
          showError('Could not determine AVD name for wipe.');
          return;
        }
        const confirm = await vscode.window.showWarningMessage(
          `Wipe all data for "${target.avdName}"? This cannot be undone.`,
          { modal: true },
          'Wipe Data'
        );
        if (confirm !== 'Wipe Data') { return; }
        const result = await wipeData(target.deviceId, target.avdName);
        if (result.success) {
          showInfo(result.message);
        } else {
          showError(result.message);
        }
        controlProvider.refresh();
        refreshStatusBar();
      }
    ),
    vscode.commands.registerCommand(
      'android-toolkit.emulator.toggleNetwork',
      async (deviceId?: string) => {
        const target = deviceId ? { deviceId } : await selectEmulator();
        if (!target) { return; }
        const result = await withProgress('Toggling network...', async () => {
          return toggleNetwork(target.deviceId);
        });
        if (result.success) {
          showInfo(result.message);
        } else {
          showError(result.message);
        }
        controlProvider.refresh();
      }
    ),
  ];
}
export function activate(context: vscode.ExtensionContext): void {
  extensionContext = context;
  createStatusBar(context);
  const storedDeviceId = extensionContext.globalState.get<string>(getDeviceKey());
  if (storedDeviceId) {
    setSelectedDeviceLabel(`Device: ${storedDeviceId}`);
  }
  const storedModule = extensionContext.globalState.get<string>(getModuleKey());
  if (storedModule) {
    setSelectedModuleLabel(`Module: ${storedModule}`);
    getSelectedVariant(storedModule).then(v => setSelectedVariantLabel(`Variant: ${v}`)).catch(() => {});
  }
  const projectProvider = new AndroidProjectProvider();
  const projectTreeView = vscode.window.createTreeView('androidProjectView', {
    treeDataProvider: projectProvider,
    showCollapseAll: true,
    dragAndDropController: projectProvider.dragAndDropController,
  });
  context.subscriptions.push(projectTreeView);
  const controlProvider = new EmulatorControlProvider();
  const controlTreeView = vscode.window.createTreeView('emulatorControlView', {
    treeDataProvider: controlProvider,
    showCollapseAll: false,
  });
  context.subscriptions.push(controlTreeView);
  const deviceManagerProvider = new DeviceManagerProvider();
  const deviceManagerTreeView = vscode.window.createTreeView('deviceManagerView', {
    treeDataProvider: deviceManagerProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(deviceManagerTreeView);
  const deviceFileExplorerProvider = new DeviceFileExplorerProvider();
  const deviceFileExplorerView = vscode.window.createTreeView('deviceFileExplorerView', {
    treeDataProvider: deviceFileExplorerProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(deviceFileExplorerView);
  const gradleTasksProvider = new GradleTasksProvider();
  const gradleTasksView = vscode.window.createTreeView('androidToolkitGradleTasksView', {
    treeDataProvider: gradleTasksProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(gradleTasksView);
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      { language: 'xml', scheme: 'file' },
      new AndroidXmlSymbolProvider()
    ),
    vscode.languages.registerDocumentSymbolProvider(
      { language: 'gradle', scheme: 'file' },
      new GradleSymbolProvider()
    ),
    vscode.languages.registerDocumentSymbolProvider(
      { pattern: '**/*.gradle.kts' },
      new GradleSymbolProvider()
    )
  );
  const workspaceWatcher = vscode.workspace.onDidChangeWorkspaceFolders(() => {
    projectProvider.refresh();
  });
  context.subscriptions.push(workspaceWatcher);
  const commands = [
    vscode.commands.registerCommand('android-toolkit.listDevices', listDevicesCommand),
    vscode.commands.registerCommand('android-toolkit.startEmulator', startEmulatorCommand),
    vscode.commands.registerCommand('android-toolkit.stopEmulator', stopEmulatorCommand),
    vscode.commands.registerCommand('android-toolkit.createEmulator', createEmulatorCommand),
    vscode.commands.registerCommand('android-toolkit.refreshProjectView', () => projectProvider.refresh()),
    vscode.commands.registerCommand('android-toolkit.openInExplorer', (item: ProjectTreeItem) => {
      if (item.data.resourceUri) {
        vscode.commands.executeCommand('revealInExplorer', item.data.resourceUri);
      }
    }),
    vscode.commands.registerCommand('android-toolkit.createResource', (item?: ProjectTreeItem) => {
      createResourceFlow(item, projectProvider);
    }),
    vscode.commands.registerCommand('android-toolkit.createFolder', (item?: ProjectTreeItem) => {
      createFolderFlow(item, projectProvider);
    }),
    vscode.commands.registerCommand('android-toolkit.createAsset', (item?: ProjectTreeItem) => {
      createAssetFlow(item, projectProvider);
    }),
    vscode.commands.registerCommand('android-toolkit.createLocale', (item?: ProjectTreeItem) => {
      createLocaleFlow(item, projectProvider);
    }),
    vscode.commands.registerCommand('android-toolkit.createClass', (item?: ProjectTreeItem) => {
      const { createClassFlow } = require('./projectView/androidCreator');
      createClassFlow(item, projectProvider);
    }),
    vscode.commands.registerCommand('android-toolkit.createFile', (item?: ProjectTreeItem) => {
      createFileCommand(item, projectProvider);
    }),
    vscode.commands.registerCommand('android-toolkit.createFolderGeneric', (item?: ProjectTreeItem) => {
      createFolderCommand(item, projectProvider);
    }),
    vscode.commands.registerCommand('android-toolkit.renameItem', (item?: ProjectTreeItem) => {
      renameItemCommand(item, projectProvider);
    }),
    vscode.commands.registerCommand('android-toolkit.deleteItem', (item?: ProjectTreeItem) => {
      deleteItemCommand(item, projectProvider);
    }),
    vscode.commands.registerCommand('android-toolkit.createProject', () => {
      createAndroidProjectWizard();
    }),
    vscode.commands.registerCommand('android-toolkit.runAppOnEmulator', () => {
      runAppOnEmulator();
    }),
    vscode.commands.registerCommand('android-toolkit.selectDevice', () => {
      selectDeviceCommand();
    }),
    vscode.commands.registerCommand('android-toolkit.selectModule', () => {
      selectModuleCommand();
    }),
    vscode.commands.registerCommand('android-toolkit.runAppOnTargetSelected', () => {
      runAppOnTargetSelected();
    }),
    vscode.commands.registerCommand('android-toolkit.stopApp', () => {
      stopAppCommand();
    }),
    vscode.commands.registerCommand('android-toolkit.gradleSync', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        showError('No workspace folder open.');
        return;
      }
      const result = await runGradleTaskWithResult(workspaceRoot, 'tasks');
      showGradleOutput('tasks', result, workspaceRoot);
      result.exitCode === 0 ? showInfo('Gradle sync completed') : showError('Gradle sync failed');
    }),
    vscode.commands.registerCommand('android-toolkit.projectHealth', () => {
      const issues = checkProjectHealth();
      const channel = vscode.window.createOutputChannel('Android Tools');
      channel.show(true);
      if (issues.length === 0) {
        channel.appendLine('Project health: OK');
        showInfo('Project health: OK');
        return;
      }
      channel.appendLine('Project health issues:');
      issues.forEach(i => channel.appendLine(`- ${i.title}${i.fix ? ` | Fix: ${i.fix}` : ''}`));
      showWarning(`Project health issues: ${issues.map(i => i.title).join(', ')}`);
    }),
    vscode.commands.registerCommand('android-toolkit.runAppOnDevice', () => {
      runAppOnDevice();
    }),
    vscode.commands.registerCommand('android-toolkit.selectBuildVariant', async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        showError('No workspace folder open.');
        return;
      }
      const moduleName = await selectModule(workspaceFolder.uri.fsPath);
      if (!moduleName) {
        return;
      }
      const options = await getVariantOptions(workspaceFolder.uri.fsPath, moduleName);
      const flavor = options.flavors.length > 0
        ? await vscode.window.showQuickPick(['(none)', ...options.flavors], { placeHolder: 'Select flavor' })
        : '(none)';
      if (!flavor) {
        return;
      }
      const buildType = await vscode.window.showQuickPick(options.buildTypes, { placeHolder: 'Select build type' });
      if (!buildType) {
        return;
      }
      const variant = `${flavor === '(none)' ? '' : flavor}${buildType}`;
      await setSelectedFlavor(moduleName, flavor === '(none)' ? '' : flavor);
      await setSelectedBuildType(moduleName, buildType);
      await setSelectedVariant(moduleName, variant);
      showInfo(`Selected variant: ${variant}`);
    }),
    vscode.commands.registerCommand('android-toolkit.gradleAssembleDebug', () => {
      gradleAssembleDebug();
    }),
    vscode.commands.registerCommand('android-toolkit.gradleInstallDebug', () => {
      gradleInstallDebug();
    }),
    vscode.commands.registerCommand('android-toolkit.gradleClean', () => {
      gradleClean();
    }),
    vscode.commands.registerCommand('android-toolkit.openRunPanel', () => {
      RunPanel.createOrShow({
        getDevices: async () => {
          const devices = await listDevicesDetailed();
          return devices
            .filter(d => d.status === 'online')
            .map(d => ({
              id: d.id,
              label: `${d.id} (${d.type})`,
              type: d.type,
            }));
        },
        getModules: async () => {
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
          if (!workspaceFolder) {
            return [];
          }
          return findApplicationModules(workspaceFolder.uri.fsPath);
        },
        getVariants: async (moduleName: string) => {
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
          if (!workspaceFolder) {
            return { variants: ['Debug'], selected: 'Debug', flavors: [], buildTypes: ['Debug', 'Release'], selectedFlavor: '', selectedBuildType: 'Debug' };
          }
          const options = await getVariantOptions(workspaceFolder.uri.fsPath, moduleName);
          const selected = await getSelectedVariant(moduleName);
          const finalSelected = options.variants.includes(selected) ? selected : options.variants[0] || 'Debug';
          const selectedFlavor = await getSelectedFlavor(moduleName);
          const selectedBuildType = await getSelectedBuildType(moduleName);
          return { variants: options.variants, selected: finalSelected, flavors: options.flavors, buildTypes: options.buildTypes, selectedFlavor, selectedBuildType };
        },
        setVariant: async (moduleName: string, variant: string) => {
          await setSelectedVariant(moduleName, variant);
        },
        setFlavor: async (moduleName: string, flavor: string) => {
          await setSelectedFlavor(moduleName, flavor);
        },
        setBuildType: async (moduleName: string, buildType: string) => {
          await setSelectedBuildType(moduleName, buildType);
        },
        build: async (moduleName: string) => {
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
          if (!workspaceFolder) {
            return { success: false, message: 'No workspace folder open' };
          }
          const variant = await getSelectedVariant(moduleName);
          const ok = await buildVariant(workspaceFolder.uri.fsPath, moduleName, variant);
          return {
            success: ok,
            message: ok ? 'Build completed' : 'Build failed',
            gradleError: ok ? undefined : lastGradleErrorSummary,
          };
        },
        install: async (moduleName: string, deviceId: string) => {
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
          if (!workspaceFolder) {
            return { success: false, message: 'No workspace folder open' };
          }
          if (!deviceId) {
            return { success: false, message: 'Select a device' };
          }
          const variant = await getSelectedVariant(moduleName);
          const ok = await installVariant(workspaceFolder.uri.fsPath, moduleName, variant, deviceId);
          return {
            success: ok,
            message: ok ? 'Install completed' : 'Install failed',
            gradleError: ok ? undefined : lastGradleErrorSummary,
          };
        },
        run: async (moduleName: string, deviceId: string) => {
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
          if (!workspaceFolder) {
            return { success: false, message: 'No workspace folder open' };
          }
          if (!deviceId) {
            return { success: false, message: 'Select a device' };
          }
          const variant = await getSelectedVariant(moduleName);
          await runAppOnTarget(workspaceFolder.uri.fsPath, moduleName, variant, deviceId);
          return { success: true, message: 'Run requested' };
        },
        clean: async () => {
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
          if (!workspaceFolder) {
            return { success: false, message: 'No workspace folder open' };
          }
          const result = await runGradleTaskWithResult(workspaceFolder.uri.fsPath, 'clean');
          showGradleOutput('clean', result, workspaceFolder.uri.fsPath);
          if (result.exitCode === 0) {
            lastGradleErrorSummary = undefined;
          } else {
            lastGradleErrorSummary = summarizeGradleError(result.stderr || result.stdout || '');
          }
          return {
            success: result.exitCode === 0,
            message: result.exitCode === 0 ? 'Clean completed' : 'Clean failed',
            gradleError: result.exitCode === 0 ? undefined : lastGradleErrorSummary,
          };
        },
      });
    }),
    vscode.commands.registerCommand('android-toolkit.showGradleOutput', () => {
      revealGradleOutput();
    }),
    vscode.commands.registerCommand('android-toolkit.runGradleTask', async (task) => {
      await runGradleTaskCommand(task);
    }),
    vscode.commands.registerCommand('android-toolkit.refreshGradleTasks', () => {
      gradleTasksProvider.refresh();
    }),
    vscode.commands.registerCommand('android-toolkit.openAppInspection', () => {
      AppInspectionPanel.createOrShow();
    }),
    vscode.commands.registerCommand('android-toolkit.openDatabaseInspector', () => {
      DatabaseInspectorPanel.createOrShow();
    }),
    vscode.commands.registerCommand('android-toolkit.openDebugPanel', () => {
      DebugPanel.createOrShow();
    }),
    vscode.commands.registerCommand('android-toolkit.signingWizard', () => {
      runSigningWizard();
    }),
    vscode.commands.registerCommand('android-toolkit.buildSignedApk', () => {
      buildSignedApk();
    }),
    vscode.commands.registerCommand('android-toolkit.buildSignedBundle', () => {
      buildSignedBundle();
    }),
    vscode.commands.registerCommand('android-toolkit.analyzeApk', async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      const apkUri = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        filters: { 'APK Files': ['apk'] },
        title: 'Select APK to Analyze',
      });
      if (apkUri && apkUri[0]) {
        await ApkAnalyzerPanel.createOrShow(apkUri[0].fsPath);
        return;
      }
      if (workspaceFolder) {
        const moduleName = await selectModule(workspaceFolder.uri.fsPath);
        if (!moduleName) {
          return;
        }
        const apkPath = findLatestApk(workspaceFolder.uri.fsPath, moduleName);
        if (apkPath) {
          await ApkAnalyzerPanel.createOrShow(apkPath);
        } else {
          showError('No APK found. Build the selected variant first.');
        }
      }
    }),
    vscode.commands.registerCommand('android-toolkit.compareApk', async () => {
      const first = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectMany: false,
        filters: { 'APK Files': ['apk'] },
        title: 'Select first APK',
      });
      if (!first || !first[0]) {
        return;
      }
      const second = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectMany: false,
        filters: { 'APK Files': ['apk'] },
        title: 'Select second APK',
      });
      if (!second || !second[0]) {
        return;
      }
      await ApkComparePanel.createOrShow(first[0].fsPath, second[0].fsPath);
    }),
    vscode.commands.registerCommand('android-toolkit.createLaunchProfile', async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        showError('No workspace folder open.');
        return;
      }
      await createLaunchProfileFlow(workspaceFolder.uri.fsPath, async (moduleName: string) => {
        return getAvailableVariants(workspaceFolder.uri.fsPath, moduleName);
      });
    }),
    vscode.commands.registerCommand('android-toolkit.runLaunchProfile', async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        showError('No workspace folder open.');
        return;
      }
      const profile = await selectLaunchProfile(workspaceFolder.uri.fsPath);
      if (!profile) {
        return;
      }
      if (profile.task) {
        const result = await withProgress(`Running ${profile.task}...`, async () => {
          return runGradleTaskWithResult(workspaceFolder.uri.fsPath, profile.task as string);
        });
        showGradleOutput(profile.task as string, result, workspaceFolder.uri.fsPath);
        if (result.exitCode !== 0) {
          showError(`Task failed: ${profile.task}`);
          return;
        }
      }
      let deviceId: string | undefined;
      if (profile.target === 'emulator') {
        const emulators = await listRunningEmulators();
        if (emulators.length === 0) {
          showWarning('No running emulators. Start an emulator first.');
          return;
        }
        deviceId = emulators.length === 1 ? emulators[0].id : (await pickDevice(emulators))?.id;
      } else if (profile.target === 'device') {
        const devices = await listDevicesDetailed();
        const physical = devices.filter(d => d.type === 'physical' && d.status === 'online');
        if (physical.length === 0) {
          showWarning('No physical devices found.');
          return;
        }
        deviceId = physical.length === 1 ? physical[0].id : (await pickDevice(physical))?.id;
      } else {
        const devices = await listDevicesDetailed();
        const online = devices.filter(d => d.status === 'online');
        deviceId = online.length === 1 ? online[0].id : (await pickDevice(online))?.id;
      }
      if (!deviceId) {
        return;
      }
      await runAppOnTarget(workspaceFolder.uri.fsPath, profile.module, profile.variant, deviceId);
    }),
    vscode.commands.registerCommand('android-toolkit.deleteLaunchProfile', async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        showError('No workspace folder open.');
        return;
      }
      await deleteLaunchProfileFlow(workspaceFolder.uri.fsPath);
    }),
    vscode.commands.registerCommand('android-toolkit.createRunConfiguration', () => {
      createRunConfiguration();
    }),
    vscode.commands.registerCommand('android-toolkit.runRunConfiguration', () => {
      runRunConfiguration();
    }),
    vscode.commands.registerCommand('android-toolkit.deleteRunConfiguration', () => {
      deleteRunConfiguration();
    }),
    vscode.commands.registerCommand('android-toolkit.openAdbShell', () => {
      openAdbShell();
    }),
    vscode.commands.registerCommand('android-toolkit.openLayoutPreview', () => {
      openLayoutPreview();
    }),
    vscode.commands.registerCommand('android-toolkit.openLayoutEditor', () => {
      openLayoutEditor();
    }),
    vscode.commands.registerCommand('android-toolkit.openLayoutInspector', () => {
      LayoutInspectorPanel.createOrShow();
    }),
    vscode.commands.registerCommand('android-toolkit.openQuickActions', () => {
      QuickActionsPanel.createOrShow();
    }),
    vscode.commands.registerCommand('android-toolkit.openMappingViewer', () => {
      MappingViewerPanel.createOrShow();
    }),
    vscode.commands.registerCommand('android-toolkit.openPerformanceMonitor', () => {
      PerformanceMonitorPanel.createOrShow();
    }),
    vscode.commands.registerCommand('android-toolkit.inspectBuildCache', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        showError('No workspace folder open.');
        return;
      }
      await inspectBuildCache(workspaceRoot);
    }),
    vscode.commands.registerCommand('android-toolkit.dependencyInsight', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        showError('No workspace folder open.');
        return;
      }
      const moduleName = await selectModule(workspaceRoot);
      if (!moduleName) {
        return;
      }
      await runDependencyInsight(workspaceRoot, moduleName);
    }),
    vscode.commands.registerCommand('android-toolkit.openComposePreview', () => {
      ComposePreviewPanel.createOrShow();
    }),
    vscode.commands.registerCommand('android-toolkit.openComposeLivePreview', () => {
      ComposeLivePreviewPanel.createOrShow();
    }),
    vscode.commands.registerCommand('android-toolkit.runTests', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        showError('No workspace folder open.');
        return;
      }
      const moduleName = await selectModule(workspaceRoot);
      if (!moduleName) {
        return;
      }
      TestRunnerPanel.createOrShow(workspaceRoot, moduleName);
    }),
    vscode.commands.registerCommand('android-toolkit.killRestartClearData', () => {
      killRestartClearDataCommand();
    }),
    vscode.commands.registerCommand('android-toolkit.validateManifest', () => {
      validateManifestCommand();
    }),
    vscode.commands.registerCommand('android-toolkit.insertManifestTemplate', () => {
      insertManifestTemplate();
    }),
    vscode.commands.registerCommand('android-toolkit.addManifestEntry', () => {
      addManifestEntryFlow();
    }),
    vscode.commands.registerCommand('android-toolkit.openManifestEditor', () => {
      openManifestEditor();
    }),
    vscode.commands.registerCommand('android-toolkit.validateResources', () => {
      validateResourcesCommand();
    }),
    vscode.commands.registerCommand('android-toolkit.insertValuesTemplate', () => {
      insertValuesTemplate();
    }),
    vscode.commands.registerCommand('android-toolkit.openResourceInspector', () => {
      openResourceInspector();
    }),
    vscode.commands.registerCommand('android-toolkit.openResourceByQuery', () => {
      openResourceByQuery();
    }),
    vscode.commands.registerCommand('android-toolkit.jumpToNavDestination', () => {
      jumpToNavigationDestination();
    }),
    vscode.commands.registerCommand('android-toolkit.jumpToNavArgument', () => {
      jumpToNavigationArgument();
    }),
    vscode.commands.registerCommand('android-toolkit.previewNavGraphSvg', () => {
      previewNavigationGraphSvg();
    }),
    vscode.commands.registerCommand('android-toolkit.deviceExplorer.refresh', () => {
      deviceFileExplorerProvider.refresh();
    }),
    vscode.commands.registerCommand('android-toolkit.deviceExplorer.pull', (item: any) => {
      deviceExplorerPull(item);
    }),
    vscode.commands.registerCommand('android-toolkit.deviceExplorer.push', (item: any) => {
      deviceExplorerPush(item);
    }),
    vscode.commands.registerCommand('android-toolkit.deviceExplorer.delete', (item: any) => {
      deviceExplorerDelete(item);
    }),
    vscode.commands.registerCommand('android-toolkit.emulator.saveSnapshot', async () => {
      const target = await selectEmulator();
      if (!target) { return; }
      const name = await vscode.window.showInputBox({ prompt: 'Snapshot name', value: 'snapshot1' });
      if (!name) { return; }
      const result = await saveSnapshot(target.deviceId, name);
      result.success ? showInfo(result.message) : showError(result.message);
    }),
    vscode.commands.registerCommand('android-toolkit.emulator.loadSnapshot', async () => {
      const target = await selectEmulator();
      if (!target) { return; }
      const list = await listSnapshots(target.deviceId);
      if (list.length === 0) {
        showWarning('No snapshots found.');
        return;
      }
      const picked = await vscode.window.showQuickPick(list, { placeHolder: 'Select snapshot' });
      if (!picked) { return; }
      const result = await loadSnapshot(target.deviceId, picked);
      result.success ? showInfo(result.message) : showError(result.message);
    }),
    vscode.commands.registerCommand('android-toolkit.refreshDeviceManager', () => deviceManagerProvider.refresh()),
    vscode.commands.registerCommand('android-toolkit.createDevice', (platform?: string) => {
      createDeviceWizard(platform as any, deviceManagerProvider);
    }),
    vscode.commands.registerCommand('android-toolkit.deviceManager.launch', (device: UnifiedDevice) => {
      launchDevice(device, deviceManagerProvider);
    }),
    vscode.commands.registerCommand('android-toolkit.deviceManager.stop', (device: UnifiedDevice) => {
      stopDevice(device, deviceManagerProvider);
    }),
    vscode.commands.registerCommand('android-toolkit.deviceManager.delete', (device: UnifiedDevice) => {
      deleteDevice(device, deviceManagerProvider);
    }),
    vscode.commands.registerCommand('android-toolkit.refreshEmulatorControl', () => controlProvider.refresh()),
    ...createEmulatorControlCommands(controlProvider),
    vscode.commands.registerCommand('android-toolkit.openLogcat', () => {
      const { LogcatPanel } = require('./logcat/logcatPanel');
      LogcatPanel.createOrShow(context.extensionUri, context);
    }),
    vscode.commands.registerCommand('android-toolkit.clearLogcat', () => {
      const { LogcatPanel } = require('./logcat/logcatPanel');
      if (LogcatPanel.currentPanel) {
        LogcatPanel.currentPanel.dispose();
      }
      showInfo('Logcat cleared');
    }),
    vscode.commands.registerCommand('android-toolkit.attachDebugger', () => {
      const { debugSession } = require('./debug/debugAdapter');
      debugSession.attach();
    }),
    vscode.commands.registerCommand('android-toolkit.detachDebugger', () => {
      const { debugSession } = require('./debug/debugAdapter');
      debugSession.detach();
    }),
    vscode.commands.registerCommand('android-toolkit.toggleBreakpoint', () => {
      const { debugSession } = require('./debug/debugAdapter');
      debugSession.toggleBreakpoint();
    }),
    vscode.commands.registerCommand('android-toolkit.debugStatus', () => {
      const { debugSession } = require('./debug/debugAdapter');
      debugSession.showStatus();
    }),
    vscode.commands.registerCommand('android-toolkit.openEmulatorPanel', () => {
      EmulatorControlPanel.createOrShow(context.extensionUri);
    }),
    vscode.commands.registerCommand('android-toolkit.installApk', async () => {
      const emulators = await listRunningEmulators();
      if (emulators.length === 0) {
        showWarning('No running emulators. Start an emulator first.');
        return;
      }
      const deviceId = emulators[0].id;
      const apkUri = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        filters: { 'APK Files': ['apk'] },
        title: 'Select APK to Install',
      });
      if (apkUri && apkUri[0]) {
        await withProgress('Installing APK...', async () => {
          const result = await AdbService.installApk(deviceId, apkUri[0].fsPath);
          if (result.success) {
            showInfo(result.message);
          } else {
            showError(result.message);
          }
        });
      }
    }),
    vscode.commands.registerCommand('android-toolkit.installApkMatrix', () => {
      installApkMatrix();
    }),
    vscode.commands.registerCommand('android-toolkit.runDeviceMatrix', () => {
      runDeviceMatrix();
    }),
    vscode.commands.registerCommand('android-toolkit.openMatrixDashboard', () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot || !extensionContext) {
        showError('No workspace folder open.');
        return;
      }
      MatrixDashboardPanel.createOrShow(extensionContext, workspaceRoot);
    }),
    vscode.commands.registerCommand('android-toolkit.gradleDoctor', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        showError('No workspace folder open.');
        return;
      }
      await runGradleDoctor(workspaceRoot);
    }),
    vscode.commands.registerCommand('android-toolkit.playSigningHelper', () => {
      openPlaySigningHelper();
    }),
    vscode.commands.registerCommand('android-toolkit.bundletoolBuildApks', () => {
      bundletoolBuildApks();
    }),
    vscode.commands.registerCommand('android-toolkit.bundletoolInstallApks', () => {
      bundletoolInstallApks();
    }),
    vscode.commands.registerCommand('android-toolkit.bumpVersionCode', () => {
      bumpVersionCodeWizard();
    }),
    vscode.commands.registerCommand('android-toolkit.uninstallApp', async () => {
      const emulators = await listRunningEmulators();
      if (emulators.length === 0) {
        showWarning('No running emulators.');
        return;
      }
      const deviceId = emulators[0].id;
      const packages = await AdbService.listPackages(deviceId);
      const pkg = await vscode.window.showQuickPick(packages, { placeHolder: 'Select app to uninstall' });
      if (pkg) {
        const result = await AdbService.uninstallApp(deviceId, pkg);
        result.success ? showInfo(result.message) : showError(result.message);
      }
    }),
    vscode.commands.registerCommand('android-toolkit.restartApp', async () => {
      const emulators = await listRunningEmulators();
      if (emulators.length === 0) {
        showWarning('No running emulators.');
        return;
      }
      const deviceId = emulators[0].id;
      const packages = await AdbService.listPackages(deviceId);
      const pkg = await vscode.window.showQuickPick(packages, { placeHolder: 'Select app to restart' });
      if (pkg) {
        await withProgress('Restarting app...', async () => {
          const result = await AdbService.restartApp(deviceId, pkg);
          result.success ? showInfo(result.message) : showError(result.message);
        });
      }
    }),
    vscode.commands.registerCommand('android-toolkit.setLocation', async () => {
      const emulators = await listRunningEmulators();
      if (emulators.length === 0) {
        showWarning('No running emulators.');
        return;
      }
      const deviceId = emulators[0].id;
      const presets = DEFAULT_LOCATION_PRESETS.map(p => ({ label: p.name, id: p.id, lat: p.latitude, lng: p.longitude }));
      const selected = await vscode.window.showQuickPick(presets, { placeHolder: 'Select location preset' });
      if (selected) {
        const result = await AdbService.setLocation(deviceId, selected.lat, selected.lng);
        result.success ? showInfo(result.message) : showError(result.message);
      }
    }),
    vscode.commands.registerCommand('android-toolkit.startRecording', async () => {
      const emulators = await listRunningEmulators();
      if (emulators.length === 0) {
        showWarning('No running emulators.');
        return;
      }
      const result = await AdbService.startScreenRecording(emulators[0].id);
      result.success ? showInfo(result.message) : showError(result.message);
    }),
    vscode.commands.registerCommand('android-toolkit.stopRecording', async () => {
      const emulators = await listRunningEmulators();
      if (emulators.length === 0) {
        showWarning('No running emulators.');
        return;
      }
      await withProgress('Stopping recording...', async () => {
        const result = await AdbService.stopScreenRecording(emulators[0].id);
        if (result.success && result.data) {
          showInfo(result.message);
          vscode.commands.executeCommand('vscode.open', vscode.Uri.file(result.data));
        } else {
          showError(result.message);
        }
      });
    }),
    vscode.commands.registerCommand('android-toolkit.setBattery', async () => {
      const emulators = await listRunningEmulators();
      if (emulators.length === 0) {
        showWarning('No running emulators.');
        return;
      }
      const levelInput = await vscode.window.showInputBox({
        prompt: 'Battery level (0-100)',
        value: '50',
        validateInput: (value) => {
          if (value.trim() === '') {
            return 'Enter a value between 0 and 100';
          }
          const parsed = Number(value);
          if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
            return 'Battery level must be between 0 and 100';
          }
          return undefined;
        },
      });
      if (levelInput === undefined) {
        return;
      }
      const statusPick = await vscode.window.showQuickPick(
        [
          { label: 'Charging', value: 'charging' },
          { label: 'Discharging', value: 'discharging' },
          { label: 'Not Charging', value: 'not-charging' },
          { label: 'Full', value: 'full' },
          { label: 'Leave Status Unchanged', value: 'unchanged' },
        ],
        { placeHolder: 'Set battery status' }
      );
      if (!statusPick) {
        return;
      }
      const level = parseInt(levelInput, 10);
      const levelResult = await AdbService.setBatteryLevel(emulators[0].id, level);
      levelResult.success ? showInfo(levelResult.message) : showError(levelResult.message);
      if (statusPick.value !== 'unchanged') {
        const statusResult = await AdbService.setBatteryStatus(
          emulators[0].id,
          statusPick.value as 'charging' | 'discharging' | 'not-charging' | 'full'
        );
        statusResult.success ? showInfo(statusResult.message) : showError(statusResult.message);
      }
    }),
    vscode.commands.registerCommand('android-toolkit.openFile', async (uriOrPath: vscode.Uri | string) => {
      try {
        let uri: vscode.Uri;
        if (typeof uriOrPath === 'string') {
          uri = vscode.Uri.file(uriOrPath);
        } else if (uriOrPath instanceof vscode.Uri) {
          uri = uriOrPath;
        } else {
          uri = vscode.Uri.file(String(uriOrPath));
        }
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
        await ensureLanguageMode(doc);
      } catch (error) {
        showError(`Failed to open file: ${error}`);
      }
    }),
    vscode.commands.registerCommand('android-toolkit.openProfiler', () => {
      ProfilerPanel.createOrShow(context.extensionUri);
    }),
  ];
  context.subscriptions.push(...commands);
  checkLanguageExtensions(context).catch(() => {});
  EmulatorStateService.getInstance().startMonitoring();
}
export function deactivate(): void {
  const { logcatManager } = require('./logcat/logcatStream');
  logcatManager.stopAll();
  const { debugSession } = require('./debug/debugAdapter');
  debugSession.dispose();
  EmulatorStateService.getInstance().stopMonitoring();
}
