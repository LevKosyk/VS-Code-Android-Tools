import * as vscode from 'vscode';
import { detectSdk, isBuildToolsInstalled, isSdkAvailable } from './core/sdkDetector';
import { AndroidToolsError } from './core/errors';
import { checkLanguageExtensions, ensureLanguageMode, getLanguageHealthStatus, setJdk21Path } from './core/languageSupport';
import { listDevicesDetailed, listRunningEmulators } from './devices/deviceManager';
import { AndroidDevice } from './devices/types';
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
  undoLastProjectAction,
} from './projectView/fileActions';
import { createAndroidProjectWizard, createAndroidProjectWizardWithOptions } from './projectView/projectCreator';
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
  showActionableError,
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
import { GradleTasksProvider, runGradleTaskCommand } from './gradle/gradleTasksProvider';
import { invalidateGradleTaskCache, listGradleTasks, listVariantsFromTasks, parseVariants, runGradleTaskWithResult } from './gradle/gradleService';
import { createLaunchProfileFlow, deleteLaunchProfileFlow, selectLaunchProfile } from './run/launchProfiles';
import { DeviceFileExplorerProvider } from './deviceExplorer/deviceFileExplorerProvider';
import { deleteDevicePath, pullDeviceFile, pushDeviceFile } from './deviceExplorer/deviceFileService';
import { AndroidLayoutXmlCompletionProvider, XmlLivePreviewController, generateConstraintSetSnippetFromSelection } from './layout/xmlAuthoring';
import {
  AndroidLayoutLintController,
  AndroidXmlQuickFixProvider,
  extractAllHardcodedStringsFromLayout,
  extractStringResourceFromXml,
  fixAllLayoutWarningsInFile,
  fixMissingContentDescription,
  fixMissingConstraints,
} from './layout/xmlDiagnostics';
import { insertManifestTemplate, validateManifest, openManifestEditor, addManifestEntryFlow } from './projectView/manifestTools';
import { insertValuesTemplate, validateResources } from './projectView/resourceTools';
import { openResourceInspector, openResourceByQuery } from './projectView/resourceInspector';
import { jumpToNavigationArgument, jumpToNavigationDestination, previewNavigationGraphSvg } from './projectView/navigationTools';
import * as path from 'path';
import * as fs from 'fs';
import {
  runSigningWizard,
  buildSignedApk,
  buildSignedBundle,
  openPlaySigningHelper,
  bundletoolBuildApks,
  bundletoolInstallApks,
  bumpVersionCodeWizard,
  runReleaseFlowWizard,
} from './signing/signingWizard';
import { checkProjectHealth } from './core/projectHealth';
import { showGradleOutput, revealGradleOutput } from './gradle/gradleOutput';
import { inspectBuildCache } from './gradle/buildCacheInspector';
import { runGradleDoctor } from './gradle/gradleDoctor';
import { runDependencyInsight } from './gradle/dependencyInsight';
import { issueToMultiline, runGuarded, ToolkitIssue } from './core/stability';
import { operationManager } from './core/operations';
import { execCommand } from './core/cli';
import { logPerf } from './core/perf';
import { BackgroundScheduler } from './core/backgroundScheduler';
import { StartupProfilerEntry, StartupProfilerPanel } from './ui/startupProfilerPanel';
import { readProjectConfig } from './team/projectConfigStore';
import { AndroidProblemsProvider, AndroidProblemTreeItem } from './problems/problemsProvider';
import { buildRunFailureReport, classifyGradleFailure, GradleFailureTag, RunFailureRecord } from './run/runDiagnostics';
import { pickSmartDeviceId } from './run/smartDevice';
import { ERROR_REASON_META, normalizeErrorReason } from './run/errorTaxonomy';
import type { OnboardingCheck } from './ui/onboardingPanel';
import { FailureInsightsPanel, RunFixAttemptRecord, summarizeFailureInsights } from './insights/failureInsightsPanel';
import { exportTeamConfig, importTeamConfig } from './team/teamSettings';
import { SloDashboardPanel } from './insights/sloDashboardPanel';
import { RunActionMetric, SessionRecord, summarizeSlo } from './insights/sloSummary';
import { CommandLatencyRecord, summarizeCommandBudgets } from './insights/commandBudget';
let extensionContext: vscode.ExtensionContext | undefined;
let lastGradleErrorSummary: string | undefined;
let lastGradleErrorLocation: { file: string; line: number; column?: number } | undefined;
let lastGradleErrorTags: GradleFailureTag[] = [];
const runFailureRecords: RunFailureRecord[] = [];
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
const RUN_HISTORY_KEY = 'runHistory';
const RUN_DEVICE_PREFS_KEY = 'runDevicePrefs';
const RUN_FAILURE_RECORDS_KEY = 'runFailureRecords';
const RUN_FIX_ATTEMPTS_KEY = 'runFixAttempts';
const RUN_ACTION_METRICS_KEY = 'runActionMetrics';
const COMMAND_LATENCY_METRICS_KEY = 'commandLatencyMetrics';
const SESSION_HISTORY_KEY = 'sessionHistory';
const ACTIVE_SESSION_KEY = 'activeSession';
const RUN_PANEL_SCOPE = 'run-panel-ops';
const FIRST_RUN_WIZARD_SEEN_KEY = 'androidTools.firstRunWizard.seen';
const FIRST_RUN_WIZARD_SUCCESS_KEY = 'androidTools.firstRunWizard.success';
const STARTUP_PROFILER_ENTRIES_KEY = 'startupProfilerEntries';
const STARTUP_PROFILER_TOTAL_KEY = 'startupProfilerTotalMs';
const ACTION_REPLAY_KEY = 'actionReplay';
function lazyLoad<T>(modulePath: string): T {
  return require(modulePath) as T;
}
interface RunHistoryEntry {
  id: string;
  label: string;
  moduleName: string;
  variant: string;
  deviceId: string;
  timestamp: number;
}
type RunDevicePrefs = Record<string, string>;
interface RunFixSuggestion {
  id: string;
  label: string;
}
interface RunActionResult {
  success: boolean;
  message: string;
  gradleError?: string;
  fixSuggestions?: RunFixSuggestion[];
  errorLocation?: { file: string; line: number; column?: number };
}
let problemsProvider: AndroidProblemsProvider | undefined;
const runFixAttempts: RunFixAttemptRecord[] = [];
const runActionMetrics: RunActionMetric[] = [];
const commandLatencyMetrics: CommandLatencyRecord[] = [];
const sessionHistory: SessionRecord[] = [];
let currentSessionId = '';
const startupProfilerEntries: StartupProfilerEntry[] = [];
let startupProfilerTotalMs = 0;
const backgroundScheduler = new BackgroundScheduler();
interface ActionReplayRecord {
  action: string;
  args: string;
  durationMs: number;
  success: boolean;
  timestamp: number;
  error?: string;
}
const actionReplay: ActionReplayRecord[] = [];
const policyWarningsShown = new Set<string>();

function reportRunProblem(
  action: string,
  result: RunActionResult,
  context: { moduleName?: string; variant?: string; deviceId?: string } = {}
): void {
  if (result.success || !problemsProvider) {
    return;
  }
  problemsProvider.add({
    action,
    title: result.message,
    details: result.gradleError,
    moduleName: context.moduleName,
    variant: context.variant,
    deviceId: context.deviceId,
    location: result.errorLocation,
    fixes: result.fixSuggestions,
  });
  const reason = normalizeErrorReason(lastGradleErrorTags[0]);
  runFailureRecords.unshift({
    action,
    message: result.message,
    reason,
    timestamp: Date.now(),
  });
  if (runFailureRecords.length > 200) {
    runFailureRecords.length = 200;
  }
  markSessionFailure();
  void persistRunFailureRecords();
}
function issueToRunResult(issue: ToolkitIssue, fallbackMessage: string, fixes: RunFixSuggestion[] = []): RunActionResult {
  return {
    success: false,
    message: fallbackMessage,
    gradleError: issueToMultiline(issue),
    fixSuggestions: fixes.length > 0 ? fixes : [{ id: 'showGradleOutput', label: 'Open Gradle Output' }],
  };
}
function handleError(error: unknown): void {
  if (error instanceof AndroidToolsError) {
    showToolkitError(error);
  } else if (error instanceof Error) {
    void showActionableError({
      title: error.message,
      suggestions: [
        'Open "Android: Open Run Failure Report" for diagnostics.',
        'Open "Android: Open Action Replay Report" to attach reproduce steps.',
      ],
      actions: [
        {
          label: 'Run Failure Report',
          action: async () => vscode.commands.executeCommand('android-toolkit.openRunFailureReport'),
        },
        {
          label: 'Action Replay',
          action: async () => vscode.commands.executeCommand('android-toolkit.openActionReplayReport'),
        },
      ],
    });
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
function getRunHistory(): RunHistoryEntry[] {
  if (!extensionContext) {
    return [];
  }
  return extensionContext.globalState.get<RunHistoryEntry[]>(RUN_HISTORY_KEY, []);
}
async function saveRunHistory(entries: RunHistoryEntry[]): Promise<void> {
  if (!extensionContext) {
    return;
  }
  await extensionContext.globalState.update(RUN_HISTORY_KEY, entries);
}
async function persistRunFailureRecords(): Promise<void> {
  if (!extensionContext) {
    return;
  }
  await extensionContext.globalState.update(RUN_FAILURE_RECORDS_KEY, runFailureRecords.slice(0, 500));
}
async function persistRunFixAttempts(): Promise<void> {
  if (!extensionContext) {
    return;
  }
  await extensionContext.globalState.update(RUN_FIX_ATTEMPTS_KEY, runFixAttempts.slice(0, 500));
}
async function persistRunActionMetrics(): Promise<void> {
  if (!extensionContext) {
    return;
  }
  await extensionContext.globalState.update(RUN_ACTION_METRICS_KEY, runActionMetrics.slice(0, 1000));
}
async function persistCommandLatencyMetrics(): Promise<void> {
  if (!extensionContext) {
    return;
  }
  await extensionContext.globalState.update(COMMAND_LATENCY_METRICS_KEY, commandLatencyMetrics.slice(0, 1000));
}
async function persistSessionHistory(): Promise<void> {
  if (!extensionContext) {
    return;
  }
  await extensionContext.globalState.update(SESSION_HISTORY_KEY, sessionHistory.slice(0, 300));
}
function trackActionMetric(action: string, result: RunActionResult, durationMs: number): void {
  if (!['Run', 'Build', 'Install'].includes(action) || durationMs <= 0) {
    return;
  }
  runActionMetrics.unshift({
    action,
    success: result.success,
    durationMs: Math.round(durationMs),
    timestamp: Date.now(),
  });
  if (runActionMetrics.length > 1000) {
    runActionMetrics.length = 1000;
  }
  void persistRunActionMetrics();
}
function markSessionFailure(): void {
  if (!currentSessionId) {
    return;
  }
  const active = sessionHistory.find(s => s.id === currentSessionId);
  if (!active) {
    return;
  }
  if (!active.hadFailure) {
    active.hadFailure = true;
    void persistSessionHistory();
    void extensionContext?.globalState.update(ACTIVE_SESSION_KEY, active);
  }
}
async function withCommandBudget<T>(commandId: string, action: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  let success = false;
  try {
    const value = await action();
    success = true;
    return value;
  } finally {
    commandLatencyMetrics.unshift({
      commandId,
      durationMs: Math.max(0, Date.now() - startedAt),
      success,
      timestamp: Date.now(),
    });
    if (commandLatencyMetrics.length > 1000) {
      commandLatencyMetrics.length = 1000;
    }
    void persistCommandLatencyMetrics();
  }
}
async function startSession(context: vscode.ExtensionContext): Promise<void> {
  const existing = context.globalState.get<SessionRecord | undefined>(ACTIVE_SESSION_KEY);
  if (existing && !existing.endedAt) {
    sessionHistory.unshift({
      ...existing,
      endedAt: Date.now(),
      unexpectedTermination: true,
    });
  }
  currentSessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const session: SessionRecord = {
    id: currentSessionId,
    startedAt: Date.now(),
    hadFailure: false,
  };
  sessionHistory.unshift(session);
  if (sessionHistory.length > 300) {
    sessionHistory.length = 300;
  }
  await persistSessionHistory();
  await context.globalState.update(ACTIVE_SESSION_KEY, session);
}
function endSession(graceful: boolean): void {
  if (!extensionContext || !currentSessionId) {
    return;
  }
  const active = sessionHistory.find(s => s.id === currentSessionId);
  if (active) {
    active.endedAt = Date.now();
    if (!graceful) {
      active.unexpectedTermination = true;
    }
  }
  void persistSessionHistory();
  void extensionContext.globalState.update(ACTIVE_SESSION_KEY, undefined);
}
async function appendRunHistory(entry: Omit<RunHistoryEntry, 'id' | 'timestamp' | 'label'>): Promise<void> {
  const next: RunHistoryEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    label: `${entry.moduleName} • ${entry.variant} • ${entry.deviceId}`,
    ...entry,
  };
  const history = getRunHistory().filter(h => !(h.moduleName === next.moduleName && h.variant === next.variant && h.deviceId === next.deviceId));
  history.unshift(next);
  await saveRunHistory(history.slice(0, 20));
  await savePreferredDevice(entry.moduleName, entry.variant, entry.deviceId);
}
function runDevicePrefKey(moduleName: string, variant: string): string {
  return `${moduleName}::${variant}`;
}
function getRunDevicePrefs(): RunDevicePrefs {
  if (!extensionContext) {
    return {};
  }
  return extensionContext.globalState.get<RunDevicePrefs>(RUN_DEVICE_PREFS_KEY, {});
}
async function savePreferredDevice(moduleName: string, variant: string, deviceId: string): Promise<void> {
  if (!extensionContext || !moduleName || !variant || !deviceId) {
    return;
  }
  const prefs = getRunDevicePrefs();
  prefs[runDevicePrefKey(moduleName, variant)] = deviceId;
  await extensionContext.globalState.update(RUN_DEVICE_PREFS_KEY, prefs);
}
function getPreferredDevice(moduleName: string, variant: string): string | undefined {
  const prefs = getRunDevicePrefs();
  return prefs[runDevicePrefKey(moduleName, variant)];
}
function pickSmartDevice(
  onlineDevices: Array<{ id: string; type: string }>,
  moduleName?: string,
  variant?: string,
  selectedDeviceId?: string
): string | undefined {
  const preferred = moduleName && variant ? getPreferredDevice(moduleName, variant) : undefined;
  return pickSmartDeviceId(onlineDevices, selectedDeviceId, preferred);
}
type HealthWizardItem = {
  label: string;
  description: string;
  action?: () => Promise<void>;
};
function onboardingScore(checks: OnboardingCheck[]): number {
  if (checks.length === 0) {
    return 0;
  }
  const ok = checks.filter(c => c.ok).length;
  return Math.round((ok / checks.length) * 100);
}
async function openFirstRunHealthWizard(force = false): Promise<void> {
  if (!extensionContext) {
    return;
  }
  if (!force && extensionContext.globalState.get<boolean>(FIRST_RUN_WIZARD_SUCCESS_KEY, false)) {
    return;
  }
  const checks = await getOnboardingV2Checks();
  const score = onboardingScore(checks);
  const failing = checks.filter(c => !c.ok);
  if (score === 100) {
    await extensionContext.globalState.update(FIRST_RUN_WIZARD_SEEN_KEY, true);
    await extensionContext.globalState.update(FIRST_RUN_WIZARD_SUCCESS_KEY, true);
    showInfo('First-run checks passed. Ready to run Android apps.');
    return;
  }
  const items: HealthWizardItem[] = failing.map(c => ({
    label: `$(warning) ${c.title}`,
    description: c.details,
    action: c.fixLabel ? async () => applyOnboardingV2Fix(c.id) : undefined,
  }));
  const quickPick = await vscode.window.showQuickPick(
    [
      ...items.map(i => ({
        label: i.label,
        description: i.description,
        item: i,
      })),
      {
        label: '$(wrench) Fix All Detected Issues',
        description: `Current score: ${score}%`,
        item: {
          action: async () => {
            for (const check of failing) {
              await applyOnboardingV2Fix(check.id);
            }
          },
        } as HealthWizardItem,
      },
      {
        label: '$(checklist) Open Onboarding Panel',
        description: 'View full checklist and run setup fixes',
        item: { action: async () => openOnboardingV2Panel(true) } as HealthWizardItem,
      },
      {
        label: '$(play) Open Run Panel',
        description: 'Continue with current setup',
        item: { action: async () => vscode.commands.executeCommand('android-toolkit.openRunPanel') } as HealthWizardItem,
      },
    ],
    {
      title: 'Android Tools First-Run Health Wizard',
      placeHolder: 'Select an item to auto-fix or continue',
      ignoreFocusOut: true,
    }
  );
  if (quickPick?.item?.action) {
    await quickPick.item.action();
  }
  const afterChecks = await getOnboardingV2Checks();
  const afterScore = onboardingScore(afterChecks);
  await extensionContext.globalState.update(FIRST_RUN_WIZARD_SEEN_KEY, true);
  await extensionContext.globalState.update(FIRST_RUN_WIZARD_SUCCESS_KEY, afterScore === 100);
}
async function getOnboardingV2Checks(): Promise<OnboardingCheck[]> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const languageHealth = await getLanguageHealthStatus();
  const devices = await listDevicesDetailed();
  const modules = workspaceRoot ? findApplicationModules(workspaceRoot) : [];

  let sdkOk = true;
  try {
    detectSdk();
  } catch {
    sdkOk = false;
  }
  const checks: OnboardingCheck[] = [
    {
      id: 'sdk',
      title: 'Android SDK / ADB',
      ok: sdkOk,
      details: sdkOk ? 'Detected and usable.' : 'SDK tools not configured.',
      fixLabel: sdkOk ? undefined : 'Open SDK Setup Guide',
    },
    {
      id: 'jdk',
      title: 'Java Runtime (Kotlin-safe)',
      ok: !languageHealth.kotlinRiskOnJava25,
      details: languageHealth.kotlinRiskOnJava25
        ? `Java ${languageHealth.javaVersion || languageHealth.javaMajor || 'unknown'} may break Kotlin tooling.`
        : `Java ${languageHealth.javaVersion || languageHealth.javaMajor || 'unknown'} looks good.`,
      fixLabel: languageHealth.kotlinRiskOnJava25 ? 'Use JDK 21 Path' : undefined,
    },
    {
      id: 'modules',
      title: 'Android Modules',
      ok: modules.length > 0,
      details: modules.length > 0 ? `${modules.length} module(s) found.` : 'No Android modules found in current workspace.',
      fixLabel: modules.length === 0 ? 'Create Project from Gallery' : undefined,
    },
    {
      id: 'device',
      title: 'Connected Device / Emulator',
      ok: devices.some(d => d.status === 'online'),
      details: devices.some(d => d.status === 'online')
        ? `${devices.filter(d => d.status === 'online').length} online device(s).`
        : 'No online devices detected.',
      fixLabel: devices.some(d => d.status === 'online') ? undefined : 'Start Emulator',
    },
  ];
  return checks;
}
async function applyOnboardingV2Fix(id: string): Promise<void> {
  if (id === 'sdk') {
    await vscode.env.openExternal(vscode.Uri.parse('https://developer.android.com/studio#command-tools'));
    return;
  }
  if (id === 'jdk') {
    await vscode.commands.executeCommand('android-toolkit.setJdk21Path');
    return;
  }
  if (id === 'modules') {
    await vscode.commands.executeCommand('android-toolkit.openTemplateGallery');
    return;
  }
  if (id === 'device') {
    await vscode.commands.executeCommand('android-toolkit.startEmulator');
    return;
  }
}
async function openOnboardingV2Panel(force = false): Promise<void> {
  if (!extensionContext) {
    return;
  }
  if (!force) {
    if (extensionContext.globalState.get<boolean>(FIRST_RUN_WIZARD_SUCCESS_KEY, false)) {
      return;
    }
    if (extensionContext.globalState.get<boolean>(FIRST_RUN_WIZARD_SEEN_KEY, false)) {
      return;
    }
  }
  await extensionContext.globalState.update(FIRST_RUN_WIZARD_SEEN_KEY, true);
  const { OnboardingPanel } = lazyLoad<typeof import('./ui/onboardingPanel')>('./ui/onboardingPanel');
  OnboardingPanel.createOrShow({
    load: async () => {
      const checks = await getOnboardingV2Checks();
      const success = checks.length > 0 && checks.every(check => check.ok);
      await extensionContext?.globalState.update(FIRST_RUN_WIZARD_SUCCESS_KEY, success);
      return checks;
    },
    fix: async (id: string) => applyOnboardingV2Fix(id),
    fixAll: async () => {
      const checks = await getOnboardingV2Checks();
      for (const check of checks) {
        if (!check.ok) {
          await applyOnboardingV2Fix(check.id);
        }
      }
    },
    openRunPanel: async () => {
      await vscode.commands.executeCommand('android-toolkit.openRunPanel');
    },
  });
}
async function runReleaseQualityGate(): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    showError('No workspace folder open.');
    return;
  }
  await withProgress('Android Tools: Running release quality gate', async () => {
    const res = await execCommand('npm', ['run', '-s', 'release:check'], {
      cwd: workspaceRoot,
      timeout: 15 * 60 * 1000,
      env: process.env,
    });
    const full = `${res.stdout || ''}\n${res.stderr || ''}`.trim();
    if (res.exitCode === 0) {
      showInfo('Release quality gate passed.');
      return;
    }
    await showActionableError({
      title: 'Release quality gate failed',
      why: 'One of compile/lint/tests/release checks did not pass.',
      suggestions: [
        'Open terminal output and fix the first failing step.',
        'Run "npm run -s release:check" locally to iterate quickly.',
      ],
      actions: [
        {
          label: 'Open Output',
          action: async () => {
            const doc = await vscode.workspace.openTextDocument({
              language: 'text',
              content: full || 'No output captured.',
            });
            await vscode.window.showTextDocument(doc, { preview: false });
          },
        },
      ],
    });
  });
}
async function collectDiagnosticsSnapshot(): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const lines: string[] = [];
  lines.push('# Android Tools Diagnostics');
  lines.push(`- Time: ${new Date().toISOString()}`);
  lines.push(`- Platform: ${process.platform} ${process.arch}`);
  lines.push(`- Node: ${process.version}`);
  lines.push(`- VS Code: ${vscode.version}`);
  lines.push(`- Workspace: ${workspaceRoot || '(none)'}`);

  const java = await execCommand('java', ['-version'], { timeout: 8000 });
  lines.push('## Java');
  lines.push('```');
  lines.push((java.stderr || java.stdout || 'java not found').trim());
  lines.push('```');

  lines.push('## Android SDK');
  try {
    const sdk = detectSdk();
    lines.push(`- adb: ${sdk.adb}`);
    lines.push(`- emulator: ${sdk.emulator}`);
    lines.push(`- avdmanager: ${sdk.avdmanager}`);
  } catch (error) {
    lines.push(`- detectSdk: failed (${error instanceof Error ? error.message : 'unknown'})`);
  }

  const devices = await listDevicesDetailed();
  lines.push('## Devices');
  if (devices.length === 0) {
    lines.push('- none');
  } else {
    for (const d of devices) {
      lines.push(`- ${d.id} (${d.type}) status=${d.status}`);
    }
  }

  if (workspaceRoot) {
    const modules = findApplicationModules(workspaceRoot);
    lines.push('## Modules');
    if (modules.length === 0) {
      lines.push('- none');
    } else {
      for (const m of modules) {
        const variant = await getSelectedVariant(m);
        lines.push(`- ${m} variant=${variant}`);
      }
    }
  }

  lines.push('## Settings');
  lines.push(`- androidToolkit.notifications.mode: ${vscode.workspace.getConfiguration('androidToolkit').get('notifications.mode', 'quiet')}`);

  const defaultPath = workspaceRoot
    ? path.join(workspaceRoot, `android-tools-diagnostics-${Date.now()}.md`)
    : path.join(process.cwd(), `android-tools-diagnostics-${Date.now()}.md`);
  const uri = await vscode.window.showSaveDialog({
    title: 'Save Diagnostics Snapshot',
    saveLabel: 'Save',
    filters: { Markdown: ['md'] },
    defaultUri: vscode.Uri.file(defaultPath),
  });
  if (!uri) {
    return;
  }
  await vscode.workspace.fs.writeFile(uri, Buffer.from(lines.join('\n'), 'utf8'));
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc, { preview: false });
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
  const modules = findApplicationModulesCached(workspaceRoot);
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
let onlineDevicesCache: { at: number; devices: AndroidDevice[] } | undefined;
const modulesCache = new Map<string, { at: number; modules: string[] }>();

async function listOnlineDevicesCached(ttlMs = 1500): Promise<AndroidDevice[]> {
  const now = Date.now();
  if (onlineDevicesCache && now - onlineDevicesCache.at <= ttlMs) {
    return onlineDevicesCache.devices;
  }
  const devices = (await listDevicesDetailed()).filter(d => d.status === 'online');
  onlineDevicesCache = {
    at: now,
    devices: devices.map(d => ({
      id: d.id,
      status: d.status,
      type: d.type,
      model: d.model,
      androidVersion: d.androidVersion,
    })),
  };
  return onlineDevicesCache.devices;
}

function invalidateFastCaches(workspaceRoot?: string): void {
  onlineDevicesCache = undefined;
  if (workspaceRoot) {
    modulesCache.delete(workspaceRoot);
  } else {
    modulesCache.clear();
  }
}

function findApplicationModulesCached(workspaceRoot: string, ttlMs = 4000): string[] {
  const now = Date.now();
  const cached = modulesCache.get(workspaceRoot);
  if (cached && now - cached.at <= ttlMs) {
    return cached.modules;
  }
  const modules = findApplicationModules(workspaceRoot);
  modulesCache.set(workspaceRoot, { at: now, modules });
  return modules;
}
function recordStartupPhase(name: string, startedAtMs: number, activationStartMs: number): void {
  const durationMs = Date.now() - startedAtMs;
  startupProfilerEntries.push({
    name,
    durationMs,
    atMs: Math.max(0, startedAtMs - activationStartMs),
  });
}
async function persistStartupProfiler(): Promise<void> {
  if (!extensionContext) {
    return;
  }
  await extensionContext.globalState.update(STARTUP_PROFILER_ENTRIES_KEY, startupProfilerEntries.slice(0, 80));
  await extensionContext.globalState.update(STARTUP_PROFILER_TOTAL_KEY, startupProfilerTotalMs);
}
function openStartupProfilerPanel(): void {
  StartupProfilerPanel.createOrShow(startupProfilerEntries, startupProfilerTotalMs);
}
async function persistActionReplay(): Promise<void> {
  if (!extensionContext) {
    return;
  }
  await extensionContext.globalState.update(ACTION_REPLAY_KEY, actionReplay.slice(0, 300));
}
function trackActionReplay(action: string, args: unknown, durationMs: number, success: boolean, error?: string): void {
  actionReplay.unshift({
    action,
    args: safeStringify(args),
    durationMs: Math.max(0, durationMs),
    success,
    timestamp: Date.now(),
    error: error ? String(error).slice(0, 400) : undefined,
  });
  if (actionReplay.length > 300) {
    actionReplay.length = 300;
  }
  void persistActionReplay();
}
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
async function withActionReplay<T>(action: string, args: unknown, fn: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await fn();
    trackActionReplay(action, args, Date.now() - startedAt, true);
    return result;
  } catch (error) {
    trackActionReplay(action, args, Date.now() - startedAt, false, error instanceof Error ? error.message : String(error));
    throw error;
  }
}
async function openActionReplayReport(): Promise<void> {
  const lines: string[] = [];
  lines.push('# Android Tools Action Replay');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Records: ${actionReplay.length}`);
  lines.push('');
  actionReplay.slice(0, 120).forEach((item, index) => {
    lines.push(`${index + 1}. ${item.success ? '[OK]' : '[FAIL]'} ${item.action} (${item.durationMs} ms)`);
    lines.push(`   Args: ${item.args}`);
    lines.push(`   At: ${new Date(item.timestamp).toISOString()}`);
    if (item.error) {
      lines.push(`   Error: ${item.error}`);
    }
  });
  const doc = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content: lines.join('\n'),
  });
  await vscode.window.showTextDocument(doc, { preview: false });
}
async function evaluateConfigPolicy(workspaceRoot: string): Promise<void> {
  const read = readProjectConfig(workspaceRoot);
  const policy = read.config.policy;
  if (!policy) {
    return;
  }
  const moduleName = (await getSelectedModule()) || policy.enforceModule || '';
  const variant = moduleName ? await getSelectedVariant(moduleName) : '';
  if (Array.isArray(policy.allowedVariants) && variant && !policy.allowedVariants.includes(variant)) {
    const key = `variant:${moduleName}:${variant}`;
    if (!policyWarningsShown.has(key)) {
      policyWarningsShown.add(key);
      showWarning(`Policy warning: variant "${variant}" is not allowed by team policy.`);
    }
  }
  if (policy.requiredSettings && typeof policy.requiredSettings === 'object') {
    const cfg = vscode.workspace.getConfiguration('androidToolkit');
    for (const [k, expected] of Object.entries(policy.requiredSettings)) {
      const actual = cfg.get(k);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        const key = `setting:${k}`;
        if (!policyWarningsShown.has(key)) {
          policyWarningsShown.add(key);
          showWarning(`Policy warning: androidToolkit.${k} should be ${JSON.stringify(expected)}.`);
        }
      }
    }
  }
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
  const online = await listOnlineDevicesCached();
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
  const modules = findApplicationModulesCached(workspaceRoot);
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
  const variant = await getSelectedVariant(moduleName);
  const selectedDeviceId = await getSelectedDeviceId();
  const online = await listOnlineDevicesCached();
  if (online.length === 0) {
    showWarning('No online devices found.');
    return;
  }
  const smart = pickSmartDevice(online, moduleName, variant, selectedDeviceId);
  let finalDeviceId = smart;
  if (!selectedDeviceId && online.length > 1) {
    const picked = await pickDevice(online, { title: 'Select Device', placeholder: 'Choose device (smart recommendation preselected)' });
    finalDeviceId = picked?.id || smart;
  }
  if (!finalDeviceId) {
    return;
  }
  await setSelectedDeviceId(finalDeviceId, `${finalDeviceId} (${online.find(d => d.id === finalDeviceId)?.type || 'device'})`);
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
    lastGradleErrorLocation = undefined;
    lastGradleErrorTags = [];
  } else {
    const raw = result.stderr || result.stdout || '';
    lastGradleErrorSummary = summarizeGradleError(raw);
    lastGradleErrorLocation = extractErrorLocation(raw, workspaceRoot);
  }
  return result.exitCode === 0;
}
function summarizeGradleError(raw: string): string {
  const classification = classifyGradleFailure(raw);
  lastGradleErrorTags = classification.tags;
  return classification.summary;
}
function extractErrorLocation(raw: string, workspaceRoot: string): { file: string; line: number; column?: number } | undefined {
  const patterns = [
    /^(.+?):(\d+):(\d+):\s*(?:error|warning):/m,
    /^(.+?):(\d+):\s*(?:error|warning):/m,
    /^(?:e: |w: )(.+?):\s*\((\d+),\s*(\d+)\):/m,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (!match) {
      continue;
    }
    const file = path.isAbsolute(match[1]) ? match[1] : path.join(workspaceRoot, match[1]);
    const line = Math.max(1, parseInt(match[2], 10) || 1);
    const col = match[3] ? Math.max(1, parseInt(match[3], 10) || 1) : 1;
    return { file, line, column: col };
  }
  return undefined;
}
async function runPreflightChecks(
  workspaceRoot: string,
  moduleName: string,
  variant: string,
  deviceId: string,
  requireDevice = true
): Promise<{ ok: boolean; message?: string; fixes?: RunFixSuggestion[] }> {
  if (!workspaceRoot) {
    return { ok: false, message: 'No workspace folder open.', fixes: [{ id: 'openWorkspace', label: 'Open Workspace' }] };
  }
  const modules = findApplicationModules(workspaceRoot);
  if (!modules.includes(moduleName)) {
    return { ok: false, message: `Module "${moduleName}" not found.`, fixes: [{ id: 'selectModule', label: 'Select Module' }] };
  }
  try {
    detectSdk();
  } catch {
    return {
      ok: false,
      message: 'Android SDK/ADB not configured.',
      fixes: [
        { id: 'openSdkDocs', label: 'Open SDK Setup Guide' },
        { id: 'showGradleOutput', label: 'Open Gradle Output' },
      ],
    };
  }
  const variants = await getAvailableVariants(workspaceRoot, moduleName);
  if (variants.length > 0 && !variants.includes(variant)) {
    return {
      ok: false,
      message: `Variant "${variant}" is not available for ${moduleName}.`,
      fixes: [{ id: 'selectVariant', label: 'Select Variant' }],
    };
  }
  if (requireDevice) {
    const devices = await listDevicesDetailed();
    const selected = devices.find(d => d.id === deviceId && d.status === 'online');
    if (!selected) {
      return { ok: false, message: 'Selected device is offline or unavailable.', fixes: [{ id: 'selectDevice', label: 'Select Device' }] };
    }
  }
  return { ok: true };
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
function isAdbConnectionIssue(message: string | undefined): boolean {
  if (!message) {
    return false;
  }
  return /(device offline|offline|no devices|device not found|transport.*(closed|error)|connection.*(closed|reset)|adb server is out of date)/i.test(message);
}
function isGradleDaemonIssue(message: string | undefined): boolean {
  if (!message) {
    return false;
  }
  return /(gradle daemon|daemon disappeared|unable to start daemon|daemon has disappeared)/i.test(message);
}
async function recoverAdbConnection(deviceId: string): Promise<void> {
  const sdk = detectSdk();
  await execCommand(sdk.adb, ['start-server'], { timeout: 30_000 });
  if (deviceId) {
    await execCommand(sdk.adb, ['-s', deviceId, 'wait-for-device'], { timeout: 30_000 });
  }
}
async function runGradleInstallWithRecovery(
  workspaceRoot: string,
  installTask: string,
  gradleArgs: string[],
  env: NodeJS.ProcessEnv | undefined,
  deviceId: string
) {
  let result = await runGradleTaskWithResult(workspaceRoot, installTask, gradleArgs, env);
  let raw = result.stderr || result.stdout || '';
  if (result.exitCode === 0) {
    return result;
  }
  if (isGradleDaemonIssue(raw)) {
    const gradleCmd = path.join(workspaceRoot, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
    const stopCmd = fs.existsSync(gradleCmd) ? gradleCmd : 'gradle';
    await execCommand(stopCmd, ['--stop'], { cwd: workspaceRoot, timeout: 60_000 });
  }
  if (isAdbConnectionIssue(raw)) {
    await recoverAdbConnection(deviceId);
  }
  result = await runGradleTaskWithResult(workspaceRoot, installTask, gradleArgs, env);
  return result;
}
async function startAppWithRecovery(deviceId: string, packageName: string) {
  let result = await AdbService.startApp(deviceId, packageName);
  if (result.success) {
    return result;
  }
  if (isAdbConnectionIssue(result.message)) {
    await recoverAdbConnection(deviceId);
    result = await AdbService.startApp(deviceId, packageName);
  }
  return result;
}
async function installApkWithRetryForDevice(deviceId: string, apkPath: string): Promise<{ success: boolean; message: string; attempts: number }> {
  const first = await AdbService.installApk(deviceId, apkPath);
  if (first.success) {
    return { success: true, message: first.message, attempts: 1 };
  }
  if (!isAdbConnectionIssue(first.message)) {
    return { success: false, message: first.message, attempts: 1 };
  }
  await recoverAdbConnection(deviceId);
  const second = await AdbService.installApk(deviceId, apkPath);
  return { success: second.success, message: second.message, attempts: 2 };
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
    const installResult = await runGradleInstallWithRecovery(workspaceRoot, installTask, gradleArgs, env, deviceId);
    showGradleOutput(installTask, installResult, workspaceRoot);
    if (installResult.exitCode === 0) {
      lastGradleErrorSummary = undefined;
      lastGradleErrorLocation = undefined;
      lastGradleErrorTags = [];
      return true;
    }
    const raw = installResult.stderr || installResult.stdout || '';
    lastGradleErrorSummary = summarizeGradleError(raw);
    lastGradleErrorLocation = extractErrorLocation(raw, workspaceRoot);
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
      lastGradleErrorLocation = extractErrorLocation(gradleMessage, workspaceRoot);
      return false;
    }
    lastGradleErrorSummary = undefined;
    lastGradleErrorLocation = undefined;
    lastGradleErrorTags = [];
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
  if (result.success) {
    return true;
  }
  if (isAdbConnectionIssue(result.message)) {
    showWarning('ADB connection issue detected. Trying auto-recovery and reinstall...');
    await recoverAdbConnection(deviceId);
    const retry = await AdbService.installApk(deviceId, apkPath);
    if (retry.success) {
      return true;
    }
    showError(retry.message);
    return false;
  }
  if (/INSTALL_FAILED_UPDATE_INCOMPATIBLE/i.test(result.message)) {
    const packageName = findApplicationId(workspaceRoot, moduleName);
    if (packageName) {
      await AdbService.uninstallApp(deviceId, packageName);
      const retry = await AdbService.installApk(deviceId, apkPath);
      if (retry.success) {
        return true;
      }
      showError(retry.message);
      return false;
    }
  }
  showError(result.message);
  return false;
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
    const result = await startAppWithRecovery(deviceId, packageName as string);
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
function listRunConfigurationsLite(): Array<{ id: string; name: string; moduleName: string; variant: string; deviceId?: string; launchType: 'default' | 'activity' | 'deeplink' }> {
  return getRunConfigurations().map(c => ({
    id: c.id,
    name: c.name,
    moduleName: c.moduleName,
    variant: c.variant,
    deviceId: c.deviceId,
    launchType: c.launchType,
  }));
}
async function updateRunConfigurationLite(profile: { id: string; name: string; moduleName: string; variant: string; deviceId?: string; launchType: 'default' | 'activity' | 'deeplink' }): Promise<void> {
  const configs = getRunConfigurations();
  const index = configs.findIndex(c => c.id === profile.id);
  if (index < 0) {
    showWarning('Run configuration not found.');
    return;
  }
  if (!profile.name?.trim() || !profile.moduleName?.trim() || !profile.variant?.trim()) {
    showWarning('Profile name/module/variant are required.');
    return;
  }
  const current = configs[index];
  configs[index] = {
    ...current,
    name: profile.name.trim(),
    moduleName: profile.moduleName.trim(),
    variant: profile.variant.trim(),
    deviceId: profile.deviceId?.trim() || undefined,
    launchType: profile.launchType,
  };
  await saveRunConfigurations(configs);
  showInfo(`Profile updated: ${profile.name.trim()}`);
}
async function runRunConfigurationById(configId: string, mode: 'run' | 'debug' = 'run'): Promise<void> {
  const config = getRunConfigurations().find(c => c.id === configId);
  if (!config) {
    showWarning('Run configuration not found.');
    return;
  }
  await executeRunConfiguration(config, mode);
}
async function executeRunConfiguration(config: RunConfiguration, mode: 'run' | 'debug' = 'run'): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    showError('No workspace folder open.');
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
  if (mode === 'debug') {
    await vscode.commands.executeCommand('android-toolkit.attachDebugger');
  }
}
async function runRunConfiguration(mode: 'run' | 'debug' = 'run'): Promise<void> {
  const config = await selectRunConfiguration();
  if (!config) {
    return;
  }
  await executeRunConfiguration(config, mode);
}
async function duplicateRunConfiguration(configId?: string): Promise<void> {
  const configs = getRunConfigurations();
  if (configs.length === 0) {
    showWarning('No run configurations found.');
    return;
  }
  let source: RunConfiguration | undefined;
  if (configId) {
    source = configs.find(c => c.id === configId);
  }
  if (!source) {
    const picked = await vscode.window.showQuickPick(
      configs.map(c => ({
        label: c.name,
        description: `${c.moduleName} • ${c.variant}`,
        config: c,
      })),
      { placeHolder: 'Select run configuration to duplicate' }
    );
    source = picked?.config;
  }
  if (!source) {
    return;
  }
  const nextName = await vscode.window.showInputBox({
    prompt: 'Name for duplicated configuration',
    value: `${source.name} Copy`,
  });
  if (!nextName) {
    return;
  }
  const copy: RunConfiguration = {
    ...source,
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: nextName,
  };
  configs.push(copy);
  await saveRunConfigurations(configs);
  showInfo(`Run configuration duplicated: ${nextName}`);
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
        const res = await installApkWithRetryForDevice(device.deviceId, apkPath as string);
        return { device, res };
      })
    );
  });
  for (const item of results) {
    const prefix = item.res.success ? '[OK]' : '[FAIL]';
    const suffix = item.res.attempts > 1 ? ` (attempts: ${item.res.attempts})` : '';
    output.appendLine(`${prefix} ${item.device.label} - ${item.res.message}${suffix}`);
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
        const install = await installApkWithRetryForDevice(d.deviceId, apkPath);
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
  const { LayoutPreviewPanel } = lazyLoad<typeof import('./layout/layoutPreviewPanel')>('./layout/layoutPreviewPanel');
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
  const { LayoutEditorPanel } = lazyLoad<typeof import('./layout/layoutEditorPanel')>('./layout/layoutEditorPanel');
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

async function applyRunFixById(fixId: string): Promise<RunActionResult> {
  if (fixId === 'showGradleOutput') {
    revealGradleOutput();
    return { success: true, message: 'Gradle output opened.' };
  }
  if (fixId === 'selectDevice') {
    await selectDeviceCommand();
    return { success: true, message: 'Device picker opened.' };
  }
  if (fixId === 'selectModule') {
    await selectModuleCommand();
    return { success: true, message: 'Module picker opened.' };
  }
  if (fixId === 'selectVariant') {
    await vscode.commands.executeCommand('android-toolkit.selectBuildVariant');
    return { success: true, message: 'Variant selector opened.' };
  }
  if (fixId === 'openSdkDocs') {
    await vscode.env.openExternal(vscode.Uri.parse('https://developer.android.com/studio#command-tools'));
    return { success: true, message: 'Android SDK setup guide opened.' };
  }
  if (fixId === 'openWorkspace') {
    const folder = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Open Workspace',
    });
    if (folder?.[0]) {
      await vscode.commands.executeCommand('vscode.openFolder', folder[0], false);
      return { success: true, message: 'Workspace opened.' };
    }
    return { success: false, message: 'No workspace selected.' };
  }
  if (fixId === 'setJdk21Path') {
    await vscode.commands.executeCommand('android-toolkit.setJdk21Path');
    return { success: true, message: 'JDK 21 path flow opened.' };
  }
  if (fixId === 'runGradleDoctor') {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      return { success: false, message: 'No workspace folder open.' };
    }
    await runGradleDoctor(workspaceRoot);
    return { success: true, message: 'Gradle Doctor executed.' };
  }
  if (fixId === 'openSigningWizard') {
    await vscode.commands.executeCommand('android-toolkit.signingWizard');
    return { success: true, message: 'Signing wizard opened.' };
  }
  if (fixId === 'runGradleSync') {
    await vscode.commands.executeCommand('android-toolkit.gradleSync');
    return { success: true, message: 'Gradle sync started.' };
  }
  return { success: false, message: `Unknown fix action: ${fixId}` };
}
async function applyRunFixTracked(fixId: string): Promise<RunActionResult> {
  const result = await applyRunFixById(fixId);
  runFixAttempts.unshift({
    fixId,
    reason: normalizeErrorReason(lastGradleErrorTags[0]),
    success: result.success,
    timestamp: Date.now(),
  });
  if (runFixAttempts.length > 500) {
    runFixAttempts.length = 500;
  }
  await persistRunFixAttempts();
  return result;
}
async function openRunFailureReport(): Promise<void> {
  const content = buildRunFailureReport(runFailureRecords, 10);
  const doc = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content,
  });
  await vscode.window.showTextDocument(doc, { preview: false });
}
function openFailureInsightsPanel(): void {
  const summary = summarizeFailureInsights(runFailureRecords, runFixAttempts);
  FailureInsightsPanel.createOrShow(summary);
}
function openSloDashboardPanel(): void {
  const summary = summarizeSlo(runActionMetrics, sessionHistory, summarizeCommandBudgets(commandLatencyMetrics));
  SloDashboardPanel.createOrShow(summary);
}
function openErrorKnowledgeBasePanel(): void {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    showError('No workspace folder open.');
    return;
  }
  const { ErrorKnowledgeBasePanel } = lazyLoad<typeof import('./insights/errorKnowledgeBasePanel')>('./insights/errorKnowledgeBasePanel');
  ErrorKnowledgeBasePanel.createOrShow(workspaceRoot, runFailureRecords);
}
async function runCiSmoke(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel('Android Tools CI Smoke');
  output.clear();
  output.appendLine('Starting CI smoke checks...');
  await vscode.commands.executeCommand('android-toolkit.openRunPanel');
  output.appendLine('[OK] Run panel opened');

  const online = (await listDevicesDetailed()).filter(d => d.status === 'online');
  output.appendLine(`[INFO] Online devices: ${online.length}`);
  if (online.length > 0) {
    const first = online[0];
    await setSelectedDeviceId(first.id, `${first.id} (${first.type})`);
    output.appendLine(`[OK] Selected device: ${first.id}`);
  } else {
    output.appendLine('[INFO] No online devices available; skipping device selection');
  }

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspaceRoot) {
    const modules = findApplicationModules(workspaceRoot);
    output.appendLine(`[INFO] Matrix readiness modules: ${modules.length}`);
    const { MatrixDashboardPanel } = lazyLoad<typeof import('./matrix/matrixDashboardPanel')>('./matrix/matrixDashboardPanel');
    MatrixDashboardPanel.createOrShow(context, workspaceRoot);
    output.appendLine('[OK] Matrix dashboard opened (matrix dry-run readiness)');
    const exported = await exportTeamConfig(context, workspaceRoot);
    output.appendLine(`[OK] Team config exported: ${exported}`);
    const imported = await importTeamConfig(context, workspaceRoot);
    output.appendLine(imported.warnings.length > 0
      ? `[WARN] Team config imported with warnings: ${imported.warnings.join('; ')}`
      : '[OK] Team config imported');
  } else {
    output.appendLine('[INFO] No workspace folder open; skipping matrix/team checks');
  }
  output.appendLine('CI smoke completed.');
  output.show(true);
}
async function exportTeamSettingsCommand(context: vscode.ExtensionContext): Promise<void> {
  try {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      showError('No workspace folder open.');
      return;
    }
    const filePath = await exportTeamConfig(context, workspaceRoot);
    showInfo(`Project settings exported: ${filePath}`);
  } catch (error) {
    handleError(error);
  }
}
async function importTeamSettingsCommand(context: vscode.ExtensionContext): Promise<void> {
  try {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      showError('No workspace folder open.');
      return;
    }
    const result = await importTeamConfig(context, workspaceRoot);
    if (result.warnings.length > 0) {
      showWarning(`Team settings imported with warnings:\\n- ${result.warnings.join('\\n- ')}`);
    } else {
      showInfo(`Team settings imported: ${result.filePath}`);
    }
  } catch (error) {
    handleError(error);
  }
}
function openTemplateGallery(): void {
  const { TemplateGalleryPanel } = lazyLoad<typeof import('./projectView/templateGalleryPanel')>('./projectView/templateGalleryPanel');
  TemplateGalleryPanel.createOrShow({
    createProjectFromTemplate: async (template) => {
      const defaultLang = template === 'compose-empty' ? 'kotlin' : undefined;
      await createAndroidProjectWizardWithOptions({
        templateValue: template,
        languageValue: defaultLang as 'kotlin' | 'java' | undefined,
      });
    },
  });
}
function openRunProfilesV2(): void {
  const { RunProfilesPanel } = lazyLoad<typeof import('./run/runProfilesPanel')>('./run/runProfilesPanel');
  RunProfilesPanel.createOrShow({
    listProfiles: async () => listRunConfigurationsLite(),
    createProfile: async () => createRunConfiguration(),
    updateProfile: async (profile) => updateRunConfigurationLite(profile),
    deleteProfile: async (id: string) => {
      const configs = getRunConfigurations();
      const target = configs.find(c => c.id === id);
      if (!target) {
        return;
      }
      await saveRunConfigurations(configs.filter(c => c.id !== id));
      showInfo(`Deleted run configuration: ${target.name}`);
    },
    runProfile: async (id: string) => runRunConfigurationById(id, 'run'),
    debugProfile: async (id: string) => runRunConfigurationById(id, 'debug'),
    duplicateProfile: async (id: string) => duplicateRunConfiguration(id),
  });
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
  const activationStartedAt = Date.now();
  startupProfilerEntries.length = 0;
  extensionContext = context;
  const persistedStartupEntries = context.globalState.get<StartupProfilerEntry[]>(STARTUP_PROFILER_ENTRIES_KEY, []);
  startupProfilerEntries.splice(0, startupProfilerEntries.length, ...persistedStartupEntries);
  startupProfilerTotalMs = context.globalState.get<number>(STARTUP_PROFILER_TOTAL_KEY, 0);
  const persistedActionReplay = context.globalState.get<ActionReplayRecord[]>(ACTION_REPLAY_KEY, []);
  if (persistedActionReplay.length > 0) {
    actionReplay.splice(0, actionReplay.length, ...persistedActionReplay.slice(0, 300));
  }
  const persistedMetrics = context.globalState.get<RunActionMetric[]>(RUN_ACTION_METRICS_KEY, []);
  if (persistedMetrics.length > 0) {
    runActionMetrics.splice(0, runActionMetrics.length, ...persistedMetrics.slice(0, 1000));
  }
  const persistedCommandMetrics = context.globalState.get<CommandLatencyRecord[]>(COMMAND_LATENCY_METRICS_KEY, []);
  if (persistedCommandMetrics.length > 0) {
    commandLatencyMetrics.splice(0, commandLatencyMetrics.length, ...persistedCommandMetrics.slice(0, 1000));
  }
  const persistedSessions = context.globalState.get<SessionRecord[]>(SESSION_HISTORY_KEY, []);
  if (persistedSessions.length > 0) {
    sessionHistory.splice(0, sessionHistory.length, ...persistedSessions.slice(0, 300));
  }
  const persistedFailures = context.globalState.get<RunFailureRecord[]>(RUN_FAILURE_RECORDS_KEY, []);
  if (persistedFailures.length > 0) {
    runFailureRecords.splice(
      0,
      runFailureRecords.length,
      ...persistedFailures.slice(0, 500).map(item => ({ ...item, reason: normalizeErrorReason(item.reason) }))
    );
  }
  const persistedFixAttempts = context.globalState.get<RunFixAttemptRecord[]>(RUN_FIX_ATTEMPTS_KEY, []);
  if (persistedFixAttempts.length > 0) {
    runFixAttempts.splice(
      0,
      runFixAttempts.length,
      ...persistedFixAttempts.slice(0, 500).map(item => ({ ...item, reason: normalizeErrorReason(item.reason) }))
    );
  }
  const tStatusBar = Date.now();
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
  recordStartupPhase('statusBar:init', tStatusBar, activationStartedAt);
  const tViews = Date.now();
  const projectProvider = new AndroidProjectProvider();
  const projectTreeView = vscode.window.createTreeView('androidProjectView', {
    treeDataProvider: projectProvider,
    showCollapseAll: true,
    dragAndDropController: projectProvider.dragAndDropController,
  });
  context.subscriptions.push(projectTreeView);
  const controlProvider = new EmulatorControlProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('emulatorControlView', controlProvider)
  );
  const deviceManagerProvider = new DeviceManagerProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('deviceManagerView', deviceManagerProvider)
  );
  const deviceFileExplorerProvider = new DeviceFileExplorerProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('deviceFileExplorerView', deviceFileExplorerProvider)
  );
  const gradleTasksProvider = new GradleTasksProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('androidToolkitGradleTasksView', gradleTasksProvider)
  );
  problemsProvider = new AndroidProblemsProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('androidProblemsView', problemsProvider)
  );
  recordStartupPhase('views:register', tViews, activationStartedAt);
  logPerf('activate:registerViews', Date.now() - activationStartedAt);
  const autoSyncEnabled = vscode.workspace.getConfiguration('androidToolkit').get<boolean>('sync.autoSync.enabled', true);
  const autoSyncInterval = vscode.workspace.getConfiguration('androidToolkit').get<number>('sync.autoSync.intervalMs', 4000);
  let lastDeviceFingerprint = '';
  let autoSyncInFlight = false;
  let autoSyncQueued = false;
  const buildDeviceFingerprint = (items: Array<{ id: string; status: string; type: string }>): string =>
    items
      .map(d => `${d.id}:${d.status}:${d.type}`)
      .sort((a, b) => a.localeCompare(b))
      .join('|');
  const runAutoSyncTick = async (): Promise<void> => {
    if (autoSyncInFlight) {
      autoSyncQueued = true;
      return;
    }
    autoSyncInFlight = true;
    try {
      await EmulatorStateService.getInstance().forceCheck();
      const devices = await listDevicesDetailed();
      const next = buildDeviceFingerprint(devices.map(d => ({ id: d.id, status: d.status, type: d.type })));
      if (next === lastDeviceFingerprint) {
        return;
      }
      lastDeviceFingerprint = next;
      invalidateFastCaches(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath);
      projectProvider.refresh();
      controlProvider.refresh();
      deviceManagerProvider.refresh();
      deviceFileExplorerProvider.refresh();
      refreshStatusBar();
    } catch {
    } finally {
      autoSyncInFlight = false;
      if (autoSyncQueued) {
        autoSyncQueued = false;
        setTimeout(() => void runAutoSyncTick(), 120);
      }
    }
  };
  if (autoSyncEnabled) {
    backgroundScheduler.register('autoSync', Math.max(1500, autoSyncInterval), async () => {
      await runAutoSyncTick();
    });
    backgroundScheduler.start('autoSync');
    context.subscriptions.push(new vscode.Disposable(() => backgroundScheduler.stop('autoSync')));
  }
  const tLanguage = Date.now();
  const xmlLivePreviewController = new XmlLivePreviewController();
  const xmlLintController = new AndroidLayoutLintController();
  context.subscriptions.push(xmlLivePreviewController);
  context.subscriptions.push(xmlLintController);
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
    ),
    vscode.languages.registerCompletionItemProvider(
      { language: 'xml', scheme: 'file', pattern: '**/res/layout/**/*.xml' },
      new AndroidLayoutXmlCompletionProvider(),
      '<',
      ':'
    ),
    vscode.languages.registerCodeActionsProvider(
      { language: 'xml', scheme: 'file', pattern: '**/res/layout/**/*.xml' },
      new AndroidXmlQuickFixProvider(),
      {
        providedCodeActionKinds: AndroidXmlQuickFixProvider.providedCodeActionKinds,
      }
    )
  );
  recordStartupPhase('languages:register', tLanguage, activationStartedAt);
  const workspaceWatcher = vscode.workspace.onDidChangeWorkspaceFolders(() => {
    invalidateFastCaches();
    projectProvider.refresh();
  });
  context.subscriptions.push(workspaceWatcher);
  const workspaceFileWatcher = vscode.workspace.createFileSystemWatcher('**/{settings.gradle,settings.gradle.kts,build.gradle,build.gradle.kts,gradle.properties,local.properties}');
  const invalidateFromWorkspaceChange = (): void => {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    invalidateFastCaches(workspaceRoot);
    if (workspaceRoot) {
      invalidateGradleTaskCache(workspaceRoot);
    } else {
      invalidateGradleTaskCache();
    }
  };
  workspaceFileWatcher.onDidChange(invalidateFromWorkspaceChange);
  workspaceFileWatcher.onDidCreate(invalidateFromWorkspaceChange);
  workspaceFileWatcher.onDidDelete(invalidateFromWorkspaceChange);
  context.subscriptions.push(workspaceFileWatcher);
  const tCommands = Date.now();
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
    vscode.commands.registerCommand('android-toolkit.undoLastProjectAction', () => {
      undoLastProjectAction(projectProvider);
    }),
    vscode.commands.registerCommand('android-toolkit.createProject', () => {
      createAndroidProjectWizard();
    }),
    vscode.commands.registerCommand('android-toolkit.openTemplateGallery', () => {
      openTemplateGallery();
    }),
    vscode.commands.registerCommand('android-toolkit.setJdk21Path', async () => {
      const ok = await setJdk21Path();
      if (ok) {
        showInfo('JDK path updated to selected folder.');
      }
    }),
    vscode.commands.registerCommand('android-toolkit.cancelActiveOperation', () => {
      operationManager.cancel(RUN_PANEL_SCOPE);
      showInfo('Active operation cancel requested.');
    }),
    vscode.commands.registerCommand('android-toolkit.collectDiagnosticsSnapshot', async () => {
      await collectDiagnosticsSnapshot();
    }),
    vscode.commands.registerCommand('android-toolkit.openRunFailureReport', async () => {
      await openRunFailureReport();
    }),
    vscode.commands.registerCommand('android-toolkit.openStartupProfiler', () => {
      openStartupProfilerPanel();
    }),
    vscode.commands.registerCommand('android-toolkit.openActionReplayReport', async () => {
      await openActionReplayReport();
    }),
    vscode.commands.registerCommand('android-toolkit.releaseQualityGate', async () => {
      await runReleaseQualityGate();
    }),
    vscode.commands.registerCommand('android-toolkit.openFailureInsights', () => {
      openFailureInsightsPanel();
    }),
    vscode.commands.registerCommand('android-toolkit.openSloDashboard', () => {
      openSloDashboardPanel();
    }),
    vscode.commands.registerCommand('android-toolkit.openErrorKnowledgeBase', () => {
      openErrorKnowledgeBasePanel();
    }),
    vscode.commands.registerCommand('android-toolkit.exportTeamConfig', async () => {
      await exportTeamSettingsCommand(context);
    }),
    vscode.commands.registerCommand('android-toolkit.importTeamConfig', async () => {
      await importTeamSettingsCommand(context);
    }),
    vscode.commands.registerCommand('android-toolkit.ciSmoke', async () => {
      await runCiSmoke(context);
    }),
    vscode.commands.registerCommand('android-toolkit.firstRunHealthWizard', async () => {
      await openFirstRunHealthWizard(true);
    }),
    vscode.commands.registerCommand('android-toolkit.openOnboardingV2', async () => {
      await openOnboardingV2Panel(true);
    }),
    vscode.commands.registerCommand('android-toolkit.runSelectedAlias', async () => {
      await withCommandBudget('android-toolkit.runSelectedAlias', async () => {
        await withActionReplay('android-toolkit.runSelectedAlias', {}, async () => {
          await runAppOnTargetSelected();
        });
      });
    }),
    vscode.commands.registerCommand('android-toolkit.stopSelectedAlias', async () => {
      await stopAppCommand();
    }),
    vscode.commands.registerCommand('android-toolkit.logcatThisApp', async () => {
      await vscode.commands.executeCommand('android-toolkit.openLogcat');
      showInfo('In Logcat, click "Only this app".');
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
      invalidateGradleTaskCache(workspaceRoot);
      const result = await runGradleTaskWithResult(workspaceRoot, 'tasks');
      showGradleOutput('tasks', result, workspaceRoot);
      if (result.exitCode === 0) {
        invalidateGradleTaskCache(workspaceRoot);
      }
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
      await evaluateConfigPolicy(workspaceFolder.uri.fsPath);
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
    vscode.commands.registerCommand('android-toolkit.openRunPanel', async () => {
      await withCommandBudget('android-toolkit.openRunPanel', async () => {
      const fixSuggestionsForGradle = (): RunFixSuggestion[] => {
        const fixes: RunFixSuggestion[] = [{ id: 'showGradleOutput', label: 'Open Gradle Output' }];
        if (lastGradleErrorTags.includes('taskNotFound') || (lastGradleErrorSummary && /task .* not found|cannot locate tasks/i.test(lastGradleErrorSummary))) {
          fixes.unshift({ id: 'selectVariant', label: 'Select Variant' });
        }
        if (
          lastGradleErrorTags.includes('sdkMissing') ||
          lastGradleErrorTags.includes('buildToolsVersion') ||
          (lastGradleErrorSummary && /sdk|build tools|ndk|platform/i.test(lastGradleErrorSummary))
        ) {
          fixes.unshift({ id: 'openSdkDocs', label: 'Open SDK Setup Guide' });
          fixes.unshift({ id: 'runGradleDoctor', label: 'Run Gradle Doctor' });
        }
        if (
          lastGradleErrorTags.includes('jdkMismatch') ||
          lastGradleErrorTags.includes('kotlinRuntime') ||
          (lastGradleErrorSummary && /java|jvm|kotlin language server|25\\.0\\.1|jdk/i.test(lastGradleErrorSummary))
        ) {
          fixes.unshift({ id: 'setJdk21Path', label: 'Use JDK 21 Path' });
        }
        if (lastGradleErrorTags.includes('signingConfig')) {
          fixes.unshift({ id: 'openSigningWizard', label: 'Open Signing Wizard' });
        }
        if (lastGradleErrorTags.includes('dependencyResolution')) {
          fixes.unshift({ id: 'runGradleSync', label: 'Run Gradle Sync' });
        }
        return fixes;
      };
      const enrichRunFailure = (result: RunActionResult): RunActionResult => {
        if (result.success) {
          return result;
        }
        const reason = normalizeErrorReason(lastGradleErrorTags[0]);
        const meta = ERROR_REASON_META[reason];
        const details: string[] = [];
        if (result.gradleError?.trim()) {
          details.push(result.gradleError.trim());
        } else if (lastGradleErrorSummary) {
          details.push(lastGradleErrorSummary);
        }
        details.push(`Reason: ${meta.title}`);
        details.push(`Why: ${meta.why}`);
        details.push(`Suggested: ${meta.autoFix}`);
        const enrichedFixes = result.fixSuggestions && result.fixSuggestions.length > 0
          ? result.fixSuggestions
          : fixSuggestionsForGradle();
        return {
          ...result,
          gradleError: details.join('\n'),
          fixSuggestions: enrichedFixes,
        };
      };
      const finalizeRunResult = (
        action: string,
        result: RunActionResult,
        moduleName: string,
        variant: string,
        deviceId: string,
        durationMs?: number
      ): RunActionResult => {
        const normalized = enrichRunFailure(result);
        reportRunProblem(action, normalized, { moduleName, variant, deviceId });
        if (typeof durationMs === 'number') {
          trackActionMetric(action, normalized, durationMs);
          trackActionReplay(`runPanel:${action.toLowerCase()}`, { moduleName, variant, deviceId }, durationMs, normalized.success, normalized.success ? undefined : normalized.message);
        }
        return normalized;
      };
      const runFlow = async (workspaceRoot: string, moduleName: string, variant: string, deviceId: string): Promise<RunActionResult> => {
        const startedAt = Date.now();
        const opId = operationManager.start(RUN_PANEL_SCOPE);
        const shouldCancel = () => operationManager.isCancelled(RUN_PANEL_SCOPE, opId);
        const preflight = await runPreflightChecks(workspaceRoot, moduleName, variant, deviceId, true);
        if (!preflight.ok) {
          operationManager.finish(RUN_PANEL_SCOPE, opId);
          return finalizeRunResult('Run', {
            success: false,
            message: preflight.message || 'Preflight checks failed',
            fixSuggestions: preflight.fixes,
          }, moduleName, variant, deviceId, Date.now() - startedAt);
        }
        const installGuard = await runGuarded(
          'Install APK',
          () => installVariant(workspaceRoot, moduleName, variant, deviceId),
          { timeoutMs: 240_000, retries: 1, shouldCancel }
        );
        if (!installGuard.ok) {
          operationManager.finish(RUN_PANEL_SCOPE, opId);
          return finalizeRunResult(
            'Run',
            issueToRunResult(installGuard.issue!, 'Install failed.', fixSuggestionsForGradle()),
            moduleName,
            variant,
            deviceId,
            Date.now() - startedAt
          );
        }
        const installed = Boolean(installGuard.value);
        if (!installed) {
          operationManager.finish(RUN_PANEL_SCOPE, opId);
          return finalizeRunResult('Run', {
            success: false,
            message: 'Failed to install app.',
            gradleError: lastGradleErrorSummary,
            errorLocation: lastGradleErrorLocation,
            fixSuggestions: fixSuggestionsForGradle(),
          }, moduleName, variant, deviceId, Date.now() - startedAt);
        }
        const packageName = findApplicationId(workspaceRoot, moduleName);
        if (!packageName) {
          operationManager.finish(RUN_PANEL_SCOPE, opId);
          return finalizeRunResult('Run', {
            success: false,
            message: 'Cannot resolve applicationId from project.',
            fixSuggestions: [{ id: 'showGradleOutput', label: 'Open Gradle Output' }],
          }, moduleName, variant, deviceId, Date.now() - startedAt);
        }
        const startGuard = await runGuarded(
          'Start app',
          () => startAppWithRecovery(deviceId, packageName),
          { timeoutMs: 60_000, retries: 1, shouldCancel }
        );
        if (!startGuard.ok || !startGuard.value) {
          operationManager.finish(RUN_PANEL_SCOPE, opId);
          return finalizeRunResult(
            'Run',
            issueToRunResult(startGuard.issue!, 'Failed to start app.', [{ id: 'showGradleOutput', label: 'Open Gradle Output' }]),
            moduleName,
            variant,
            deviceId,
            Date.now() - startedAt
          );
        }
        const startResult = startGuard.value;
        if (!startResult.success) {
          operationManager.finish(RUN_PANEL_SCOPE, opId);
          return finalizeRunResult('Run', {
            success: false,
            message: startResult.message,
            fixSuggestions: [{ id: 'showGradleOutput', label: 'Open Gradle Output' }],
          }, moduleName, variant, deviceId, Date.now() - startedAt);
        }
        await appendRunHistory({ moduleName, variant, deviceId });
        operationManager.finish(RUN_PANEL_SCOPE, opId);
        return finalizeRunResult('Run', { success: true, message: `App started on ${deviceId}` }, moduleName, variant, deviceId, Date.now() - startedAt);
      };
      RunPanel.createOrShow({
        getDevices: async () => {
          const online = await listOnlineDevicesCached();
          const selectedModule = await getSelectedModule();
          const selectedVariant = selectedModule ? await getSelectedVariant(selectedModule) : undefined;
          const selectedDevice = await getSelectedDeviceId();
          const preferred = pickSmartDevice(online, selectedModule, selectedVariant, selectedDevice);
          const sorted = [...online].sort((a, b) => {
            if (a.id === preferred) return -1;
            if (b.id === preferred) return 1;
            if (a.type === 'emulator' && b.type !== 'emulator') return -1;
            if (b.type === 'emulator' && a.type !== 'emulator') return 1;
            return a.id.localeCompare(b.id);
          });
          return sorted.map(d => ({
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
          return findApplicationModulesCached(workspaceFolder.uri.fsPath);
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
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
          if (workspaceFolder) {
            await evaluateConfigPolicy(workspaceFolder.uri.fsPath);
          }
        },
        setFlavor: async (moduleName: string, flavor: string) => {
          await setSelectedFlavor(moduleName, flavor);
        },
        setBuildType: async (moduleName: string, buildType: string) => {
          await setSelectedBuildType(moduleName, buildType);
        },
        build: async (moduleName: string) => {
          const startedAt = Date.now();
          const opId = operationManager.start(RUN_PANEL_SCOPE);
          const shouldCancel = () => operationManager.isCancelled(RUN_PANEL_SCOPE, opId);
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
          if (!workspaceFolder) {
            operationManager.finish(RUN_PANEL_SCOPE, opId);
            return finalizeRunResult('Build', { success: false, message: 'No workspace folder open' }, moduleName, '', '', Date.now() - startedAt);
          }
          const variant = await getSelectedVariant(moduleName);
          const preflight = await runPreflightChecks(workspaceFolder.uri.fsPath, moduleName, variant, '', false);
          if (!preflight.ok) {
            operationManager.finish(RUN_PANEL_SCOPE, opId);
            return finalizeRunResult('Build', {
              success: false,
              message: preflight.message || 'Preflight checks failed',
              fixSuggestions: preflight.fixes,
            }, moduleName, variant, '', Date.now() - startedAt);
          }
          const buildGuard = await runGuarded(
            'Build variant',
            () => buildVariant(workspaceFolder.uri.fsPath, moduleName, variant),
            { timeoutMs: 240_000, retries: 1, shouldCancel }
          );
          if (!buildGuard.ok) {
            operationManager.finish(RUN_PANEL_SCOPE, opId);
            return finalizeRunResult('Build', issueToRunResult(buildGuard.issue!, 'Build failed.', fixSuggestionsForGradle()), moduleName, variant, '', Date.now() - startedAt);
          }
          const ok = Boolean(buildGuard.value);
          operationManager.finish(RUN_PANEL_SCOPE, opId);
          return finalizeRunResult('Build', {
            success: ok,
            message: ok ? 'Build completed' : 'Build failed',
            gradleError: ok ? undefined : lastGradleErrorSummary,
            errorLocation: ok ? undefined : lastGradleErrorLocation,
            fixSuggestions: ok ? undefined : fixSuggestionsForGradle(),
          }, moduleName, variant, '', Date.now() - startedAt);
        },
        install: async (moduleName: string, deviceId: string) => {
          const startedAt = Date.now();
          const opId = operationManager.start(RUN_PANEL_SCOPE);
          const shouldCancel = () => operationManager.isCancelled(RUN_PANEL_SCOPE, opId);
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
          if (!workspaceFolder) {
            operationManager.finish(RUN_PANEL_SCOPE, opId);
            return finalizeRunResult('Install', { success: false, message: 'No workspace folder open' }, moduleName, '', deviceId, Date.now() - startedAt);
          }
          if (!deviceId) {
            operationManager.finish(RUN_PANEL_SCOPE, opId);
            return finalizeRunResult('Install', { success: false, message: 'Select a device', fixSuggestions: [{ id: 'selectDevice', label: 'Select Device' }] }, moduleName, '', deviceId, Date.now() - startedAt);
          }
          const variant = await getSelectedVariant(moduleName);
          const preflight = await runPreflightChecks(workspaceFolder.uri.fsPath, moduleName, variant, deviceId, true);
          if (!preflight.ok) {
            operationManager.finish(RUN_PANEL_SCOPE, opId);
            return finalizeRunResult('Install', {
              success: false,
              message: preflight.message || 'Preflight checks failed',
              fixSuggestions: preflight.fixes,
            }, moduleName, variant, deviceId, Date.now() - startedAt);
          }
          const installGuard = await runGuarded(
            'Install variant',
            () => installVariant(workspaceFolder.uri.fsPath, moduleName, variant, deviceId),
            { timeoutMs: 240_000, retries: 1, shouldCancel }
          );
          if (!installGuard.ok) {
            operationManager.finish(RUN_PANEL_SCOPE, opId);
            return finalizeRunResult('Install', issueToRunResult(installGuard.issue!, 'Install failed.', fixSuggestionsForGradle()), moduleName, variant, deviceId, Date.now() - startedAt);
          }
          const ok = Boolean(installGuard.value);
          operationManager.finish(RUN_PANEL_SCOPE, opId);
          return finalizeRunResult('Install', {
            success: ok,
            message: ok ? 'Install completed' : 'Install failed',
            gradleError: ok ? undefined : lastGradleErrorSummary,
            errorLocation: ok ? undefined : lastGradleErrorLocation,
            fixSuggestions: ok ? undefined : fixSuggestionsForGradle(),
          }, moduleName, variant, deviceId, Date.now() - startedAt);
        },
        run: async (moduleName: string, deviceId: string) => {
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
          if (!workspaceFolder) {
            return { success: false, message: 'No workspace folder open' };
          }
          if (!deviceId) {
            return { success: false, message: 'Select a device', fixSuggestions: [{ id: 'selectDevice', label: 'Select Device' }] };
          }
          const variant = await getSelectedVariant(moduleName);
          return runFlow(workspaceFolder.uri.fsPath, moduleName, variant, deviceId);
        },
        stop: async (moduleName: string, deviceId: string) => {
          operationManager.cancel(RUN_PANEL_SCOPE);
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
          if (!workspaceFolder) {
            return { success: false, message: 'No workspace folder open' };
          }
          if (!deviceId) {
            return { success: false, message: 'Select a device', fixSuggestions: [{ id: 'selectDevice', label: 'Select Device' }] };
          }
          const packageName = findApplicationId(workspaceFolder.uri.fsPath, moduleName);
          if (!packageName) {
            return { success: false, message: 'Cannot resolve applicationId from project.' };
          }
          const stopGuard = await runGuarded(
            'Stop app',
            () => AdbService.forceStopApp(deviceId, packageName),
            { timeoutMs: 60_000, retries: 1 }
          );
          if (!stopGuard.ok || !stopGuard.value) {
            return issueToRunResult(stopGuard.issue!, 'Failed to stop app.', [{ id: 'showGradleOutput', label: 'Open Gradle Output' }]);
          }
          const result = stopGuard.value;
          return {
            success: result.success,
            message: result.success ? 'App stopped.' : result.message,
          };
        },
        clean: async () => {
          const opId = operationManager.start(RUN_PANEL_SCOPE);
          const shouldCancel = () => operationManager.isCancelled(RUN_PANEL_SCOPE, opId);
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
          if (!workspaceFolder) {
            operationManager.finish(RUN_PANEL_SCOPE, opId);
            return finalizeRunResult('Clean', { success: false, message: 'No workspace folder open' }, '', '', '');
          }
          invalidateGradleTaskCache(workspaceFolder.uri.fsPath);
          const cleanGuard = await runGuarded(
            'Gradle clean',
            () => runGradleTaskWithResult(workspaceFolder.uri.fsPath, 'clean'),
            { timeoutMs: 240_000, retries: 1, shouldCancel }
          );
          if (!cleanGuard.ok || !cleanGuard.value) {
            operationManager.finish(RUN_PANEL_SCOPE, opId);
            return finalizeRunResult('Clean', issueToRunResult(cleanGuard.issue!, 'Clean failed.', fixSuggestionsForGradle()), '', '', '');
          }
          const result = cleanGuard.value;
          showGradleOutput('clean', result, workspaceFolder.uri.fsPath);
          if (result.exitCode === 0) {
            invalidateGradleTaskCache(workspaceFolder.uri.fsPath);
            lastGradleErrorSummary = undefined;
            lastGradleErrorLocation = undefined;
            lastGradleErrorTags = [];
          } else {
            const raw = result.stderr || result.stdout || '';
            lastGradleErrorSummary = summarizeGradleError(raw);
            lastGradleErrorLocation = extractErrorLocation(raw, workspaceFolder.uri.fsPath);
          }
          operationManager.finish(RUN_PANEL_SCOPE, opId);
          return finalizeRunResult('Clean', {
            success: result.exitCode === 0,
            message: result.exitCode === 0 ? 'Clean completed' : 'Clean failed',
            gradleError: result.exitCode === 0 ? undefined : lastGradleErrorSummary,
            errorLocation: result.exitCode === 0 ? undefined : lastGradleErrorLocation,
            fixSuggestions: result.exitCode === 0 ? undefined : fixSuggestionsForGradle(),
          }, '', '', '');
        },
        getHistory: async () => {
          return getRunHistory();
        },
        rerunHistory: async (historyId: string) => {
          const entry = getRunHistory().find(h => h.id === historyId);
          if (!entry) {
            return { success: false, message: 'Run history item not found.' };
          }
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
          if (!workspaceFolder) {
            return { success: false, message: 'No workspace folder open' };
          }
          await setSelectedVariant(entry.moduleName, entry.variant);
          return runFlow(workspaceFolder.uri.fsPath, entry.moduleName, entry.variant, entry.deviceId);
        },
        runPreset: async (presetId: string, moduleName: string) => {
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
          if (!workspaceFolder) {
            return { success: false, message: 'No workspace folder open' };
          }
          const onlineDevices = (await listDevicesDetailed()).filter(d => d.status === 'online');
          if (onlineDevices.length === 0) {
            return {
              success: false,
              message: 'No online devices found.',
              fixSuggestions: [{ id: 'selectDevice', label: 'Select Device' }],
            };
          }
          if (presetId === 'debug-emulator') {
            const emu = onlineDevices.find(d => d.type === 'emulator');
            if (!emu) {
              return { success: false, message: 'No running emulator found.' };
            }
            await setSelectedVariant(moduleName, 'Debug');
            return runFlow(workspaceFolder.uri.fsPath, moduleName, 'Debug', emu.id);
          }
          if (presetId === 'release-device') {
            const physical = onlineDevices.find(d => d.type !== 'emulator');
            if (!physical) {
              return { success: false, message: 'No physical device found.' };
            }
            await setSelectedVariant(moduleName, 'Release');
            return runFlow(workspaceFolder.uri.fsPath, moduleName, 'Release', physical.id);
          }
          return { success: false, message: `Unknown preset: ${presetId}` };
        },
        applyFix: async (fixId: string, _moduleName: string, _deviceId: string) => {
          return applyRunFixTracked(fixId);
        },
        getHealth: async () => {
          const health = await getLanguageHealthStatus();
          if (!health.hasJavaExtension || !health.hasKotlinExtension) {
            const missing = [
              !health.hasJavaExtension ? 'Java extension' : undefined,
              !health.hasKotlinExtension ? 'Kotlin extension' : undefined,
            ].filter(Boolean).join(', ');
            return { state: 'error' as const, message: `Runtime health: missing ${missing}` };
          }
          if (health.kotlinRiskOnJava25) {
            return {
              state: 'warning' as const,
              message: `Runtime health: Java ${health.javaVersion || health.javaMajor} may break Kotlin LS. Prefer JDK 21.`,
            };
          }
          return {
            state: 'ok' as const,
            message: `Runtime health: Java ${health.javaVersion || health.javaMajor || 'unknown'} + Kotlin extension OK`,
          };
        },
        quickAction: async (actionId: string, _moduleName: string, _deviceId: string) => {
          if (actionId === 'run-selected') {
            await vscode.commands.executeCommand('android-toolkit.runSelectedAlias');
            return { success: true, message: 'Run selected executed.' };
          }
          if (actionId === 'stop-selected') {
            await vscode.commands.executeCommand('android-toolkit.stopSelectedAlias');
            return { success: true, message: 'Stop selected executed.' };
          }
          if (actionId === 'logcat-this-app') {
            await vscode.commands.executeCommand('android-toolkit.logcatThisApp');
            return { success: true, message: 'Logcat quick action opened.' };
          }
          if (actionId === 'health-wizard') {
            await vscode.commands.executeCommand('android-toolkit.firstRunHealthWizard');
            return { success: true, message: 'Health wizard opened.' };
          }
          return { success: false, message: `Unknown quick action: ${actionId}` };
        },
      });
      });
    }),
    vscode.commands.registerCommand('android-toolkit.showGradleOutput', () => {
      revealGradleOutput();
    }),
    vscode.commands.registerCommand('android-toolkit.runGradleTask', async (task) => {
      await runGradleTaskCommand(task);
    }),
    vscode.commands.registerCommand('android-toolkit.refreshGradleTasks', () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      invalidateGradleTaskCache(workspaceRoot);
      gradleTasksProvider.refresh();
    }),
    vscode.commands.registerCommand('android-toolkit.clearProblems', () => {
      problemsProvider?.clear();
    }),
    vscode.commands.registerCommand('android-toolkit.problemApplyFix', async (item?: AndroidProblemTreeItem) => {
      const fixId = item?.entry?.fixes?.[0]?.id;
      if (!fixId) {
        return;
      }
      await applyRunFixTracked(fixId);
    }),
    vscode.commands.registerCommand('android-toolkit.problemOpenLocation', async (item?: AndroidProblemTreeItem) => {
      const loc = item?.entry?.location;
      if (!loc?.file) {
        return;
      }
      try {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(loc.file));
        const editor = await vscode.window.showTextDocument(doc, { preview: false });
        const line = Math.max(0, (loc.line || 1) - 1);
        const col = Math.max(0, (loc.column || 1) - 1);
        const pos = new vscode.Position(line, col);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
      } catch {
        showWarning('Unable to open problem location.');
      }
    }),
    vscode.commands.registerCommand('android-toolkit.openAppInspection', () => {
      const { AppInspectionPanel } = lazyLoad<typeof import('./inspection/appInspectionPanel')>('./inspection/appInspectionPanel');
      AppInspectionPanel.createOrShow();
    }),
    vscode.commands.registerCommand('android-toolkit.openDatabaseInspector', () => {
      const { DatabaseInspectorPanel } = lazyLoad<typeof import('./database/databaseInspectorPanel')>('./database/databaseInspectorPanel');
      DatabaseInspectorPanel.createOrShow();
    }),
    vscode.commands.registerCommand('android-toolkit.openDebugPanel', () => {
      const { DebugPanel } = lazyLoad<typeof import('./debug/debugPanel')>('./debug/debugPanel');
      DebugPanel.createOrShow();
    }),
    vscode.commands.registerCommand('android-toolkit.signingWizard', () => {
      runSigningWizard();
    }),
    vscode.commands.registerCommand('android-toolkit.releaseFlow', () => {
      runReleaseFlowWizard();
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
        const { ApkAnalyzerPanel } = lazyLoad<typeof import('./apk/apkAnalyzerPanel')>('./apk/apkAnalyzerPanel');
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
          const { ApkAnalyzerPanel } = lazyLoad<typeof import('./apk/apkAnalyzerPanel')>('./apk/apkAnalyzerPanel');
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
      const { ApkComparePanel } = lazyLoad<typeof import('./apk/apkComparePanel')>('./apk/apkComparePanel');
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
      runRunConfiguration('run');
    }),
    vscode.commands.registerCommand('android-toolkit.runDebugConfiguration', () => {
      runRunConfiguration('debug');
    }),
    vscode.commands.registerCommand('android-toolkit.deleteRunConfiguration', () => {
      deleteRunConfiguration();
    }),
    vscode.commands.registerCommand('android-toolkit.duplicateRunConfiguration', () => {
      duplicateRunConfiguration();
    }),
    vscode.commands.registerCommand('android-toolkit.openRunProfilesV2', () => {
      openRunProfilesV2();
    }),
    vscode.commands.registerCommand('android-toolkit.openAdbShell', () => {
      openAdbShell();
    }),
    vscode.commands.registerCommand('android-toolkit.openLayoutPreview', () => {
      openLayoutPreview();
    }),
    vscode.commands.registerCommand('android-toolkit.openXmlLivePreview', async () => {
      await xmlLivePreviewController.openOnceFromActiveEditor();
    }),
    vscode.commands.registerCommand('android-toolkit.toggleXmlLivePreview', async () => {
      await xmlLivePreviewController.toggle();
    }),
    vscode.commands.registerCommand('android-toolkit.generateConstraintSetSnippet', async () => {
      await generateConstraintSetSnippetFromSelection();
    }),
    vscode.commands.registerCommand('android-toolkit.lintCurrentLayoutXml', () => {
      xmlLintController.lintActiveEditor();
    }),
    vscode.commands.registerCommand('android-toolkit.extractStringResourceFromXml', async (uriString?: string, range?: vscode.Range) => {
      await extractStringResourceFromXml(uriString, range);
      const activeDoc = vscode.window.activeTextEditor?.document;
      if (activeDoc) {
        xmlLintController.lintDocument(activeDoc);
      }
    }),
    vscode.commands.registerCommand('android-toolkit.extractAllHardcodedStringsFromLayout', async (uriString?: string) => {
      await extractAllHardcodedStringsFromLayout(uriString);
      const activeDoc = vscode.window.activeTextEditor?.document;
      if (activeDoc) {
        xmlLintController.lintDocument(activeDoc);
      }
    }),
    vscode.commands.registerCommand('android-toolkit.fixAllLayoutWarnings', async (uriString?: string) => {
      await fixAllLayoutWarningsInFile(uriString);
      const activeDoc = vscode.window.activeTextEditor?.document;
      if (activeDoc) {
        xmlLintController.lintDocument(activeDoc);
      }
    }),
    vscode.commands.registerCommand('android-toolkit.xmlFixMissingContentDescription', async (uriString?: string, range?: vscode.Range) => {
      await fixMissingContentDescription(uriString, range);
      const activeDoc = vscode.window.activeTextEditor?.document;
      if (activeDoc) {
        xmlLintController.lintDocument(activeDoc);
      }
    }),
    vscode.commands.registerCommand('android-toolkit.xmlFixMissingConstraints', async (uriString?: string, range?: vscode.Range) => {
      await fixMissingConstraints(uriString, range);
      const activeDoc = vscode.window.activeTextEditor?.document;
      if (activeDoc) {
        xmlLintController.lintDocument(activeDoc);
      }
    }),
    vscode.commands.registerCommand('android-toolkit.openLayoutEditor', () => {
      openLayoutEditor();
    }),
    vscode.commands.registerCommand('android-toolkit.openLayoutInspector', () => {
      const { LayoutInspectorPanel } = lazyLoad<typeof import('./layout/layoutInspectorPanel')>('./layout/layoutInspectorPanel');
      LayoutInspectorPanel.createOrShow();
    }),
    vscode.commands.registerCommand('android-toolkit.openQuickActions', () => {
      const { QuickActionsPanel } = lazyLoad<typeof import('./deviceActions/quickActionsPanel')>('./deviceActions/quickActionsPanel');
      QuickActionsPanel.createOrShow();
    }),
    vscode.commands.registerCommand('android-toolkit.openMappingViewer', () => {
      const { MappingViewerPanel } = lazyLoad<typeof import('./mapping/mappingViewerPanel')>('./mapping/mappingViewerPanel');
      MappingViewerPanel.createOrShow();
    }),
    vscode.commands.registerCommand('android-toolkit.openPerformanceMonitor', () => {
      const { PerformanceMonitorPanel } = lazyLoad<typeof import('./monitor/performanceMonitorPanel')>('./monitor/performanceMonitorPanel');
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
    vscode.commands.registerCommand('android-toolkit.openGradleIntelligence', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        showError('No workspace folder open.');
        return;
      }
      const { GradleIntelligencePanel } = lazyLoad<typeof import('./gradle/gradleIntelligencePanel')>('./gradle/gradleIntelligencePanel');
      GradleIntelligencePanel.createOrShow(workspaceRoot);
    }),
    vscode.commands.registerCommand('android-toolkit.openComposePreview', () => {
      const { ComposePreviewPanel } = lazyLoad<typeof import('./compose/composePreviewPanel')>('./compose/composePreviewPanel');
      ComposePreviewPanel.createOrShow();
    }),
    vscode.commands.registerCommand('android-toolkit.openComposeLivePreview', () => {
      const { ComposeLivePreviewPanel } = lazyLoad<typeof import('./compose/composeLivePreviewPanel')>('./compose/composeLivePreviewPanel');
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
      const { TestRunnerPanel } = lazyLoad<typeof import('./tests/testRunnerPanel')>('./tests/testRunnerPanel');
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
      const { MatrixDashboardPanel } = lazyLoad<typeof import('./matrix/matrixDashboardPanel')>('./matrix/matrixDashboardPanel');
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
  recordStartupPhase('commands:register', tCommands, activationStartedAt);
  void startSession(context);
  logPerf('activate:commandsRegistered', Date.now() - activationStartedAt);
  checkLanguageExtensions(context).catch(() => {});
  setTimeout(() => {
    openOnboardingV2Panel(false).catch(() => {});
  }, 1200);
  setTimeout(() => {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
      evaluateConfigPolicy(workspaceRoot).catch(() => {});
    }
  }, 1600);
  const deferMonitoring = vscode.workspace.getConfiguration('androidToolkit').get<boolean>('performance.deferBackgroundMonitoring', true);
  if (!autoSyncEnabled) {
    const scheduleBackground = (): void => {
      backgroundScheduler.register('emulatorStateProbe', 2200, async () => {
        await EmulatorStateService.getInstance().forceCheck();
      });
      backgroundScheduler.start('emulatorStateProbe');
    };
    if (deferMonitoring) {
      setTimeout(scheduleBackground, 2500);
    } else {
      scheduleBackground();
    }
    context.subscriptions.push(new vscode.Disposable(() => backgroundScheduler.stop('emulatorStateProbe')));
  }
  startupProfilerTotalMs = Date.now() - activationStartedAt;
  void persistStartupProfiler();
  logPerf('activate:total', Date.now() - activationStartedAt);
}
export function deactivate(): void {
  endSession(true);
  backgroundScheduler.stopAll();
  const { logcatManager } = require('./logcat/logcatStream');
  logcatManager.stopAll();
  const { debugSession } = require('./debug/debugAdapter');
  debugSession.dispose();
}
