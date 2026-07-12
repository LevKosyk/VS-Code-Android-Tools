import * as vscode from 'vscode';
import { clearSdkCache, detectSdk, isBuildToolsInstalled, isSdkAvailable } from './core/sdkDetector';
import { AndroidToolsError } from './core/errors';
import { checkLanguageExtensions, ensureLanguageMode, getLanguageHealthStatus, setJdk21Path } from './core/languageSupport';
import { invalidateDeviceCache, listDevicesDetailed, listRunningEmulators } from './devices/deviceManager';
import { AndroidDevice } from './devices/types';
import { listAvds, startEmulator, stopEmulatorByName } from './emulators/emulatorManager';
import { listSystemImages, listDeviceProfiles, createAvd } from './emulators/avdCreator';
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
  enableNetwork,
  disableNetwork,
  getNetworkStatus,
  toggleNetwork,
  getAvdNameForDevice,
  listSnapshots,
  saveSnapshot,
  loadSnapshot,
} from './emulatorControl/emulatorCommands';
import { AdbService, EmulatorService, EmulatorStateService, DEFAULT_LOCATION_PRESETS } from './services';
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
import {
  findApplicationId as findApplicationIdRaw,
  findApplicationModules as findApplicationModulesRaw,
  findBuildToolsVersion as findBuildToolsVersionRaw,
  findLatestApk,
} from './core/androidProject';
import { RunPanel } from './run/runPanel';
import { GradleTasksProvider, runGradleTaskCommand } from './gradle/gradleTasksProvider';
import { invalidateGradleTaskCache, listGradleTasks, runGradleTaskWithResult } from './gradle/gradleService';
import { loadAndroidGradleModel } from './gradle/gradleModel';
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
import { insertValuesTemplate, validateResources } from './projectView/resourceTools';
import { openResourceInspector, openResourceByQuery } from './projectView/resourceInspector';
import { openResourceRefactorTools, bulkMoveResources, bulkRenameResources } from './projectView/resourceRefactorTools';
import { jumpToNavigationArgument, jumpToNavigationDestination, previewNavigationGraphSvg } from './projectView/navigationTools';
import { runProjectBlueprintTemplatesWizard } from './projectView/projectBlueprintTemplates';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import JSZip from 'jszip';
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
import { runReleaseGateWizardPlus } from './release/releaseGateWizardPlus';
import { checkProjectHealth } from './core/projectHealth';
import { showGradleOutput, revealGradleOutput, getLastGradleOutputSnapshot } from './gradle/gradleOutput';
import { inspectBuildCache } from './gradle/buildCacheInspector';
import { runGradleDoctor } from './gradle/gradleDoctor';
import { runDependencyInsight } from './gradle/dependencyInsight';
import { issueToMultiline, runGuarded, ToolkitIssue } from './core/stability';
import { operationManager } from './core/operations';
import { execCommand } from './core/cli';
import { registerCommand } from './core/commandRegistry';
import { registerAndroidViews } from './activation/androidViews';
import { logPerf } from './core/perf';
import { BackgroundScheduler } from './core/backgroundScheduler';
import type { StartupProfilerEntry } from './ui/startupProfilerPanel';
import { readProjectConfig } from './team/projectConfigStore';
import { AndroidProblemsProvider, AndroidProblemTreeItem } from './problems/problemsProvider';
import { buildRunFailureReport, classifyGradleFailure, GradleFailureTag, RunFailureRecord } from './run/runDiagnostics';
import { pickSmartDeviceId } from './run/smartDevice';
import { waitForAppPid } from './run/appProcess';
import { RunPipelineMachine } from './run/runPipelineMachine';
import { pairWirelessDevice, connectWirelessDevice, disconnectWirelessDevice } from './devices/wirelessAdb';
import { configuredScrcpyPath, isScrcpyAvailable, launchScrcpy } from './devices/scrcpy';
import { recoverAdbDevice } from './devices/adbRecovery';
import { ERROR_REASON_META, normalizeErrorReason } from './run/errorTaxonomy';
import { listManifestLaunchTargets as listManifestLaunchTargetsRaw, LaunchTarget } from './run/launchTargets';
import { buildInstallDiffSummary, readApkSnapshot, readInstalledSnapshot, InstallDiffSnapshot } from './run/installDiff';
import { DeviceFarmPreset, getDeviceFarmPresets, removeDeviceFarmPreset, upsertDeviceFarmPreset } from './matrix/deviceFarmPresets';
import type { OnboardingCheck } from './ui/onboardingPanel';
import type { RunFixAttemptRecord } from './insights/failureInsightsPanel';
import { exportTeamConfig, importTeamConfig } from './team/teamSettings';
import { RunActionMetric, SessionRecord, summarizeSlo } from './insights/sloSummary';
import {
  CommandLatencyRecord,
  enforceCommandSloBudgets,
  summarizeCommandBudgets,
} from './insights/commandBudget';
import {
  SlowPathRecord,
  SlowPathStage,
  summarizeSlowPathFingerprints,
  summarizeSlowPaths,
} from './insights/slowPathMetrics';
import {
  buildIntelligenceHubSnapshot,
  enforcePolicyAsCode,
  renderHeatmapComment,
  renderIntelligenceHubMarkdown,
  replayDeepLinkCase,
  runFocusedPrChecks,
  runPlaybook,
  runSmartMatrixSmoke,
  TeamPlaybook,
  MatrixSmokeResult,
  ReleaseRiskOverride,
} from './insights/intelligenceHub';
let extensionContext: vscode.ExtensionContext | undefined;
let lastGradleErrorSummary: string | undefined;
let lastGradleErrorLocation: { file: string; line: number; column?: number } | undefined;
let lastGradleErrorTags: GradleFailureTag[] = [];
let lastFixCommandHints: string[] = [];
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
const PANEL_LAYOUTS_KEY = 'panelLayouts';
const SLOW_PATH_METRICS_KEY = 'slowPathMetrics';
const CRASH_ANR_RECORDS_KEY = 'crashAnrRecords';
const GRADLE_BOTTLENECK_HISTORY_KEY = 'gradleBottleneckHistory';
const DEVICE_STATE_PROFILES_KEY = 'deviceStateProfiles';
const PERFORMANCE_BASELINE_KEY = 'performanceBaseline';
const TELEMETRY_LOCAL_OPT_IN_KEY = 'telemetryLocalOptIn';
const NEXT_ACTION_RECENTS_KEY = 'nextActionRecents';
const INTELLIGENCE_HUB_SNAPSHOT_KEY = 'intelligenceHub.snapshot';
const INTELLIGENCE_RELEASE_OVERRIDE_KEY = 'intelligenceHub.releaseOverride';
const INTELLIGENCE_MATRIX_LAST_RESULT_KEY = 'intelligenceHub.matrixLastResult';
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
  installDiff?: { title: string; lines: string[] };
}
interface DoctorIssue {
  id: string;
  severity: 'error' | 'warning';
  title: string;
  details: string;
  fixId: string;
  fixLabel: string;
  autoFixSafe?: boolean;
}
interface SmartRunRecommendation {
  label: string;
  actionId: string;
}
interface SmartRunHealth {
  state: 'ok' | 'warning' | 'error';
  message: string;
  score: number;
  recommendations: SmartRunRecommendation[];
}
interface CrashAnrRecord {
  id: string;
  type: 'crash' | 'anr';
  signature: string;
  message: string;
  moduleName: string;
  deviceId: string;
  sessionId: string;
  source: string;
  timestamp: number;
}
interface CrashLikelyFix {
  label: string;
  commandId?: string;
  docUrl?: string;
}
interface GradleTaskHotspot {
  task: string;
  durationMs: number;
}
interface NamedCountHotspot {
  name: string;
  count: number;
}
interface GradleBottleneckRecord {
  id: string;
  task: string;
  success: boolean;
  timestamp: number;
  totalDurationMs: number;
  slowTasks: GradleTaskHotspot[];
  pluginHotspots: NamedCountHotspot[];
  dependencyHotspots: NamedCountHotspot[];
}
interface DeviceStateProfile {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  deviceId: string;
  moduleName?: string;
  packageName?: string;
  network: 'enabled' | 'disabled' | 'unknown';
  batteryLevel: number;
  batteryStatus: 'unknown' | 'charging' | 'discharging' | 'not-charging' | 'full';
  locale: string;
  animations: {
    window: string;
    transition: string;
    animator: string;
  };
  grantedPermissions: string[];
}
interface PerformanceGuardrailBaseline {
  capturedAt: number;
  startupTotalMs: number;
  commandBudgetSummary: ReturnType<typeof summarizeCommandBudgets>;
}
interface TeamPolicyDriftItem {
  id: string;
  title: string;
  expected: string;
  actual: string;
  alignAction: () => Promise<void>;
}
interface NextActionItem {
  id: string;
  label: string;
  detail: string;
  hotkey?: string;
  category?: 'recommended' | 'recent' | 'team';
}
interface NextActionModel {
  recommended: NextActionItem;
  summary: {
    state: 'ok' | 'warning' | 'error';
    headline: string;
    detail: string;
  };
  recents: NextActionItem[];
  teamRecommended: NextActionItem[];
}
interface ModuleRunRule {
  moduleName: string;
  defaultDeviceId?: string;
  defaultVariant?: string;
  preRunPipeline?: { clean: boolean; assemble: boolean; install: boolean; run: boolean };
}
interface SessionTimelineEntry {
  id: string;
  at: number;
  action: string;
  stage: string;
  status: 'running' | 'success' | 'failed';
  moduleName: string;
  variant: string;
  deviceId: string;
  durationMs?: number;
  message?: string;
}
let problemsProvider: AndroidProblemsProvider | undefined;
const runFixAttempts: RunFixAttemptRecord[] = [];
const runActionMetrics: RunActionMetric[] = [];
const commandLatencyMetrics: CommandLatencyRecord[] = [];
const sessionHistory: SessionRecord[] = [];
const sessionTimeline: SessionTimelineEntry[] = [];
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
const slowPathMetrics: SlowPathRecord[] = [];
const crashAnrRecords: CrashAnrRecord[] = [];
const policyWarningsShown = new Set<string>();
const ACTIVATION_BUDGET_MS = 1800;
const TOP_SLOW_PATH_LIMIT = 12;
const HEAVY_COMMAND_SLOW_PATH_IDS = new Set<string>([
  'android-toolkit.openRunPanel',
  'android-toolkit.runSelectedAlias',
  'android-toolkit.runAppOnTargetSelected',
  'android-toolkit.runAppOnEmulator',
  'android-toolkit.runAppOnDevice',
  'android-toolkit.gradleSync',
  'android-toolkit.runLaunchProfile',
  'android-toolkit.analyzeApk',
  'android-toolkit.compareApk',
]);
const CI_PERF_SNAPSHOT_RELATIVE_PATH = '.artifacts/ci-perf-snapshot.json';
let diagnosticsDataLoaded = false;
const RUN_ACTION_IDS = ['build', 'install', 'run', 'stop', 'clean', 'releaseGate'] as const;
const PREFLIGHT_CACHE_TTL_MS = 2500;
const preflightCache = new Map<string, { at: number; result: { ok: boolean; message?: string; fixes?: RunFixSuggestion[]; warnings?: string[] } }>();
const preflightInFlight = new Map<string, Promise<{ ok: boolean; message?: string; fixes?: RunFixSuggestion[]; warnings?: string[] }>>();
type RunActionId = typeof RUN_ACTION_IDS[number];
type UiMode = 'beginner' | 'standard' | 'power';
type ConfigProfile = 'solo' | 'team' | 'ci-heavy' | 'release' | 'custom';
type UiFeature = 'matrix' | 'gradleIntelligence' | 'diagnostics';
type ShortcutKey = 'run' | 'stop' | 'rerun' | 'releaseGate' | 'refresh';
type ShortcutProfile = 'default' | 'vim' | 'jetbrains' | 'custom';
const DEFAULT_SHORTCUTS: Record<ShortcutKey, string> = {
  run: 'Enter',
  stop: 'Mod+Shift+S',
  rerun: 'Mod+R',
  releaseGate: 'Mod+Shift+G',
  refresh: 'Mod+Shift+R',
};
const SHORTCUT_PROFILES: Record<Exclude<ShortcutProfile, 'custom'>, Record<ShortcutKey, string>> = {
  default: { ...DEFAULT_SHORTCUTS },
  vim: {
    run: 'Shift+R',
    stop: 'Shift+S',
    rerun: 'Shift+L',
    releaseGate: 'Shift+G',
    refresh: 'Shift+F',
  },
  jetbrains: {
    run: 'Mod+F10',
    stop: 'Mod+F2',
    rerun: 'Shift+F10',
    releaseGate: 'Mod+Shift+R',
    refresh: 'Mod+F5',
  },
};
interface SavedPanelLayout {
  name: string;
  uiMode: UiMode;
  density: 'compact' | 'comfortable';
  runActions: RunActionId[];
  fontSize: number;
}
const DEFAULT_PANEL_LAYOUTS: SavedPanelLayout[] = [
  { name: 'Debug layout', uiMode: 'standard', density: 'compact', runActions: ['build', 'install', 'run', 'stop', 'clean'], fontSize: 12 },
  { name: 'Release layout', uiMode: 'power', density: 'comfortable', runActions: ['build', 'install', 'run', 'releaseGate', 'stop', 'clean'], fontSize: 13 },
  { name: 'QA layout', uiMode: 'standard', density: 'comfortable', runActions: ['install', 'run', 'stop', 'clean'], fontSize: 13 },
];

function getUiMode(): UiMode {
  const value = vscode.workspace.getConfiguration('androidToolkit').get<string>('ui.mode', 'beginner');
  return value === 'beginner' || value === 'power' ? value : 'standard';
}
function getConfigProfile(): ConfigProfile {
  const value = vscode.workspace.getConfiguration('androidToolkit').get<string>('config.profile', 'solo');
  if (value === 'team' || value === 'ci-heavy' || value === 'release' || value === 'custom') {
    return value;
  }
  return 'solo';
}
function getRunActionLayout(): RunActionId[] {
  const value = vscode.workspace.getConfiguration('androidToolkit').get<string[]>('runPanel.actions', [...RUN_ACTION_IDS]);
  const seen = new Set<RunActionId>();
  const normalized: RunActionId[] = [];
  for (const raw of value || []) {
    if ((RUN_ACTION_IDS as readonly string[]).includes(raw) && !seen.has(raw as RunActionId)) {
      const id = raw as RunActionId;
      seen.add(id);
      normalized.push(id);
    }
  }
  if (normalized.length === 0) {
    return [...RUN_ACTION_IDS];
  }
  return normalized;
}
function getKeyboardShortcuts(): Record<ShortcutKey, string> {
  const profile = vscode.workspace.getConfiguration('androidToolkit').get<ShortcutProfile>('keyboard.profile', 'default');
  const base = profile && profile !== 'custom'
    ? SHORTCUT_PROFILES[profile as Exclude<ShortcutProfile, 'custom'>]
    : DEFAULT_SHORTCUTS;
  const value = vscode.workspace.getConfiguration('androidToolkit').get<Record<string, string>>('keyboard.shortcuts', {});
  return {
    run: typeof value?.run === 'string' ? value.run : base.run,
    stop: typeof value?.stop === 'string' ? value.stop : base.stop,
    rerun: typeof value?.rerun === 'string' ? value.rerun : base.rerun,
    releaseGate: typeof value?.releaseGate === 'string' ? value.releaseGate : base.releaseGate,
    refresh: typeof value?.refresh === 'string' ? value.refresh : base.refresh,
  };
}
function isFeatureAllowed(feature: UiFeature): boolean {
  const mode = getUiMode();
  if (mode !== 'beginner') {
    return true;
  }
  return false;
}
function blockedByModeMessage(feature: UiFeature): string {
  const label = feature === 'matrix'
    ? 'Matrix features'
    : feature === 'gradleIntelligence'
      ? 'Gradle Intelligence'
      : 'Diagnostics dashboards';
  return `${label} is hidden in Beginner mode. Switch to Standard or Power User mode.`;
}
async function ensureFeatureAllowed(feature: UiFeature): Promise<boolean> {
  if (isFeatureAllowed(feature)) {
    return true;
  }
  const open = await vscode.window.showInformationMessage(
    blockedByModeMessage(feature),
    'Switch UI Mode'
  );
  if (open === 'Switch UI Mode') {
    await vscode.commands.executeCommand('android-toolkit.setUiMode');
  }
  return false;
}

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
  const gradleError = issueToMultiline(issue);
  const commandHints = extractCommandCandidates([issue.action, issue.details, gradleError].filter(Boolean).join('\n'));
  if (commandHints.length > 0) {
    lastFixCommandHints = commandHints;
  }
  const fixSuggestions = fixes.length > 0 ? [...fixes] : [{ id: 'showGradleOutput', label: 'Open Gradle Output' }];
  if (commandHints.length > 0 && !fixSuggestions.some(fix => fix.id === 'copyFixCommand')) {
    fixSuggestions.unshift({ id: 'copyFixCommand', label: 'Copy Fix Command' });
  }
  return {
    success: false,
    message: fallbackMessage,
    gradleError,
    fixSuggestions,
  };
}
function firstReadableLine(text: string | undefined): string | undefined {
  if (!text) {
    return undefined;
  }
  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  return lines.find(line => !/^(\*|>|at\s)/.test(line)) || lines[0];
}
function extractCommandCandidates(text: string | undefined): string[] {
  if (!text) {
    return [];
  }
  const commands = new Set<string>();
  const backtickRegex = /`([^`]+)`/g;
  let match: RegExpExecArray | null;
  while ((match = backtickRegex.exec(text)) !== null) {
    const candidate = match[1].trim();
    if (candidate.length >= 3 && /[\s/-]|^\.\//.test(candidate)) {
      commands.add(candidate);
    }
  }
  const lineRegex = /(^|\n)\s*(\.\/gradlew[^\n]*|gradle[^\n]*|sdkmanager[^\n]*|adb[^\n]*|export\s+JAVA_HOME=[^\n]*)/g;
  while ((match = lineRegex.exec(text)) !== null) {
    const candidate = match[2].trim();
    if (candidate) {
      commands.add(candidate);
    }
  }
  return Array.from(commands).slice(0, 6);
}
function gradleReasonMetaSummary(): { why?: string; suggestions: string[] } {
  const reason = normalizeErrorReason(lastGradleErrorTags[0]);
  const meta = ERROR_REASON_META[reason];
  const suggestions = [
    meta.autoFix,
    meta.manualFix,
  ].filter(Boolean);
  const why = firstReadableLine(lastGradleErrorSummary) || meta.why;
  return { why, suggestions };
}
function defaultBugSuggestions(): string[] {
  return [
    'Open "Android: Open Run Failure Report" for grouped diagnostics.',
    'Open "Android: Open Action Replay Report" to attach reproduce steps.',
    'Run "Android: Collect Diagnostics Snapshot" before creating a bug report.',
  ];
}
function knownErrorTips(errorText: string): { why?: string; suggestions: string[]; actions: Array<{ label: string; action: () => Promise<void> | void }> } {
  const lower = errorText.toLowerCase();
  if (/android sdk not found|sdk location not found|sdk\.dir is missing/.test(lower)) {
    return {
      why: 'Android SDK path is missing or invalid.',
      suggestions: [
        'Set `ANDROID_SDK_ROOT` or `ANDROID_HOME`.',
        'Set sdk.dir in local.properties for this project.',
        'Run "Android: Gradle Doctor" to validate SDK components.',
      ],
      actions: [
        {
          label: 'Gradle Doctor',
          action: async () => vscode.commands.executeCommand('android-toolkit.gradleDoctor'),
        },
        {
          label: 'SDK Setup Guide',
          action: async () => {
            await vscode.env.openExternal(vscode.Uri.parse('https://developer.android.com/studio#command-tools'));
          },
        },
      ],
    };
  }
  if (/illegalargumentexception:\s*25\.0\.1|what went wrong:\s*25\.0\.1|kotlincoreenvironment|kotlinlanguageserver/.test(lower)) {
    return {
      why: 'JDK runtime mismatch (Java 25 known incompatibility with parts of Kotlin tooling).',
      suggestions: [
        'Run "Android: Use JDK 21 Path".',
        'Reload VS Code window after changing JDK path.',
        'Verify `JAVA_HOME` points to JDK 17 or 21 for this workspace.',
      ],
      actions: [
        {
          label: 'Use JDK 21',
          action: async () => vscode.commands.executeCommand('android-toolkit.setJdk21Path'),
        },
        {
          label: 'Reload Window',
          action: async () => vscode.commands.executeCommand('workbench.action.reloadWindow'),
        },
      ],
    };
  }
  if (/device unauthorized|unauthorized|device offline|no devices|device not found/.test(lower)) {
    return {
      why: 'ADB cannot reach a valid online device.',
      suggestions: [
        'Accept ADB authorization dialog on device if shown.',
        'Start an emulator or reconnect USB device.',
        'Run "Android: Select Device" to refresh selection.',
      ],
      actions: [
        {
          label: 'Select Device',
          action: async () => vscode.commands.executeCommand('android-toolkit.selectDevice'),
        },
        {
          label: 'Start Emulator',
          action: async () => vscode.commands.executeCommand('android-toolkit.startEmulator'),
        },
      ],
    };
  }
  return {
    why: firstReadableLine(errorText),
    suggestions: defaultBugSuggestions(),
    actions: [
      {
        label: 'Run Failure Report',
        action: async () => vscode.commands.executeCommand('android-toolkit.openRunFailureReport'),
      },
      {
        label: 'Collect Diagnostics',
        action: async () => vscode.commands.executeCommand('android-toolkit.collectDiagnosticsSnapshot'),
      },
    ],
  };
}
async function showInstallFailureMessage(): Promise<void> {
  const meta = gradleReasonMetaSummary();
  const commandHints = extractCommandCandidates([lastGradleErrorSummary, ...meta.suggestions].join('\n'));
  await showActionableError({
    title: 'Failed to install app.',
    why: meta.why || 'Install stage failed in Gradle/ADB pipeline.',
    suggestions: [
      ...meta.suggestions,
      'Open Android Gradle Output for raw logs and task context.',
    ],
    fixCommands: commandHints,
    actions: [
      {
        label: 'Open Gradle Output',
        action: async () => vscode.commands.executeCommand('android-toolkit.showGradleOutput'),
      },
      {
        label: 'Gradle Doctor',
        action: async () => vscode.commands.executeCommand('android-toolkit.gradleDoctor'),
      },
    ],
  });
}
function handleError(error: unknown): void {
  if (error instanceof AndroidToolsError) {
    const suggestions = [error.suggestion, ...defaultBugSuggestions()].filter(Boolean) as string[];
    void showActionableError({
      title: error.userMessage || 'Android Tools operation failed.',
      why: firstReadableLine(error.message),
      suggestions,
      fixCommands: extractCommandCandidates([error.message, ...suggestions].join('\n')),
      actions: [
        {
          label: 'Collect Diagnostics',
          action: async () => vscode.commands.executeCommand('android-toolkit.collectDiagnosticsSnapshot'),
        },
        {
          label: 'Run Failure Report',
          action: async () => vscode.commands.executeCommand('android-toolkit.openRunFailureReport'),
        },
      ],
    });
  } else if (error instanceof Error) {
    const tips = knownErrorTips(error.message);
    void showActionableError({
      title: 'Operation failed.',
      why: tips.why,
      suggestions: tips.suggestions,
      fixCommands: extractCommandCandidates([error.message, ...tips.suggestions].join('\n')),
      actions: tips.actions,
    });
  } else {
    void showActionableError({
      title: 'Unexpected error occurred.',
      suggestions: defaultBugSuggestions(),
      actions: [
        {
          label: 'Collect Diagnostics',
          action: async () => vscode.commands.executeCommand('android-toolkit.collectDiagnosticsSnapshot'),
        },
      ],
    });
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
async function persistSlowPathMetrics(): Promise<void> {
  if (!extensionContext) {
    return;
  }
  await extensionContext.globalState.update(SLOW_PATH_METRICS_KEY, slowPathMetrics.slice(0, 2000));
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
    const durationMs = Math.max(0, Date.now() - startedAt);
    commandLatencyMetrics.unshift({
      commandId,
      durationMs,
      success,
      timestamp: Date.now(),
    });
    if (commandId === 'android-toolkit.openRunPanel') {
      trackSlowPathMetric('openRunPanel', durationMs, success);
    }
    if (HEAVY_COMMAND_SLOW_PATH_IDS.has(commandId)) {
      trackSlowPathMetric(`command:${commandId}`, durationMs, success);
    }
    if (commandLatencyMetrics.length > 1000) {
      commandLatencyMetrics.length = 1000;
    }
    void persistCommandLatencyMetrics();
  }
}
function trackSlowPathMetric(stage: SlowPathStage, durationMs: number, success: boolean): void {
  const rounded = Math.max(0, Math.round(durationMs));
  const bucketMs = rounded <= 250 ? 250 : rounded <= 500 ? 500 : rounded <= 1000 ? 1000 : rounded <= 2500 ? 2500 : 5000;
  const fingerprint = `${stage}:${success ? 'ok' : 'fail'}:le${bucketMs}`;
  slowPathMetrics.unshift({
    stage,
    fingerprint,
    durationMs: rounded,
    success,
    timestamp: Date.now(),
  });
  if (slowPathMetrics.length > 2000) {
    slowPathMetrics.length = 2000;
  }
  void persistSlowPathMetrics();
}
async function withSlowPathTrace<T>(
  stage: SlowPathStage,
  action: () => Promise<T>,
  isSuccess?: (value: T) => boolean
): Promise<T> {
  const startedAt = Date.now();
  let success = false;
  try {
    const value = await action();
    success = isSuccess ? Boolean(isSuccess(value)) : true;
    return value;
  } catch (error) {
    success = false;
    throw error;
  } finally {
    trackSlowPathMetric(stage, Date.now() - startedAt, success);
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
  const modules = workspaceRoot ? findApplicationModules(workspaceRoot) : [];

  let sdkOk = false;
  let sdkDetails = 'SDK tools not configured.';
  let devices: AndroidDevice[] = [];
  try {
    const sdk = detectSdk();
    sdkOk = true;
    sdkDetails = `ADB detected in ${sdk.root}.${sdk.emulator ? '' : ' Emulator package is not installed; physical-device workflows remain available.'}`;
    try {
      devices = await listDevicesDetailed();
    } catch (error) {
      sdkOk = false;
      sdkDetails = `ADB could not list devices: ${error instanceof Error ? error.message : 'unknown error'}`;
    }
  } catch (error) {
    sdkDetails = error instanceof Error ? error.message : 'Android SDK / ADB not found.';
  }
  const javaMajor = languageHealth.javaMajor;
  const jdkOk = javaMajor !== undefined && javaMajor >= 17 && javaMajor <= 21;
  const checks: OnboardingCheck[] = [
    {
      id: 'sdk',
      title: 'Android SDK / ADB',
      ok: sdkOk,
      details: sdkDetails,
      fixLabel: sdkOk ? undefined : 'Open SDK Setup Guide',
    },
    {
      id: 'jdk',
      title: 'Java Runtime (Kotlin-safe)',
      ok: jdkOk,
      details: jdkOk
        ? `Java ${languageHealth.javaVersion || javaMajor} is supported.`
        : javaMajor === undefined
          ? 'Java was not found. Android builds require JDK 17-21.'
          : `Java ${languageHealth.javaVersion || javaMajor} is outside the supported JDK 17-21 range.`,
      fixLabel: jdkOk ? undefined : 'Use JDK 21 Path',
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

async function recordRecentNextAction(item: NextActionItem): Promise<void> {
  if (!extensionContext) {
    return;
  }
  const current = extensionContext.globalState.get<NextActionItem[]>(NEXT_ACTION_RECENTS_KEY, []);
  const deduped = [item, ...current.filter(row => row.id !== item.id)].slice(0, 8);
  await extensionContext.globalState.update(NEXT_ACTION_RECENTS_KEY, deduped);
}

function getTeamRecommendedNextActions(): NextActionItem[] {
  return [
    { id: 'openRunPanel', label: 'Open Run Panel', detail: 'Run on current module/device with health hints.', hotkey: 'Enter', category: 'team' },
    { id: 'teamPolicyDrift', label: 'Align Team Policy Drift', detail: 'Keep JDK/run rules/settings consistent across team.', hotkey: 'Alt+A', category: 'team' },
    { id: 'performanceGuardrail', label: 'Run Performance Guardrail', detail: 'Check startup + command latency regressions.', hotkey: 'Mod+Shift+G', category: 'team' },
    { id: 'openMatrixDashboard', label: 'Open Matrix Dashboard', detail: 'Run test matrix and inspect flaky/failure clusters.', category: 'team' },
  ];
}

async function executeNextActionById(actionId: string): Promise<{ success: boolean; message: string }> {
  const actionMap: Record<string, { label: string; detail: string; run: () => Promise<void> }> = {
    openRunPanel: {
      label: 'Open Run Panel',
      detail: 'Open run controls for module/device/variant execution.',
      run: async () => vscode.commands.executeCommand('android-toolkit.openRunPanel'),
    },
    selectDevice: {
      label: 'Select Device',
      detail: 'Choose or re-select a connected device/emulator.',
      run: async () => selectDeviceCommand(),
    },
    startEmulator: {
      label: 'Start Emulator',
      detail: 'Start an AVD to get an online target.',
      run: async () => vscode.commands.executeCommand('android-toolkit.startEmulator'),
    },
    openOnboarding: {
      label: 'Open Onboarding',
      detail: 'Apply guided setup fixes in one place.',
      run: async () => openOnboardingV2Panel(true),
    },
    guidedFirstRun: {
      label: 'Guided First Successful Run',
      detail: 'Follow one next step at a time to first successful run.',
      run: async () => vscode.commands.executeCommand('android-toolkit.guidedFirstRunSuccessPath'),
    },
    teamPolicyDrift: {
      label: 'Align Team Policy Drift',
      detail: 'Review and align config drift with team profile.',
      run: async () => vscode.commands.executeCommand('android-toolkit.teamPolicyDriftReport'),
    },
    performanceGuardrail: {
      label: 'Run Performance Guardrail',
      detail: 'Compare startup and command latency against baseline.',
      run: async () => vscode.commands.executeCommand('android-toolkit.performanceRegressionGuardrail'),
    },
    openMatrixDashboard: {
      label: 'Open Matrix Dashboard',
      detail: 'Execute matrix runs and inspect flaky behavior.',
      run: async () => vscode.commands.executeCommand('android-toolkit.openMatrixDashboard'),
    },
    releaseQualityGate: {
      label: 'Run Release Quality Gate',
      detail: 'Run release checks and quality gate workflow.',
      run: async () => vscode.commands.executeCommand('android-toolkit.releaseQualityGate'),
    },
  };

  const target = actionMap[actionId];
  if (!target) {
    return { success: false, message: `Unknown next action: ${actionId}` };
  }
  await target.run();
  await recordRecentNextAction({ id: actionId, label: target.label, detail: target.detail, category: 'recent' });
  return { success: true, message: target.label };
}

async function buildNextActionModel(): Promise<NextActionModel> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const recent = extensionContext?.globalState.get<NextActionItem[]>(NEXT_ACTION_RECENTS_KEY, []).slice(0, 5) || [];
  const teamRecommended = getTeamRecommendedNextActions();

  if (!workspaceRoot) {
    return {
      recommended: { id: 'openOnboarding', label: 'Open Onboarding', detail: 'Start from guided setup checks.', hotkey: 'Mod+Enter', category: 'recommended' },
      summary: {
        state: 'error',
        headline: 'No workspace is open',
        detail: 'Open a project folder first, then continue with onboarding.',
      },
      recents: recent,
      teamRecommended,
    };
  }

  const checks = await getOnboardingV2Checks();
  const failingCheck = checks.find(item => !item.ok);
  if (failingCheck) {
    const mapping: Record<string, NextActionItem> = {
      sdk: { id: 'openOnboarding', label: 'Fix SDK Setup', detail: 'Open onboarding and apply SDK setup guidance.', hotkey: 'Alt+N', category: 'recommended' },
      jdk: { id: 'openOnboarding', label: 'Fix Java Runtime', detail: 'Use onboarding to align to JDK 21-safe setup.', hotkey: 'Alt+N', category: 'recommended' },
      modules: { id: 'openOnboarding', label: 'Create/Import Android Module', detail: 'Open onboarding and create/import project modules.', hotkey: 'Alt+N', category: 'recommended' },
      device: { id: 'startEmulator', label: 'Start Emulator', detail: 'Bring an online target up first.', hotkey: 'Alt+D', category: 'recommended' },
    };
    const recommended = mapping[failingCheck.id] || { id: 'guidedFirstRun', label: 'Guided First Successful Run', detail: 'Follow one next step to complete setup.', hotkey: 'Mod+Enter', category: 'recommended' };
    return {
      recommended,
      summary: {
        state: 'warning',
        headline: 'Setup needs attention',
        detail: `First blocker: ${failingCheck.title}.`,
      },
      recents: recent,
      teamRecommended,
    };
  }

  const modules = findApplicationModules(workspaceRoot);
  if (modules.length === 0) {
    return {
      recommended: { id: 'openOnboarding', label: 'Create Android Project', detail: 'No Android module found in this workspace.', category: 'recommended' },
      summary: {
        state: 'error',
        headline: 'No Android module found',
        detail: 'Use onboarding to create/import an Android project.',
      },
      recents: recent,
      teamRecommended,
    };
  }

  const onlineDevices = (await listDevicesDetailed()).filter(item => item.status === 'online');
  if (onlineDevices.length === 0) {
    return {
      recommended: { id: 'startEmulator', label: 'Start Emulator', detail: 'No online device detected.', hotkey: 'Alt+D', category: 'recommended' },
      summary: {
        state: 'warning',
        headline: 'No online device',
        detail: 'Start an emulator or connect a physical device.',
      },
      recents: recent,
      teamRecommended,
    };
  }

  const drifts = await collectTeamPolicyDrift(workspaceRoot);
  if (drifts.length > 0) {
    return {
      recommended: { id: 'teamPolicyDrift', label: 'Align Team Policy Drift', detail: `${drifts.length} drift item(s) detected.`, hotkey: 'Alt+A', category: 'recommended' },
      summary: {
        state: 'warning',
        headline: 'Team policy drift detected',
        detail: 'Align local settings before continuing.',
      },
      recents: recent,
      teamRecommended,
    };
  }

  return {
    recommended: { id: 'openRunPanel', label: 'Run App Now', detail: `Ready to run ${modules[0]} on ${onlineDevices[0].id}.`, hotkey: 'Enter', category: 'recommended' },
    summary: {
      state: 'ok',
      headline: 'Environment ready',
      detail: 'Build + run path is ready. Next step is to execute your target.',
    },
    recents: recent,
    teamRecommended,
  };
}

async function openNextActionSurfaceCommand(): Promise<void> {
  const { NextActionPanel } = lazyLoad<typeof import('./ui/nextActionPanel')>('./ui/nextActionPanel');
  NextActionPanel.createOrShow({
    load: async () => buildNextActionModel(),
    runAction: async (id: string) => executeNextActionById(id),
  });
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
    testRun: async () => runOnboardingTestRun(),
    sendFeedback: async () => sendUxFeedbackFromOnboarding(),
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
async function setUiModeCommand(): Promise<void> {
  const picked = await vscode.window.showQuickPick(
    [
      { label: 'Beginner', value: 'beginner', description: 'Hide matrix, gradle intelligence, and diagnostics panels' },
      { label: 'Standard', value: 'standard', description: 'Balanced default feature visibility' },
      { label: 'Power User', value: 'power', description: 'All advanced tools visible' },
    ],
    { placeHolder: 'Select UI mode' }
  );
  if (!picked) {
    return;
  }
  await vscode.workspace.getConfiguration('androidToolkit').update('ui.mode', picked.value, vscode.ConfigurationTarget.Workspace);
  showInfo(`UI mode set to ${picked.label}.`);
}
async function applyConfigProfileCommand(): Promise<void> {
  const picked = await vscode.window.showQuickPick(
    [
      { label: 'Solo', value: 'solo', description: 'Local-focused setup with balanced refresh and low noise' },
      { label: 'Team', value: 'team', description: 'Shared defaults for collaboration and consistency' },
      { label: 'CI-heavy', value: 'ci-heavy', description: 'Low-noise local mode, CI-oriented checks and deferred monitoring' },
      { label: 'Release', value: 'release', description: 'Strict quality gate and release-oriented defaults' },
    ],
    { placeHolder: 'Apply Android Tools config profile' }
  );
  if (!picked) {
    return;
  }
  const cfg = vscode.workspace.getConfiguration('androidToolkit');
  const profile = picked.value as Exclude<ConfigProfile, 'custom'>;
  const updates: Array<[string, unknown]> = [];
  if (profile === 'solo') {
    updates.push(
      ['notifications.mode', 'quiet'],
      ['sync.autoSync.enabled', true],
      ['sync.autoSync.intervalMs', 4000],
      ['performance.deferBackgroundMonitoring', true],
      ['xml.lintOnSave', true],
      ['ui.mode', 'standard'],
      ['runPanel.actions', [...RUN_ACTION_IDS]]
      ,
      ['keyboard.profile', 'default'],
      ['keyboard.shortcuts', { ...SHORTCUT_PROFILES.default }]
    );
  } else if (profile === 'team') {
    updates.push(
      ['notifications.mode', 'normal'],
      ['sync.autoSync.enabled', true],
      ['sync.autoSync.intervalMs', 3000],
      ['performance.deferBackgroundMonitoring', true],
      ['xml.lintOnSave', true],
      ['ui.mode', 'standard'],
      ['runPanel.actions', [...RUN_ACTION_IDS]]
      ,
      ['keyboard.profile', 'default'],
      ['keyboard.shortcuts', { ...SHORTCUT_PROFILES.default }]
    );
  } else if (profile === 'ci-heavy') {
    updates.push(
      ['notifications.mode', 'quiet'],
      ['sync.autoSync.enabled', false],
      ['sync.autoSync.intervalMs', 5000],
      ['performance.deferBackgroundMonitoring', true],
      ['xml.lintOnSave', true],
      ['ui.mode', 'power'],
      ['runPanel.actions', ['build', 'install', 'run', 'stop', 'releaseGate']]
      ,
      ['keyboard.profile', 'jetbrains'],
      ['keyboard.shortcuts', { ...SHORTCUT_PROFILES.jetbrains }]
    );
  } else if (profile === 'release') {
    updates.push(
      ['notifications.mode', 'normal'],
      ['sync.autoSync.enabled', true],
      ['sync.autoSync.intervalMs', 2500],
      ['performance.deferBackgroundMonitoring', false],
      ['xml.lintOnSave', true],
      ['ui.mode', 'power'],
      ['runPanel.actions', ['build', 'install', 'run', 'stop', 'releaseGate', 'clean']]
      ,
      ['keyboard.profile', 'jetbrains'],
      ['keyboard.shortcuts', { ...SHORTCUT_PROFILES.jetbrains }]
    );
  }
  for (const [key, value] of updates) {
    await cfg.update(key, value, vscode.ConfigurationTarget.Workspace);
  }
  await cfg.update('config.profile', profile, vscode.ConfigurationTarget.Workspace);
  showInfo(`Applied config profile: ${picked.label}`);
}
async function configureRunLayoutCommand(): Promise<void> {
  const current = getRunActionLayout();
  const picked = await vscode.window.showQuickPick(
    RUN_ACTION_IDS.map(id => ({
      label: id,
      picked: current.includes(id),
      description: id === 'releaseGate' ? 'Runs release quality checks' : undefined,
    })),
    {
      placeHolder: 'Select visible actions for Run Panel',
      canPickMany: true,
      ignoreFocusOut: true,
    }
  );
  if (!picked) {
    return;
  }
  const selected = picked.map(item => item.label as RunActionId);
  if (selected.length === 0) {
    showWarning('Run layout unchanged: select at least one action.');
    return;
  }
  const ordered = current.filter(id => selected.includes(id));
  const missing = selected.filter(id => !ordered.includes(id));
  const next = [...ordered, ...missing];
  await vscode.workspace.getConfiguration('androidToolkit').update('runPanel.actions', next, vscode.ConfigurationTarget.Workspace);
  await vscode.workspace.getConfiguration('androidToolkit').update('config.profile', 'custom', vscode.ConfigurationTarget.Workspace);
  showInfo(`Run panel actions updated: ${next.join(', ')}`);
}
async function configureKeyboardShortcutsCommand(): Promise<void> {
  const current = getKeyboardShortcuts();
  const action = await vscode.window.showQuickPick(
    [
      { key: 'run' as const, label: 'Run', description: current.run },
      { key: 'stop' as const, label: 'Stop', description: current.stop },
      { key: 'rerun' as const, label: 'Re-run', description: current.rerun },
      { key: 'releaseGate' as const, label: 'Release Gate', description: current.releaseGate },
      { key: 'refresh' as const, label: 'Refresh', description: current.refresh },
    ],
    { placeHolder: 'Select action to remap' }
  );
  if (!action) {
    return;
  }
  const entered = await vscode.window.showInputBox({
    prompt: `Shortcut for ${action.label} (e.g. Mod+R, Mod+Shift+G, Enter)`,
    value: action.description,
    validateInput: value => {
      const v = value.trim();
      if (!v) {
        return 'Shortcut cannot be empty';
      }
      if (!/^[A-Za-z0-9+]+$/.test(v)) {
        return 'Use format like Mod+R, Mod+Shift+S, Enter';
      }
      return undefined;
    },
  });
  if (!entered) {
    return;
  }
  const normalized = entered.trim();
  const next = { ...current, [action.key]: normalized };
  await vscode.workspace.getConfiguration('androidToolkit').update('keyboard.shortcuts', next, vscode.ConfigurationTarget.Workspace);
  await vscode.workspace.getConfiguration('androidToolkit').update('keyboard.profile', 'custom', vscode.ConfigurationTarget.Workspace);
  await vscode.workspace.getConfiguration('androidToolkit').update('config.profile', 'custom', vscode.ConfigurationTarget.Workspace);
  showInfo(`Shortcut updated: ${action.label} -> ${normalized}`);
}
async function setKeyboardShortcutProfileCommand(): Promise<void> {
  const picked = await vscode.window.showQuickPick(
    [
      { label: 'Default', value: 'default' as ShortcutProfile, description: 'Balanced shortcuts' },
      { label: 'Vim-like', value: 'vim' as ShortcutProfile, description: 'Letter-based fast keys' },
      { label: 'JetBrains-like', value: 'jetbrains' as ShortcutProfile, description: 'Function-key style' },
    ],
    { placeHolder: 'Select shortcut profile' }
  );
  if (!picked) {
    return;
  }
  const map = SHORTCUT_PROFILES[picked.value as Exclude<ShortcutProfile, 'custom'>];
  const cfg = vscode.workspace.getConfiguration('androidToolkit');
  await cfg.update('keyboard.profile', picked.value, vscode.ConfigurationTarget.Workspace);
  await cfg.update('keyboard.shortcuts', map, vscode.ConfigurationTarget.Workspace);
  showInfo(`Shortcut profile set to ${picked.label}.`);
}
function getSavedPanelLayouts(): SavedPanelLayout[] {
  const stored = extensionContext?.globalState.get<SavedPanelLayout[]>(PANEL_LAYOUTS_KEY, []);
  if (!stored || stored.length === 0) {
    return [...DEFAULT_PANEL_LAYOUTS];
  }
  return stored;
}
async function setSavedPanelLayouts(layouts: SavedPanelLayout[]): Promise<void> {
  await extensionContext?.globalState.update(PANEL_LAYOUTS_KEY, layouts);
}
async function applyPanelLayout(layout: SavedPanelLayout): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('androidToolkit');
  await cfg.update('ui.mode', layout.uiMode, vscode.ConfigurationTarget.Workspace);
  await cfg.update('ui.density', layout.density, vscode.ConfigurationTarget.Workspace);
  await cfg.update('ui.fontSize', layout.fontSize, vscode.ConfigurationTarget.Workspace);
  await cfg.update('runPanel.actions', layout.runActions, vscode.ConfigurationTarget.Workspace);
  await cfg.update('config.profile', 'custom', vscode.ConfigurationTarget.Workspace);
}
async function applySavedPanelLayoutCommand(): Promise<void> {
  const layouts = getSavedPanelLayouts();
  const picked = await vscode.window.showQuickPick(
    layouts.map(layout => ({
      label: layout.name,
      description: `${layout.uiMode}, ${layout.density}, actions: ${layout.runActions.join('/')}`,
      layout,
    })),
    { placeHolder: 'Apply saved panel layout' }
  );
  if (!picked) {
    return;
  }
  await applyPanelLayout(picked.layout);
  showInfo(`Applied ${picked.layout.name}`);
}
async function saveCurrentPanelLayoutCommand(): Promise<void> {
  const currentName = await vscode.window.showQuickPick(
    [
      { label: 'Debug layout' },
      { label: 'Release layout' },
      { label: 'QA layout' },
      { label: 'Custom…' },
    ],
    { placeHolder: 'Choose layout slot to save current UI state' }
  );
  if (!currentName) {
    return;
  }
  const name = currentName.label === 'Custom…'
    ? (await vscode.window.showInputBox({ prompt: 'Layout name', value: 'My layout' }))?.trim()
    : currentName.label;
  if (!name) {
    return;
  }
  const cfg = vscode.workspace.getConfiguration('androidToolkit');
  const layout: SavedPanelLayout = {
    name,
    uiMode: getUiMode(),
    density: cfg.get<string>('ui.density', 'comfortable') === 'compact' ? 'compact' : 'comfortable',
    runActions: getRunActionLayout(),
    fontSize: Number(cfg.get<number>('ui.fontSize', 13)) || 13,
  };
  const layouts = getSavedPanelLayouts().filter(item => item.name !== name);
  layouts.unshift(layout);
  await setSavedPanelLayouts(layouts.slice(0, 16));
  showInfo(`Saved layout: ${name}`);
}
function settingsCenterKeys(): string[] {
  return [
    'projectView.mode',
    'ui.mode',
    'ui.density',
    'ui.fontSize',
    'ui.tableRowHeight',
    'ui.logRowHeight',
    'config.profile',
    'runPanel.actions',
    'keyboard.profile',
    'keyboard.shortcuts',
    'notifications.mode',
    'notifications.channels.run',
    'notifications.channels.gradle',
    'notifications.channels.device',
    'notifications.channels.logcat',
    'notifications.channels.tips',
    'notifications.channels.errorsOnly',
    'theme.tokens.success',
    'theme.tokens.warn',
    'theme.tokens.error',
    'theme.tokens.info',
    'sync.autoSync.enabled',
    'sync.autoSync.intervalMs',
    'performance.deferBackgroundMonitoring',
  ];
}
async function openSettingsCenterCommand(): Promise<void> {
  const { SettingsCenterPanel } = lazyLoad<typeof import('./ui/settingsCenterPanel')>('./ui/settingsCenterPanel');
  const cfg = vscode.workspace.getConfiguration('androidToolkit');
  const values: Record<string, unknown> = {};
  for (const key of settingsCenterKeys()) {
    values[key] = cfg.get(key);
  }
  SettingsCenterPanel.createOrShow({
    values,
    onUpdate: async (key: string, value: unknown) => {
      await vscode.workspace.getConfiguration('androidToolkit').update(key, value, vscode.ConfigurationTarget.Workspace);
    },
    onApplyLayout: async (name: string) => {
      const layout = getSavedPanelLayouts().find(item => item.name === name);
      if (layout) {
        await applyPanelLayout(layout);
      }
    },
    listLayouts: () => getSavedPanelLayouts().map(l => l.name),
  });
}
async function collectDiagnosticsSnapshot(): Promise<void> {
  const lines = await buildDiagnosticsSnapshotLines();
  await saveDiagnosticsSnapshotWithDialog(lines);
}
async function buildDiagnosticsSnapshotLines(): Promise<string[]> {
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
  return lines;
}
async function saveDiagnosticsSnapshotWithDialog(lines: string[]): Promise<vscode.Uri | undefined> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
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
    return undefined;
  }
  await vscode.workspace.fs.writeFile(uri, Buffer.from(lines.join('\n'), 'utf8'));
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc, { preview: false });
  return uri;
}
async function createDiagnosticsSnapshotAuto(): Promise<vscode.Uri> {
  const lines = await buildDiagnosticsSnapshotLines();
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
  const dir = path.join(workspaceRoot, '.artifacts');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const uri = vscode.Uri.file(path.join(dir, `android-tools-diagnostics-${Date.now()}.md`));
  await vscode.workspace.fs.writeFile(uri, Buffer.from(lines.join('\n'), 'utf8'));
  return uri;
}
async function sendUxFeedbackFromOnboarding(): Promise<void> {
  const snapshot = await createDiagnosticsSnapshotAuto();
  const issueUrl = new URL('https://github.com/LevKosyk/VS-Code-Android-Tools/issues/new');
  issueUrl.searchParams.set('title', '[UX Feedback] ');
  issueUrl.searchParams.set(
    'body',
    [
      '## UX Feedback',
      '',
      'What felt confusing or slow?',
      '',
      '## Diagnostics snapshot',
      `Attached file path: \`${snapshot.fsPath}\``,
      '',
      'Please drag this file into the issue for full context.',
    ].join('\n')
  );
  await vscode.env.openExternal(vscode.Uri.parse(issueUrl.toString()));
  showInfo(`UX feedback draft opened. Diagnostics snapshot prepared: ${snapshot.fsPath}`);
}
async function runOnboardingTestRun(): Promise<{ ok: boolean; message: string }> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    return { ok: false, message: 'No workspace folder open.' };
  }
  const modules = findApplicationModules(workspaceRoot);
  if (modules.length === 0) {
    return { ok: false, message: 'No Android module found.' };
  }
  const devices = await listDevicesDetailed();
  if (!devices.some(d => d.status === 'online')) {
    return { ok: false, message: 'No online device. Start emulator first.' };
  }
  try {
    await vscode.commands.executeCommand('android-toolkit.runSelectedAlias');
    return { ok: true, message: 'Run command executed. Check device launch result in Run Panel.' };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Test run failed.' };
  }
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
function getLaunchTargetKey(moduleName: string): string {
  return `android-tools.launchTarget.${moduleName}`;
}
function getDeviceKey(): string {
  return 'android-tools.selectedDevice';
}
function getModuleKey(): string {
  return 'android-tools.selectedModule';
}
function getModuleRunRulesKey(): string {
  return 'android-tools.moduleRunRules';
}
function getAutoRetryPolicy(): { enabled: boolean; maxRetries: number } {
  const cfg = vscode.workspace.getConfiguration('androidToolkit');
  const enabled = cfg.get<boolean>('run.autoRetry.enabled', true);
  const maxRetriesRaw = Number(cfg.get<number>('run.autoRetry.maxRetries', 2));
  const maxRetries = Number.isFinite(maxRetriesRaw) ? Math.max(0, Math.min(5, Math.floor(maxRetriesRaw))) : 2;
  return { enabled, maxRetries };
}
let onlineDevicesCache: { at: number; devices: AndroidDevice[] } | undefined;
const modulesCache = new Map<string, { at: number; version: number; modules: string[] }>();
const applicationIdCache = new Map<string, { at: number; version: number; value: string | undefined }>();
const buildToolsVersionCache = new Map<string, { at: number; version: number; value: string | undefined }>();
const launchTargetsCache = new Map<string, { at: number; version: number; targets: LaunchTarget[] }>();
const moduleScanVersionByWorkspace = new Map<string, number>();

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
  preflightCache.clear();
  preflightInFlight.clear();
  clearSdkCache();
  invalidateProjectScanCache(workspaceRoot);
}

function markProjectScanDirty(workspaceRoot: string): void {
  const next = (moduleScanVersionByWorkspace.get(workspaceRoot) || 0) + 1;
  moduleScanVersionByWorkspace.set(workspaceRoot, next);
}

function invalidateProjectScanCache(workspaceRoot?: string): void {
  if (workspaceRoot) {
    modulesCache.delete(workspaceRoot);
    for (const key of applicationIdCache.keys()) {
      if (key.startsWith(`${workspaceRoot}::`)) {
        applicationIdCache.delete(key);
      }
    }
    for (const key of buildToolsVersionCache.keys()) {
      if (key.startsWith(`${workspaceRoot}::`)) {
        buildToolsVersionCache.delete(key);
      }
    }
    for (const key of launchTargetsCache.keys()) {
      if (key.startsWith(`${workspaceRoot}::`)) {
        launchTargetsCache.delete(key);
      }
    }
    markProjectScanDirty(workspaceRoot);
  } else {
    modulesCache.clear();
    applicationIdCache.clear();
    buildToolsVersionCache.clear();
    launchTargetsCache.clear();
    moduleScanVersionByWorkspace.clear();
  }
}

function findApplicationModulesCached(workspaceRoot: string, ttlMs = 12000): string[] {
  const now = Date.now();
  const version = moduleScanVersionByWorkspace.get(workspaceRoot) || 0;
  const cached = modulesCache.get(workspaceRoot);
  if (cached && cached.version === version && now - cached.at <= ttlMs) {
    return cached.modules;
  }
  const startedAt = Date.now();
  const modules = findApplicationModulesRaw(workspaceRoot);
  modulesCache.set(workspaceRoot, { at: now, version, modules });
  trackSlowPathMetric('projectModuleScan', Date.now() - startedAt, true);
  return modules;
}

function findApplicationModules(workspaceRoot: string): string[] {
  return findApplicationModulesCached(workspaceRoot);
}

function findApplicationId(workspaceRoot: string, moduleName: string, ttlMs = 12000): string | undefined {
  const version = moduleScanVersionByWorkspace.get(workspaceRoot) || 0;
  const key = `${workspaceRoot}::${moduleName}`;
  const now = Date.now();
  const cached = applicationIdCache.get(key);
  if (cached && cached.version === version && now - cached.at <= ttlMs) {
    return cached.value;
  }
  const value = findApplicationIdRaw(workspaceRoot, moduleName);
  applicationIdCache.set(key, { at: now, version, value });
  return value;
}

function findBuildToolsVersion(workspaceRoot: string, moduleName: string, ttlMs = 12000): string | undefined {
  const version = moduleScanVersionByWorkspace.get(workspaceRoot) || 0;
  const key = `${workspaceRoot}::${moduleName}`;
  const now = Date.now();
  const cached = buildToolsVersionCache.get(key);
  if (cached && cached.version === version && now - cached.at <= ttlMs) {
    return cached.value;
  }
  const value = findBuildToolsVersionRaw(workspaceRoot, moduleName);
  buildToolsVersionCache.set(key, { at: now, version, value });
  return value;
}

function listManifestLaunchTargetsCached(workspaceRoot: string, moduleName: string, packageName: string, ttlMs = 8000): LaunchTarget[] {
  const version = moduleScanVersionByWorkspace.get(workspaceRoot) || 0;
  const key = `${workspaceRoot}::${moduleName}::${packageName}`;
  const now = Date.now();
  const cached = launchTargetsCache.get(key);
  if (cached && cached.version === version && now - cached.at <= ttlMs) {
    return cached.targets;
  }
  const targets = listManifestLaunchTargetsRaw(workspaceRoot, moduleName, packageName);
  launchTargetsCache.set(key, { at: now, version, targets });
  return targets;
}

function mergeDiagnosticsRows<T extends { timestamp: number }>(
  persisted: T[],
  current: T[],
  key: (value: T) => string,
  limit: number
): T[] {
  const rows = [...current, ...persisted];
  const map = new Map<string, T>();
  for (const row of rows) {
    const k = key(row);
    const prev = map.get(k);
    if (!prev || row.timestamp > prev.timestamp) {
      map.set(k, row);
    }
  }
  return Array.from(map.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}

function ensureDiagnosticsDataLoaded(): void {
  if (diagnosticsDataLoaded || !extensionContext) {
    return;
  }
  diagnosticsDataLoaded = true;
  const persistedActionReplay = extensionContext.globalState.get<ActionReplayRecord[]>(ACTION_REPLAY_KEY, []);
  if (persistedActionReplay.length > 0) {
    actionReplay.splice(
      0,
      actionReplay.length,
      ...mergeDiagnosticsRows(
        persistedActionReplay,
        actionReplay,
        item => `${item.timestamp}:${item.action}:${item.durationMs}`,
        300
      )
    );
  }
  const persistedMetrics = extensionContext.globalState.get<RunActionMetric[]>(RUN_ACTION_METRICS_KEY, []);
  if (persistedMetrics.length > 0) {
    runActionMetrics.splice(
      0,
      runActionMetrics.length,
      ...mergeDiagnosticsRows(
        persistedMetrics,
        runActionMetrics,
        item => `${item.timestamp}:${item.action}:${item.durationMs}`,
        1000
      )
    );
  }
  const persistedCommandMetrics = extensionContext.globalState.get<CommandLatencyRecord[]>(COMMAND_LATENCY_METRICS_KEY, []);
  if (persistedCommandMetrics.length > 0) {
    commandLatencyMetrics.splice(
      0,
      commandLatencyMetrics.length,
      ...mergeDiagnosticsRows(
        persistedCommandMetrics,
        commandLatencyMetrics,
        item => `${item.timestamp}:${item.commandId}:${item.durationMs}`,
        1000
      )
    );
  }
  const persistedSlowPaths = extensionContext.globalState.get<SlowPathRecord[]>(SLOW_PATH_METRICS_KEY, []);
  if (persistedSlowPaths.length > 0) {
    slowPathMetrics.splice(
      0,
      slowPathMetrics.length,
      ...mergeDiagnosticsRows(
        persistedSlowPaths,
        slowPathMetrics,
        item => `${item.timestamp}:${item.stage}:${item.durationMs}`,
        2000
      )
    );
  }
  const persistedFailures = extensionContext.globalState.get<RunFailureRecord[]>(RUN_FAILURE_RECORDS_KEY, []);
  if (persistedFailures.length > 0) {
    const normalized = persistedFailures.map(item => ({ ...item, reason: normalizeErrorReason(item.reason) }));
    runFailureRecords.splice(
      0,
      runFailureRecords.length,
      ...mergeDiagnosticsRows(
        normalized,
        runFailureRecords,
        item => `${item.timestamp}:${item.action}:${item.message}`,
        500
      )
    );
  }
  const persistedFixAttempts = extensionContext.globalState.get<RunFixAttemptRecord[]>(RUN_FIX_ATTEMPTS_KEY, []);
  if (persistedFixAttempts.length > 0) {
    const normalized = persistedFixAttempts.map(item => ({ ...item, reason: normalizeErrorReason(item.reason) }));
    runFixAttempts.splice(
      0,
      runFixAttempts.length,
      ...mergeDiagnosticsRows(
        normalized,
        runFixAttempts,
        item => `${item.timestamp}:${item.fixId}:${item.success}`,
        500
      )
    );
  }
  const persistedCrashAnr = extensionContext.globalState.get<CrashAnrRecord[]>(CRASH_ANR_RECORDS_KEY, []);
  if (persistedCrashAnr.length > 0) {
    crashAnrRecords.splice(
      0,
      crashAnrRecords.length,
      ...mergeDiagnosticsRows(
        persistedCrashAnr,
        crashAnrRecords,
        item => `${item.timestamp}:${item.signature}:${item.type}`,
        800
      )
    );
  }
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
  const { StartupProfilerPanel } = lazyLoad<typeof import('./ui/startupProfilerPanel')>('./ui/startupProfilerPanel');
  StartupProfilerPanel.createOrShow(startupProfilerEntries, startupProfilerTotalMs, summarizeSlowPaths(slowPathMetrics, TOP_SLOW_PATH_LIMIT));
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
  const lines = buildActionReplayLines();
  const doc = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content: lines.join('\n'),
  });
  await vscode.window.showTextDocument(doc, { preview: false });
}
function buildActionReplayLines(limit = 120): string[] {
  const lines: string[] = [];
  lines.push('# Android Tools Action Replay');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Records: ${actionReplay.length}`);
  lines.push('');
  actionReplay.slice(0, limit).forEach((item, index) => {
    lines.push(`${index + 1}. ${item.success ? '[OK]' : '[FAIL]'} ${item.action} (${item.durationMs} ms)`);
    lines.push(`   Args: ${item.args}`);
    lines.push(`   At: ${new Date(item.timestamp).toISOString()}`);
    if (item.error) {
      lines.push(`   Error: ${item.error}`);
    }
  });
  return lines;
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

async function collectTeamPolicyDrift(workspaceRoot: string): Promise<TeamPolicyDriftItem[]> {
  const read = readProjectConfig(workspaceRoot);
  const drifts: TeamPolicyDriftItem[] = [];
  const teamProfile = read.config.teamProfile;
  const policy = read.config.policy;

  if (policy?.requiredSettings && typeof policy.requiredSettings === 'object') {
    const cfg = vscode.workspace.getConfiguration('androidToolkit');
    for (const [key, expected] of Object.entries(policy.requiredSettings)) {
      const actual = cfg.get(key);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        drifts.push({
          id: `setting:${key}`,
          title: `Setting drift: androidToolkit.${key}`,
          expected: JSON.stringify(expected),
          actual: JSON.stringify(actual),
          alignAction: async () => {
            await cfg.update(key, expected, vscode.ConfigurationTarget.WorkspaceFolder);
          },
        });
      }
    }
  }

  if (teamProfile?.preferredJdkPath) {
    const actualJdk = String(vscode.workspace.getConfiguration().get('java.jdt.ls.java.home') || '');
    if (actualJdk !== teamProfile.preferredJdkPath) {
      drifts.push({
        id: 'teamProfile:preferredJdkPath',
        title: 'Preferred JDK path drift',
        expected: teamProfile.preferredJdkPath,
        actual: actualJdk || '(empty)',
        alignAction: async () => {
          await vscode.workspace.getConfiguration().update('java.jdt.ls.java.home', teamProfile.preferredJdkPath, vscode.ConfigurationTarget.Global);
        },
      });
    }
  }

  if (Array.isArray(teamProfile?.runRules)) {
    for (const expectedRule of teamProfile.runRules) {
      const actualRule = getModuleRunRule(expectedRule.moduleName);
      const expectedText = JSON.stringify(expectedRule);
      const actualText = JSON.stringify(actualRule || {});
      if (expectedText !== actualText) {
        drifts.push({
          id: `teamProfile:runRule:${expectedRule.moduleName}`,
          title: `Run rule drift for module ${expectedRule.moduleName}`,
          expected: expectedText,
          actual: actualText,
          alignAction: async () => {
            await saveModuleRunRule(expectedRule as ModuleRunRule);
          },
        });
      }
    }
  }

  return drifts;
}

async function openTeamPolicyDriftReportCommand(): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    showError('No workspace folder open.');
    return;
  }
  const { TeamPolicyDriftPanel } = lazyLoad<typeof import('./team/teamPolicyDriftPanel')>('./team/teamPolicyDriftPanel');
  TeamPolicyDriftPanel.createOrShow({
    load: async () => {
      const drifts = await collectTeamPolicyDrift(workspaceRoot);
      return drifts.map(item => ({
        id: item.id,
        title: item.title,
        expected: item.expected,
        actual: item.actual,
      }));
    },
    alignOne: async (id: string) => {
      const drifts = await collectTeamPolicyDrift(workspaceRoot);
      const target = drifts.find(item => item.id === id);
      if (!target) {
        showInfo('Selected drift is already aligned.');
        return;
      }
      await target.alignAction();
      showInfo(`Aligned: ${target.title}`);
    },
    alignAll: async () => {
      const drifts = await collectTeamPolicyDrift(workspaceRoot);
      if (drifts.length === 0) {
        showInfo('Team policy drift: none detected.');
        return;
      }
      for (const item of drifts) {
        await item.alignAction();
      }
      showInfo(`Aligned ${drifts.length} drift item(s).`);
    },
    openMarkdown: async () => {
      const drifts = await collectTeamPolicyDrift(workspaceRoot);
      const doc = await vscode.workspace.openTextDocument({
        language: 'markdown',
        content: buildTeamPolicyDriftMarkdown(drifts),
      });
      await vscode.window.showTextDocument(doc, { preview: false });
    },
  });
}

function buildTeamPolicyDriftMarkdown(drifts: TeamPolicyDriftItem[]): string {
  const lines: string[] = [];
  lines.push('# Team Policy Drift Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Drifts: ${drifts.length}`);
  lines.push('');
  if (drifts.length === 0) {
    lines.push('No drift detected.');
    return lines.join('\n');
  }
  lines.push('| Drift | Expected | Actual |');
  lines.push('| --- | --- | --- |');
  for (const item of drifts) {
    lines.push(`| ${escapeMdCell(item.title)} | ${escapeMdCell(item.expected)} | ${escapeMdCell(item.actual)} |`);
  }
  return lines.join('\n');
}

function summarizeCommandBudgetsMap(summary: ReturnType<typeof summarizeCommandBudgets>): Map<string, { p95Ms: number; p99Ms: number; sloMs: number }> {
  const map = new Map<string, { p95Ms: number; p99Ms: number; sloMs: number }>();
  for (const row of summary) {
    map.set(row.commandId, { p95Ms: row.p95Ms, p99Ms: row.p99Ms, sloMs: row.sloMs });
  }
  return map;
}

async function runPerformanceRegressionGuardrailCommand(): Promise<void> {
  if (!extensionContext) {
    showError('Extension context not available.');
    return;
  }
  ensureDiagnosticsDataLoaded();
  const currentSummary = summarizeCommandBudgets(commandLatencyMetrics);
  const baseline = extensionContext.globalState.get<PerformanceGuardrailBaseline | undefined>(PERFORMANCE_BASELINE_KEY);

  if (!baseline) {
    const choice = await vscode.window.showQuickPick(['Capture baseline now', 'Cancel'], {
      placeHolder: 'No performance baseline found',
    });
    if (choice !== 'Capture baseline now') {
      return;
    }
    const nextBaseline: PerformanceGuardrailBaseline = {
      capturedAt: Date.now(),
      startupTotalMs: startupProfilerTotalMs,
      commandBudgetSummary: currentSummary,
    };
    await extensionContext.globalState.update(PERFORMANCE_BASELINE_KEY, nextBaseline);
    showInfo('Performance baseline captured. Re-run guardrail after collecting more metrics.');
    return;
  }

  const baselineMap = summarizeCommandBudgetsMap(baseline.commandBudgetSummary);
  const currentMap = summarizeCommandBudgetsMap(currentSummary);
  const lines: string[] = [];
  const failures: string[] = [];

  lines.push('# Performance Regression Guardrail');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Baseline captured: ${new Date(baseline.capturedAt).toISOString()}`);
  lines.push('');

  const startupAllowed = Math.max(1000, Math.round(baseline.startupTotalMs * 1.15));
  const startupPass = startupProfilerTotalMs <= startupAllowed;
  lines.push(`Startup total: ${startupProfilerTotalMs} ms (baseline ${baseline.startupTotalMs} ms, allowed <= ${startupAllowed} ms) => ${startupPass ? 'PASS' : 'FAIL'}`);
  if (!startupPass) {
    failures.push('Startup total regressed beyond threshold');
  }
  lines.push('');
  lines.push('| Command | Baseline p95 | Current p95 | Baseline p99 | Current p99 | Allowed p95 | Allowed p99 | Result |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const [commandId, current] of currentMap.entries()) {
    const base = baselineMap.get(commandId);
    if (!base || base.p95Ms <= 0) {
      continue;
    }
    const allowedP95 = Math.max(base.p95Ms, Math.round(base.p95Ms * 1.2));
    const allowedP99 = Math.max(base.p99Ms, Math.round(base.p99Ms * 1.25));
    const pass = current.p95Ms <= allowedP95 && current.p99Ms <= allowedP99;
    lines.push(`| ${commandId} | ${base.p95Ms} | ${current.p95Ms} | ${base.p99Ms} | ${current.p99Ms} | ${allowedP95} | ${allowedP99} | ${pass ? 'PASS' : 'FAIL'} |`);
    if (!pass) {
      failures.push(`${commandId} latency regressed (p95/p99)`);
    }
  }

  const sloViolations = enforceCommandSloBudgets(currentSummary, { maxBreachRatePct: 15, maxP99OverSloFactor: 1.35, minSamples: 8 });
  if (sloViolations.length > 0) {
    lines.push('');
    lines.push('## SLO Budget Violations');
    lines.push('');
    lines.push('| Command | Reason | Samples | Breaches | P95 | P99 | SLO |');
    lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: |');
    for (const item of sloViolations) {
      lines.push(`| ${item.commandId} | ${escapeMdCell(item.reason)} | ${item.samples} | ${item.breaches} | ${item.p95Ms} | ${item.p99Ms} | ${item.sloMs} |`);
      failures.push(`${item.commandId} budget violation`);
    }
  }

  lines.push('');
  lines.push(`Overall: ${failures.length === 0 ? 'PASS' : 'FAIL'}`);
  if (failures.length > 0) {
    lines.push('');
    lines.push('## Failures');
    lines.push('');
    for (const item of failures) {
      lines.push(`- ${item}`);
    }
  }

  const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content: lines.join('\n') });
  await vscode.window.showTextDocument(doc, { preview: false });
  if (failures.length === 0) {
    showInfo('Performance guardrail passed.');
  } else {
    showWarning(`Performance guardrail failed with ${failures.length} regression(s).`);
  }
}

async function buildIntelligenceHubSnapshotForWorkspace(workspaceRoot: string) {
  const releaseOverride = extensionContext?.globalState.get<ReleaseRiskOverride | undefined>(INTELLIGENCE_RELEASE_OVERRIDE_KEY);
  const snapshot = await buildIntelligenceHubSnapshot({
    workspaceRoot,
    crashRecords: crashAnrRecords.map(item => ({
      type: item.type,
      signature: item.signature,
      message: item.message,
      source: item.source,
      timestamp: item.timestamp,
    })),
    runFailureRecords,
    slowPathMetrics,
    startupTotalMs: startupProfilerTotalMs,
    performanceBaseline: extensionContext?.globalState.get<PerformanceGuardrailBaseline | undefined>(PERFORMANCE_BASELINE_KEY),
    matrixHistory: extensionContext?.globalState.get('matrixDashboard.history', []),
    releaseOverride,
  });
  await extensionContext?.globalState.update(INTELLIGENCE_HUB_SNAPSHOT_KEY, snapshot);
  return snapshot;
}

async function openIntelligenceHubCommand(): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    showError('No workspace folder open.');
    return;
  }
  ensureDiagnosticsDataLoaded();
  const snapshot = await buildIntelligenceHubSnapshotForWorkspace(workspaceRoot);
  const markdown = renderIntelligenceHubMarkdown(snapshot);
  const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content: markdown });
  await vscode.window.showTextDocument(doc, { preview: false });
  await vscode.commands.executeCommand('markdown.showPreviewToSide', doc.uri);
}

async function runIntelligenceMatrixSmokeCommand(): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    showError('No workspace folder open.');
    return;
  }
  const snapshot = extensionContext?.globalState.get<Awaited<ReturnType<typeof buildIntelligenceHubSnapshot>> | undefined>(INTELLIGENCE_HUB_SNAPSHOT_KEY)
    || await buildIntelligenceHubSnapshotForWorkspace(workspaceRoot);

  if (!snapshot.matrix.packageName) {
    showWarning('Package name not detected for matrix smoke run. Set applicationId in Gradle first.');
    return;
  }

  await withProgress('Android Tools: Running smart matrix smoke', async () => {
    const result = await runSmartMatrixSmoke(workspaceRoot, snapshot);
    await extensionContext?.globalState.update(INTELLIGENCE_MATRIX_LAST_RESULT_KEY, result);
    const failed = result.rows.filter(row => !row.success).length;
    if (failed === 0) {
      showInfo(`Smart matrix smoke passed on ${result.rows.length} device(s).`);
      return;
    }
    showWarning(`Smart matrix smoke completed with ${failed} failure(s). Use Export PR Heatmap for details.`);
  });
}

async function exportIntelligencePrHeatmapCommand(): Promise<void> {
  const result = extensionContext?.globalState.get<MatrixSmokeResult | undefined>(INTELLIGENCE_MATRIX_LAST_RESULT_KEY);
  if (!result) {
    showWarning('No matrix smoke result found. Run Smart Matrix Smoke first.');
    return;
  }
  const doc = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content: renderHeatmapComment(result),
  });
  await vscode.window.showTextDocument(doc, { preview: false });
}

async function approveReleaseRiskOverrideCommand(): Promise<void> {
  const reason = await vscode.window.showInputBox({
    prompt: 'Enter override reason (auditable)',
    placeHolder: 'Example: mitigation verified in staging, shipping hotfix',
    ignoreFocusOut: true,
  });
  if (!reason) {
    return;
  }
  const actor = process.env.USER || process.env.USERNAME || 'unknown-user';
  const override: ReleaseRiskOverride = {
    approvedAt: Date.now(),
    approvedBy: actor,
    reason,
  };
  await extensionContext?.globalState.update(INTELLIGENCE_RELEASE_OVERRIDE_KEY, override);
  showInfo('Release risk override recorded. Re-open Intelligence Hub to refresh gate status.');
}

async function enforcePolicyAsCodeCommand(): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    showError('No workspace folder open.');
    return;
  }
  const snapshot = extensionContext?.globalState.get<Awaited<ReturnType<typeof buildIntelligenceHubSnapshot>> | undefined>(INTELLIGENCE_HUB_SNAPSHOT_KEY)
    || await buildIntelligenceHubSnapshotForWorkspace(workspaceRoot);
  const result = await enforcePolicyAsCode(workspaceRoot, snapshot);
  if (result.fixed === 0) {
    showInfo(result.details[0] || 'No safe policy auto-fixes applied.');
    return;
  }
  showInfo(`Policy enforcement applied ${result.fixed} safe auto-fix(es), ${result.remaining} issue(s) remaining.`);
}

async function replayDeepLinkFuzzCaseCommand(): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    showError('No workspace folder open.');
    return;
  }
  const snapshot = extensionContext?.globalState.get<Awaited<ReturnType<typeof buildIntelligenceHubSnapshot>> | undefined>(INTELLIGENCE_HUB_SNAPSHOT_KEY)
    || await buildIntelligenceHubSnapshotForWorkspace(workspaceRoot);
  const selectedDevice = await getSelectedDeviceId();
  const message = await replayDeepLinkCase(snapshot, selectedDevice);
  if (message.toLowerCase().includes('failed') || message.toLowerCase().includes('no target device')) {
    showWarning(message);
    return;
  }
  showInfo(message);
}

async function runTeamPlaybookCommand(): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    showError('No workspace folder open.');
    return;
  }
  const snapshot = extensionContext?.globalState.get<Awaited<ReturnType<typeof buildIntelligenceHubSnapshot>> | undefined>(INTELLIGENCE_HUB_SNAPSHOT_KEY)
    || await buildIntelligenceHubSnapshotForWorkspace(workspaceRoot);
  const picked = await vscode.window.showQuickPick(
    snapshot.playbooks.map(item => ({ label: item.title, item })),
    { placeHolder: 'Select incident playbook to run' }
  );
  if (!picked) {
    return;
  }
  const summaryLines: string[] = [];
  for (const step of picked.item.steps) {
    try {
      await vscode.commands.executeCommand(step.commandId);
      summaryLines.push(`- ${step.label}: done`);
    } catch (error) {
      summaryLines.push(`- ${step.label}: failed (${String(error)})`);
      break;
    }
  }
  const recommendations = await runPlaybook(picked.item as TeamPlaybook);
  const doc = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content: [
      `# Playbook Summary: ${picked.item.title}`,
      '',
      ...summaryLines,
      '',
      '## Sequence',
      ...recommendations,
    ].join('\n'),
  });
  await vscode.window.showTextDocument(doc, { preview: false });
}

async function runFocusedPrChecksCommand(): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    showError('No workspace folder open.');
    return;
  }
  const snapshot = extensionContext?.globalState.get<Awaited<ReturnType<typeof buildIntelligenceHubSnapshot>> | undefined>(INTELLIGENCE_HUB_SNAPSHOT_KEY)
    || await buildIntelligenceHubSnapshotForWorkspace(workspaceRoot);
  const lines = await runFocusedPrChecks(workspaceRoot, snapshot);
  const doc = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content: ['# PR Quality Assistant', '', ...lines.map(line => `- ${line}`)].join('\n'),
  });
  await vscode.window.showTextDocument(doc, { preview: false });
}

async function openLocalTelemetryDashboardCommand(): Promise<void> {
  if (!extensionContext) {
    showError('Extension context not available.');
    return;
  }
  let enabled = extensionContext.globalState.get<boolean>(TELEMETRY_LOCAL_OPT_IN_KEY, false);
  if (!enabled) {
    const pick = await vscode.window.showQuickPick(
      ['Enable local anonymous metrics', 'Not now'],
      {
        placeHolder: 'Local-first telemetry dashboard is opt-in and never leaves this machine.',
      }
    );
    if (pick !== 'Enable local anonymous metrics') {
      return;
    }
    enabled = true;
    await extensionContext.globalState.update(TELEMETRY_LOCAL_OPT_IN_KEY, true);
  }

  ensureDiagnosticsDataLoaded();
  const commandSummary = summarizeCommandBudgets(commandLatencyMetrics)
    .slice()
    .sort((a, b) => b.samples - a.samples)
    .slice(0, 20);
  const slowSummary = summarizeSlowPaths(slowPathMetrics, 20);
  const slowFingerprintSummary = summarizeSlowPathFingerprints(slowPathMetrics, 20);
  const failureSummary = runFailureRecords.slice(0, 200);

  const lines: string[] = [];
  lines.push('# Local Telemetry Dashboard');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('Mode: local-first, anonymous, opt-in');
  lines.push('');
  lines.push('## Command Usage and Latency');
  lines.push('');
  lines.push('| Command | Samples | P50 | P95 | P99 | Breaches | Breach Rate |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const row of commandSummary) {
    lines.push(`| ${row.commandId} | ${row.samples} | ${row.p50Ms} | ${row.p95Ms} | ${row.p99Ms} | ${row.breaches} | ${row.breachRatePct}% |`);
  }
  lines.push('');
  lines.push('## Slow Operations');
  lines.push('');
  lines.push('| Stage | Samples | Failures | P95 | Max |');
  lines.push('| --- | ---: | ---: | ---: | ---: |');
  for (const row of slowSummary) {
    lines.push(`| ${row.stage} | ${row.samples} | ${row.failures} | ${row.p95Ms} | ${row.maxMs} |`);
  }
  lines.push('');
  lines.push('## Slow-path Fingerprints');
  lines.push('');
  lines.push('| Stage | Fingerprint | Samples | Failures | P95 |');
  lines.push('| --- | --- | ---: | ---: | ---: |');
  for (const row of slowFingerprintSummary) {
    lines.push(`| ${row.stage} | ${escapeMdCell(row.fingerprint)} | ${row.samples} | ${row.failures} | ${row.p95Ms} |`);
  }
  lines.push('');
  lines.push('## Recent Failures');
  lines.push('');
  if (failureSummary.length === 0) {
    lines.push('No failures recorded in recent history.');
  } else {
    lines.push('| Action | Reason | When |');
    lines.push('| --- | --- | --- |');
    for (const row of failureSummary.slice(0, 20)) {
      lines.push(`| ${row.action} | ${row.reason} | ${new Date(row.timestamp).toISOString()} |`);
    }
  }

  const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content: lines.join('\n') });
  await vscode.window.showTextDocument(doc, { preview: false });
}

async function runGuidedFirstSuccessPathCommand(): Promise<void> {
  if (!extensionContext) {
    return;
  }
  let checks = await getOnboardingV2Checks();
  while (true) {
    const next = checks.find(item => !item.ok);
    if (!next) {
      break;
    }
    const choice = await vscode.window.showQuickPick(
      [
        `Apply next step: ${next.fixLabel || 'Fix'}`,
        'Open full onboarding panel',
        'Stop for now',
      ],
      {
        title: 'Guided first successful run',
        placeHolder: `${next.title} — ${next.details}`,
      }
    );
    if (!choice || choice === 'Stop for now') {
      return;
    }
    if (choice === 'Open full onboarding panel') {
      await openOnboardingV2Panel(true);
      return;
    }
    await applyOnboardingV2Fix(next.id);
    checks = await getOnboardingV2Checks();
  }

  const test = await runOnboardingTestRun();
  if (!test.ok) {
    showWarning(`Guided run reached test step but failed: ${test.message}`);
    return;
  }
  await extensionContext.globalState.update(FIRST_RUN_WIZARD_SUCCESS_KEY, true);
  await vscode.commands.executeCommand('android-toolkit.openRunPanel');
  showInfo('Guided checklist completed. First run path is ready.');
}
function flattenProjectSection(input: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    const next = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flattenProjectSection(v as Record<string, unknown>, next));
    } else {
      out[next] = v;
    }
  }
  return out;
}
async function applyProjectOverridesFromConfig(workspaceRoot: string): Promise<void> {
  const read = readProjectConfig(workspaceRoot);
  const cfg = vscode.workspace.getConfiguration('androidToolkit', vscode.workspace.workspaceFolders?.[0]);
  const targets: Record<string, unknown>[] = [];
  if (read.config.ui && typeof read.config.ui === 'object') {
    targets.push(read.config.ui as Record<string, unknown>);
  }
  if (read.config.behavior && typeof read.config.behavior === 'object') {
    targets.push(read.config.behavior as Record<string, unknown>);
  }
  if (targets.length === 0) {
    return;
  }
  const flat = targets.reduce<Record<string, unknown>>((acc, obj) => {
    Object.assign(acc, flattenProjectSection(obj));
    return acc;
  }, {});
  for (const [key, value] of Object.entries(flat)) {
    try {
      await cfg.update(key, value, vscode.ConfigurationTarget.WorkspaceFolder);
    } catch {
      // ignore invalid keys to keep startup stable
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
async function getSelectedLaunchTarget(moduleName: string): Promise<string> {
  return extensionContext?.globalState.get<string>(getLaunchTargetKey(moduleName)) || 'launcher';
}
async function setSelectedLaunchTarget(moduleName: string, launchTargetId: string): Promise<void> {
  await extensionContext?.globalState.update(getLaunchTargetKey(moduleName), launchTargetId);
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
function getModuleRunRules(): ModuleRunRule[] {
  return extensionContext?.globalState.get<ModuleRunRule[]>(getModuleRunRulesKey(), []) || [];
}
async function saveModuleRunRule(rule: ModuleRunRule): Promise<void> {
  const rules = getModuleRunRules().filter(r => r.moduleName !== rule.moduleName);
  rules.push(rule);
  await extensionContext?.globalState.update(getModuleRunRulesKey(), rules);
}
function getModuleRunRule(moduleName: string): ModuleRunRule | undefined {
  return getModuleRunRules().find(r => r.moduleName === moduleName);
}
function pushTimeline(entry: Omit<SessionTimelineEntry, 'id' | 'at'>): void {
  sessionTimeline.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
    ...entry,
  });
  if (sessionTimeline.length > 300) {
    sessionTimeline.length = 300;
  }
}
function listTimeline(limit = 120): SessionTimelineEntry[] {
  return sessionTimeline.slice(0, limit);
}
function getLastFailedTimelineEntry(): SessionTimelineEntry | undefined {
  return sessionTimeline.find(entry => entry.status === 'failed');
}
async function openFileLocation(file: string, line: number, column = 1): Promise<boolean> {
  try {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
    const editor = await vscode.window.showTextDocument(doc, { preview: false });
    const pos = new vscode.Position(Math.max(0, line - 1), Math.max(0, column - 1));
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
    return true;
  } catch {
    return false;
  }
}
async function openLastFailedStepCommand(): Promise<void> {
  const failed = getLastFailedTimelineEntry();
  if (!failed) {
    showInfo('No failed step found in current session timeline.');
    return;
  }
  const meta = gradleReasonMetaSummary();
  const title = `Last failed step: ${failed.action} / ${failed.stage}`;
  const why = [failed.message, meta.why].filter(Boolean).join(' | ');
  const errorLocation = lastGradleErrorLocation;
  const locationAction = errorLocation
    ? {
      label: 'Open Source Location',
      action: async () => {
        await openFileLocation(
          errorLocation.file,
          errorLocation.line,
          errorLocation.column || 1
        );
      },
    }
    : {
      label: 'Run Failure Report',
      action: async () => {
        await vscode.commands.executeCommand('android-toolkit.openRunFailureReport');
      },
    };
  await showActionableError({
    title,
    why,
    suggestions: [
      ...meta.suggestions,
      `Context: module=${failed.moduleName || '-'} variant=${failed.variant || '-'} device=${failed.deviceId || '-'}`,
      'Open Android Gradle Output for full logs and stacktrace.',
    ],
    fixCommands: extractCommandCandidates([lastGradleErrorSummary, failed.message, ...meta.suggestions].filter(Boolean).join('\n')),
    actions: [
      {
        label: 'Open Gradle Output',
        action: async () => vscode.commands.executeCommand('android-toolkit.showGradleOutput'),
      },
      locationAction,
    ],
  });
}
async function getAvailableVariants(workspaceRoot: string, moduleName: string): Promise<string[]> {
  const model = await loadAndroidGradleModel(workspaceRoot);
  return model.modules.find(module => module.name === moduleName)?.variants || ['Debug'];
}
async function getVariantOptions(workspaceRoot: string, moduleName: string): Promise<{ buildTypes: string[]; flavors: string[]; variants: string[] }> {
  const model = await loadAndroidGradleModel(workspaceRoot);
  const module = model.modules.find(item => item.name === moduleName);
  return module || { buildTypes: ['Debug', 'Release'], flavors: [], variants: ['Debug'] };
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
  await captureGradleBottlenecks(task, result.exitCode, result.stdout || '', result.stderr || '');
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
): Promise<{ ok: boolean; message?: string; fixes?: RunFixSuggestion[]; warnings?: string[] }> {
  return withSlowPathTrace(
    'runPreflight',
    async () => {
  const key = `${workspaceRoot}|${moduleName}|${variant}|${deviceId}|${requireDevice ? '1' : '0'}`;
  const cached = preflightCache.get(key);
  if (cached && Date.now() - cached.at <= PREFLIGHT_CACHE_TTL_MS) {
    return cached.result;
  }
  const inFlight = preflightInFlight.get(key);
  if (inFlight) {
    return inFlight;
  }
  const compute = (async (): Promise<{ ok: boolean; message?: string; fixes?: RunFixSuggestion[]; warnings?: string[] }> => {
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
    let devices: AndroidDevice[] = [];
    try {
      devices = await listDevicesDetailed();
    } catch {
      return {
        ok: false,
        message: 'ADB is offline or unavailable. Start ADB server and reconnect device.',
        fixes: [{ id: 'selectDevice', label: 'Select Device' }],
      };
    }
    const selectedAny = devices.find(d => d.id === deviceId);
    if (!selectedAny) {
      return { ok: false, message: 'Selected device is unavailable.', fixes: [{ id: 'selectDevice', label: 'Select Device' }] };
    }
    if (selectedAny.status === 'unauthorized') {
      return {
        ok: false,
        message: 'Device is unauthorized. Accept the ADB prompt on device.',
        fixes: [{ id: 'selectDevice', label: 'Select Device' }],
      };
    }
    if (selectedAny.status !== 'online') {
      return { ok: false, message: 'Selected device is offline or unavailable.', fixes: [{ id: 'selectDevice', label: 'Select Device' }] };
    }
    const warnings: string[] = [];
    try {
      const storage = await AdbService.getStorageInfo(deviceId);
      if (storage.availableGb > 0 && storage.availableGb < 1.5) {
        warnings.push(`Low device storage (${storage.availableGb.toFixed(1)} GB free). Install may fail.`);
      }
    } catch {
      // best effort
    }
    try {
      const props = await AdbService.getDeviceProperties(deviceId);
      const minSdk = findMinSdkVersion(workspaceRoot, moduleName);
      if (minSdk && props.apiLevel > 0 && props.apiLevel < minSdk) {
        warnings.push(`API mismatch: device API ${props.apiLevel} < minSdk ${minSdk}. App may not launch.`);
      }
    } catch {
      // best effort
    }
    if (warnings.length > 0) {
      return { ok: true, warnings };
    }
  }
  return { ok: true };
  })();
  preflightInFlight.set(key, compute);
  try {
    const result = await compute;
    preflightCache.set(key, { at: Date.now(), result });
    return result;
  } finally {
    preflightInFlight.delete(key);
  }
    },
    result => result.ok
  );
}

function findMinSdkVersion(workspaceRoot: string, moduleName: string): number | undefined {
  const files = [
    path.join(workspaceRoot, moduleName, 'build.gradle'),
    path.join(workspaceRoot, moduleName, 'build.gradle.kts'),
  ];
  for (const file of files) {
    if (!fs.existsSync(file)) {
      continue;
    }
    const content = fs.readFileSync(file, 'utf-8');
    const match =
      content.match(/\bminSdk(?:Version)?\s*(?:=)?\s*(\d+)/) ||
      content.match(/\bminSdkPreview\s*(?:=)?\s*["']([^"']+)["']/);
    if (!match) {
      continue;
    }
    const value = Number.parseInt(match[1], 10);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return undefined;
}

function readGradleWrapperVersion(workspaceRoot: string): string | undefined {
  const wrapperPath = path.join(workspaceRoot, 'gradle', 'wrapper', 'gradle-wrapper.properties');
  if (!fs.existsSync(wrapperPath)) {
    return undefined;
  }
  const content = fs.readFileSync(wrapperPath, 'utf-8');
  const match = content.match(/distributionUrl=.*gradle-([0-9]+(?:\.[0-9]+){1,2})-/i);
  return match?.[1];
}

function compareSemverLike(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n, 10));
  const pb = b.split('.').map(n => parseInt(n, 10));
  const max = Math.max(pa.length, pb.length);
  for (let i = 0; i < max; i++) {
    const va = Number.isFinite(pa[i]) ? pa[i] : 0;
    const vb = Number.isFinite(pb[i]) ? pb[i] : 0;
    if (va !== vb) {
      return va - vb;
    }
  }
  return 0;
}

function findSdkManagerBinary(sdkRoot: string): string | undefined {
  const cmdlineTools = path.join(sdkRoot, 'cmdline-tools');
  if (!fs.existsSync(cmdlineTools)) {
    return undefined;
  }
  const dirs = fs.readdirSync(cmdlineTools);
  const ordered = ['latest', ...dirs.filter(d => d !== 'latest').sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))];
  for (const dir of ordered) {
    const candidate = path.join(
      cmdlineTools,
      dir,
      'bin',
      process.platform === 'win32' ? 'sdkmanager.bat' : 'sdkmanager'
    );
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function upsertPropertyFile(filePath: string, key: string, value: string): void {
  const line = `${key}=${value}`;
  let content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
  if (new RegExp(`^${key}=`, 'm').test(content)) {
    content = content.replace(new RegExp(`^${key}=.*$`, 'm'), line);
  } else {
    content = content.trim() ? `${content.trim()}\n${line}\n` : `${line}\n`;
  }
  fs.writeFileSync(filePath, content);
}

async function evaluateProjectDoctorIssues(workspaceRoot: string): Promise<DoctorIssue[]> {
  const issues: DoctorIssue[] = [];
  let sdkRoot = '';
  try {
    sdkRoot = detectSdk().root;
  } catch {
    issues.push({
      id: 'sdk.missing',
      severity: 'error',
      title: 'Android SDK is not configured',
      details: 'ANDROID_SDK_ROOT/ANDROID_HOME is missing or invalid.',
      fixId: 'doctor.openSdkDocs',
      fixLabel: 'Open SDK Setup Guide',
    });
    return issues;
  }

  const localPropsPath = path.join(workspaceRoot, 'local.properties');
  const localProps = fs.existsSync(localPropsPath) ? fs.readFileSync(localPropsPath, 'utf-8') : '';
  const localSdkRaw = localProps.match(/^sdk\.dir=(.+)$/m)?.[1]?.trim();
  const localSdk = localSdkRaw ? localSdkRaw.replace(/\\:/g, ':').replace(/\\\\/g, '/') : '';
  if (!localSdk || !fs.existsSync(localSdk)) {
    issues.push({
      id: 'local.properties.sdkDir',
      severity: 'warning',
      title: 'local.properties sdk.dir is missing or invalid',
      details: 'Gradle sync can fail when sdk.dir is not set to a valid Android SDK path.',
      fixId: 'doctor.fixLocalProperties',
      fixLabel: 'Fix local.properties',
      autoFixSafe: true,
    });
  }

  const platformToolsDir = path.join(sdkRoot, 'platform-tools');
  const buildToolsDir = path.join(sdkRoot, 'build-tools');
  const platformsDir = path.join(sdkRoot, 'platforms');
  const missingSdkComponents =
    !fs.existsSync(platformToolsDir) ||
    !fs.existsSync(buildToolsDir) || fs.readdirSync(buildToolsDir).length === 0 ||
    !fs.existsSync(platformsDir) || fs.readdirSync(platformsDir).length === 0;
  if (missingSdkComponents) {
    issues.push({
      id: 'sdk.components',
      severity: 'error',
      title: 'Required SDK components are missing',
      details: 'platform-tools, platforms, or build-tools are not fully installed.',
      fixId: 'doctor.installSdkComponents',
      fixLabel: 'Install Missing SDK Components',
      autoFixSafe: true,
    });
  }

  const languageHealth = await getLanguageHealthStatus();
  if (languageHealth.kotlinRiskOnJava25) {
    issues.push({
      id: 'jdk.kotlinRisk',
      severity: 'warning',
      title: 'JDK version can break Kotlin tooling',
      details: `Java ${languageHealth.javaVersion || languageHealth.javaMajor || 'unknown'} is risky for Kotlin LS.`,
      fixId: 'doctor.setJdk21',
      fixLabel: 'Use JDK 21',
    });
  }

  const wrapperVersion = readGradleWrapperVersion(workspaceRoot);
  const javaMajor = Number(languageHealth.javaMajor || 0);
  if (!wrapperVersion) {
    issues.push({
      id: 'gradle.wrapper.missing',
      severity: 'error',
      title: 'Gradle wrapper file is missing',
      details: 'gradle/wrapper/gradle-wrapper.properties was not found.',
      fixId: 'doctor.runGradleDoctor',
      fixLabel: 'Open Gradle Doctor',
    });
  } else if (javaMajor >= 21 && compareSemverLike(wrapperVersion, '8.4') < 0) {
    issues.push({
      id: 'gradle.wrapper.mismatch',
      severity: 'warning',
      title: `Gradle wrapper ${wrapperVersion} may be too old for Java ${javaMajor}`,
      details: 'Upgrade wrapper to a modern Gradle release for stable sync and builds.',
      fixId: 'doctor.fixGradleWrapper',
      fixLabel: 'Update Gradle Wrapper',
      autoFixSafe: true,
    });
  }

  return issues;
}

async function applyProjectDoctorFix(workspaceRoot: string, fixId: string): Promise<RunActionResult> {
  if (fixId === 'doctor.openSdkDocs') {
    await vscode.env.openExternal(vscode.Uri.parse('https://developer.android.com/studio#command-tools'));
    return { success: true, message: 'Opened Android SDK setup guide.' };
  }
  if (fixId === 'doctor.runGradleDoctor') {
    await runGradleDoctor(workspaceRoot);
    return { success: true, message: 'Gradle Doctor opened.' };
  }
  if (fixId === 'doctor.setJdk21') {
    const ok = await setJdk21Path();
    return { success: ok, message: ok ? 'JDK path updated.' : 'JDK update canceled.' };
  }
  if (fixId === 'doctor.fixLocalProperties') {
    const sdkRoot = detectSdk().root;
    const localPropsPath = path.join(workspaceRoot, 'local.properties');
    const escaped = sdkRoot.replace(/\\/g, '\\\\').replace(/:/g, '\\:');
    upsertPropertyFile(localPropsPath, 'sdk.dir', escaped);
    return { success: true, message: 'local.properties updated with sdk.dir.' };
  }
  if (fixId === 'doctor.fixGradleWrapper') {
    const wrapperPath = path.join(workspaceRoot, 'gradle', 'wrapper', 'gradle-wrapper.properties');
    if (!fs.existsSync(wrapperPath)) {
      return { success: false, message: 'gradle-wrapper.properties not found.' };
    }
    const content = fs.readFileSync(wrapperPath, 'utf-8');
    const next = content.replace(
      /^distributionUrl=.*$/m,
      'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.7-bin.zip'
    );
    fs.writeFileSync(wrapperPath, next);
    return { success: true, message: 'Gradle wrapper updated to 8.7.' };
  }
  if (fixId === 'doctor.installSdkComponents') {
    const sdkRoot = detectSdk().root;
    const sdkmanager = findSdkManagerBinary(sdkRoot);
    if (!sdkmanager) {
      return { success: false, message: 'sdkmanager not found under cmdline-tools.' };
    }
    const packages: string[] = [];
    if (!fs.existsSync(path.join(sdkRoot, 'platform-tools'))) {
      packages.push('platform-tools');
    }
    const buildToolsDir = path.join(sdkRoot, 'build-tools');
    if (!fs.existsSync(buildToolsDir) || fs.readdirSync(buildToolsDir).length === 0) {
      packages.push('build-tools;36.0.0');
    }
    const platformsDir = path.join(sdkRoot, 'platforms');
    if (!fs.existsSync(platformsDir) || fs.readdirSync(platformsDir).length === 0) {
      packages.push('platforms;android-34');
    }
    if (packages.length === 0) {
      return { success: true, message: 'SDK components already installed.' };
    }
    const result = await execCommand(sdkmanager, packages, { timeout: 600_000 });
    return {
      success: result.exitCode === 0,
      message: result.exitCode === 0
        ? `Installed SDK components: ${packages.join(', ')}`
        : `Failed installing SDK components. ${result.stderr || result.stdout || ''}`,
    };
  }
  return { success: false, message: `Unknown Project Doctor fix: ${fixId}` };
}

async function runProjectDoctorCommand(): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    showError('No workspace folder open.');
    return;
  }
  const issues = await evaluateProjectDoctorIssues(workspaceRoot);
  if (issues.length === 0) {
    showInfo('Project Doctor: no issues detected.');
    return;
  }

  const pick = await vscode.window.showQuickPick(
    [
      {
        label: '$(wrench) Auto-fix all safe issues',
        description: `${issues.filter(item => item.autoFixSafe).length} safe fix(es)`,
        issueId: '__auto__',
      },
      ...issues.map(issue => ({
        label: `${issue.severity === 'error' ? '$(error)' : '$(warning)'} ${issue.title}`,
        description: issue.details,
        detail: `Fix: ${issue.fixLabel}`,
        issueId: issue.id,
      })),
    ],
    {
      title: 'Android Project Doctor',
      placeHolder: 'Choose an issue to fix or run one-click safe auto-fix',
      ignoreFocusOut: true,
    }
  );

  if (!pick) {
    return;
  }

  const channel = vscode.window.createOutputChannel('Android Project Doctor');
  channel.clear();
  channel.show(true);
  channel.appendLine('Android Project Doctor started...');

  const applyIssue = async (issue: DoctorIssue): Promise<void> => {
    channel.appendLine(`- ${issue.title}`);
    const result = await applyProjectDoctorFix(workspaceRoot, issue.fixId);
    channel.appendLine(`  ${result.success ? '[OK]' : '[FAIL]'} ${result.message}`);
  };

  if (pick.issueId === '__auto__') {
    const safeIssues = issues.filter(item => item.autoFixSafe);
    if (safeIssues.length === 0) {
      showWarning('Project Doctor: no safe auto-fixes available for current issues.');
      return;
    }
    for (const issue of safeIssues) {
      await applyIssue(issue);
    }
    const remaining = await evaluateProjectDoctorIssues(workspaceRoot);
    if (remaining.length === 0) {
      showInfo('Project Doctor auto-fix completed. All detected issues are resolved.');
    } else {
      showWarning(`Project Doctor auto-fix completed. Remaining issues: ${remaining.length}.`);
    }
    return;
  }

  const target = issues.find(item => item.id === pick.issueId);
  if (!target) {
    showWarning('Selected doctor issue is no longer available.');
    return;
  }
  await applyIssue(target);
  const remaining = await evaluateProjectDoctorIssues(workspaceRoot);
  showInfo(`Project Doctor finished. Open issues remaining: ${remaining.length}.`);
}

function mapFixToQuickActionId(fixId: string): string {
  if (fixId === 'selectVariant') {
    return 'select-variant';
  }
  if (fixId === 'selectDevice') {
    return 'select-device';
  }
  if (fixId === 'setJdk21Path') {
    return 'set-jdk21';
  }
  if (fixId === 'runGradleDoctor') {
    return 'run-gradle-doctor';
  }
  return 'project-doctor';
}

async function getSmartRunHealthContext(context?: { moduleName?: string; deviceId?: string; variant?: string }): Promise<SmartRunHealth> {
  const moduleName = context?.moduleName || (await getSelectedModule()) || '';
  const deviceId = context?.deviceId || (await getSelectedDeviceId()) || '';
  let variant = context?.variant || '';
  if (moduleName && !variant) {
    variant = await getSelectedVariant(moduleName);
  }

  const recommendations: SmartRunRecommendation[] = [];
  let score = 100;
  const health = await getLanguageHealthStatus();
  if (!health.hasJavaExtension || !health.hasKotlinExtension) {
    score -= 35;
    recommendations.push({ label: 'Run Project Doctor', actionId: 'project-doctor' });
  }
  if (health.kotlinRiskOnJava25) {
    score -= 20;
    recommendations.push({ label: 'Use JDK 21', actionId: 'set-jdk21' });
  }
  if (!moduleName) {
    score -= 20;
    recommendations.push({ label: 'Select Module', actionId: 'select-module' });
  }
  if (!deviceId) {
    score -= 20;
    recommendations.push({ label: 'Select Device', actionId: 'select-device' });
  }

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspaceRoot && moduleName) {
    const preflight = await runPreflightChecks(workspaceRoot, moduleName, variant || 'Debug', deviceId, Boolean(deviceId));
    if (!preflight.ok) {
      score -= 35;
      for (const fix of preflight.fixes || []) {
        recommendations.push({ label: fix.label, actionId: mapFixToQuickActionId(fix.id) });
      }
    }
    if (preflight.warnings && preflight.warnings.length > 0) {
      score -= 10;
    }
  }

  if (lastGradleErrorTags.includes('dependencyResolution') || lastGradleErrorTags.includes('sdkMissing')) {
    recommendations.push({ label: 'Run Gradle Doctor', actionId: 'run-gradle-doctor' });
  }
  if (lastGradleErrorTags.includes('taskNotFound')) {
    recommendations.push({ label: 'Run Clean Build', actionId: 'smart-clean-build' });
  }
  const lastGradleLower = (lastGradleErrorSummary || '').toLowerCase();
  const hasDeviceConnectivityHint = /device offline|unauthorized|no devices|device not found/.test(lastGradleLower);
  if (hasDeviceConnectivityHint && deviceId.startsWith('emulator-')) {
    recommendations.push({ label: 'Cold Boot Emulator', actionId: 'cold-boot-selected-emulator' });
  }
  if (score < 75) {
    recommendations.push({ label: 'Run Project Doctor', actionId: 'project-doctor' });
  }

  const deduped: SmartRunRecommendation[] = [];
  const seen = new Set<string>();
  for (const item of recommendations) {
    const key = `${item.actionId}:${item.label}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(item);
  }

  const normalizedScore = Math.max(5, Math.min(100, score));
  const state: 'ok' | 'warning' | 'error' = normalizedScore >= 85
    ? 'ok'
    : normalizedScore >= 60
      ? 'warning'
      : 'error';
  const message = state === 'ok'
    ? 'Ready to run.'
    : state === 'warning'
      ? 'Run should work, but a few checks are risky.'
      : 'Run is likely to fail until key issues are fixed.';
  return {
    state,
    message,
    score: normalizedScore,
    recommendations: deduped.slice(0, 4),
  };
}

function extractCrashAnrRecordsFromLogcat(
  logcat: string,
  context: { moduleName: string; deviceId: string; source: string }
): CrashAnrRecord[] {
  const out: CrashAnrRecord[] = [];
  const lines = logcat.split('\n');
  const appFrameRegex = /\bat\s+([a-zA-Z0-9_$.]+)\(([^:]+):(\d+)\)/;
  const exceptionRegex = /\b([A-Za-z0-9_$.]+(?:Exception|Error))\b/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/FATAL EXCEPTION/i.test(line)) {
      const window = lines.slice(i, i + 14).join('\n');
      const exception = window.match(exceptionRegex)?.[1] || 'UnknownCrash';
      const appFrame = window.match(appFrameRegex)?.[1] || 'unknown.frame';
      const signature = `${exception}@${appFrame}`;
      out.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'crash',
        signature,
        message: window.split('\n').slice(0, 5).join(' | '),
        moduleName: context.moduleName,
        deviceId: context.deviceId,
        sessionId: currentSessionId || 'unknown-session',
        source: context.source,
        timestamp: Date.now(),
      });
    }
    const anrMatch = line.match(/\bANR in\s+([A-Za-z0-9_.]+)/i);
    if (anrMatch) {
      const signature = `ANR:${anrMatch[1]}`;
      out.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'anr',
        signature,
        message: line.trim(),
        moduleName: context.moduleName,
        deviceId: context.deviceId,
        sessionId: currentSessionId || 'unknown-session',
        source: context.source,
        timestamp: Date.now(),
      });
    }
  }
  return out;
}

async function persistCrashAnrRecords(): Promise<void> {
  if (!extensionContext) {
    return;
  }
  await extensionContext.globalState.update(CRASH_ANR_RECORDS_KEY, crashAnrRecords.slice(0, 800));
}

function appendCrashAnrRecords(records: CrashAnrRecord[]): void {
  if (!records.length) {
    return;
  }
  crashAnrRecords.unshift(...records);
  if (crashAnrRecords.length > 800) {
    crashAnrRecords.length = 800;
  }
  void persistCrashAnrRecords();
}

function escapeMdCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function commandLink(label: string, commandId: string): string {
  return `[${label}](command:${commandId})`;
}

function getLikelyFixesForSignature(signature: string, type: 'crash' | 'anr'): CrashLikelyFix[] {
  const lower = signature.toLowerCase();
  const fixes: CrashLikelyFix[] = [];

  if (type === 'anr' || /anr|inputdispatching timed out|main thread/.test(lower)) {
    fixes.push({
      label: 'Capture Performance Monitor snapshot',
      commandId: 'android-toolkit.openPerformanceMonitor',
    });
    fixes.push({
      label: 'Run Crash Repro flow',
      commandId: 'android-toolkit.openRunPanel',
    });
  }
  if (/outofmemoryerror|oom/.test(lower)) {
    fixes.push({
      label: 'Inspect memory pressure in Profiler',
      commandId: 'android-toolkit.openProfiler',
    });
  }
  if (/unknownhost|sockettimeout|connectexception|network|sslhandshake/.test(lower)) {
    fixes.push({
      label: 'Verify emulator/device network state',
      commandId: 'android-toolkit.emulator.toggleNetwork',
    });
    fixes.push({
      label: 'Android network troubleshooting',
      docUrl: 'https://developer.android.com/training/monitoring-device-state/connectivity-status-type',
    });
  }
  if (/sqlite|room|cursorwindow|disk i\/o/.test(lower)) {
    fixes.push({
      label: 'Inspect runtime DB state',
      commandId: 'android-toolkit.openDatabaseInspector',
    });
  }
  if (/classnotfound|nosuchmethod|verifyerror|incompatibleclasschange/.test(lower)) {
    fixes.push({
      label: 'Run Gradle Sync',
      commandId: 'android-toolkit.gradleSync',
    });
    fixes.push({
      label: 'Run Project Doctor',
      commandId: 'android-toolkit.projectDoctor',
    });
  }
  if (/native|sigsegv|abort|lib\w+\.so/.test(lower)) {
    fixes.push({
      label: 'Open Crash Symbolicator',
      commandId: 'android-toolkit.openCrashSymbolicator',
    });
  }
  fixes.push({
    label: 'Open Crash & ANR triage again',
    commandId: 'android-toolkit.openCrashAnrTriage',
  });

  const deduped: CrashLikelyFix[] = [];
  const seen = new Set<string>();
  for (const fix of fixes) {
    const key = `${fix.label}:${fix.commandId || ''}:${fix.docUrl || ''}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(fix);
  }
  return deduped.slice(0, 4);
}

async function openCrashAnrTriageReport(): Promise<void> {
  ensureDiagnosticsDataLoaded();
  const records = crashAnrRecords.slice(0, 800);
  if (records.length === 0) {
    showInfo('No crash/ANR records captured yet. Run crash repro or export artifacts first.');
    return;
  }
  const grouped = new Map<string, CrashAnrRecord[]>();
  for (const row of records) {
    const current = grouped.get(row.signature) || [];
    current.push(row);
    grouped.set(row.signature, current);
  }

  const recentSessions = sessionHistory
    .slice()
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, 10)
    .map(s => s.id);
  const recentSet = new Set(recentSessions.slice(0, 5));
  const baselineSet = new Set(recentSessions.slice(5, 10));

  const rows = Array.from(grouped.entries()).map(([signature, list]) => {
    const recentHits = list.filter(item => recentSet.has(item.sessionId)).length;
    const baselineHits = list.filter(item => baselineSet.has(item.sessionId)).length;
    return {
      signature,
      type: list[0].type,
      total: list.length,
      recentHits,
      baselineHits,
      delta: recentHits - baselineHits,
      latestAt: Math.max(...list.map(item => item.timestamp)),
    };
  });

  const topRegressions = rows
    .filter(item => item.delta > 0)
    .sort((a, b) => b.delta - a.delta || b.total - a.total)
    .slice(0, 10);
  const topSignatures = rows
    .slice()
    .sort((a, b) => b.total - a.total || b.latestAt - a.latestAt)
    .slice(0, 15);

  const lines: string[] = [];
  lines.push('# Crash and ANR Triage');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Events: ${records.length}`);
  lines.push(`Unique signatures: ${rows.length}`);
  lines.push('');
  lines.push('## Top regressions (last 5 sessions vs previous 5)');
  lines.push('');
  if (topRegressions.length === 0) {
    lines.push('No regressions detected in the latest sessions.');
  } else {
    lines.push('| Type | Signature | Recent | Previous | Delta |');
    lines.push('| --- | --- | ---: | ---: | ---: |');
    for (const row of topRegressions) {
      lines.push(`| ${row.type.toUpperCase()} | ${row.signature} | ${row.recentHits} | ${row.baselineHits} | +${row.delta} |`);
    }
  }
  lines.push('');
  lines.push('## Top signatures');
  lines.push('');
  lines.push('| Type | Signature | Count | Last Seen | Likely fixes |');
  lines.push('| --- | --- | ---: | --- | --- |');
  for (const row of topSignatures) {
    const fixes = getLikelyFixesForSignature(row.signature, row.type)
      .map(item => item.commandId
        ? commandLink(item.label, item.commandId)
        : `[${item.label}](${item.docUrl})`
      )
      .join('<br/>');
    lines.push(`| ${row.type.toUpperCase()} | ${escapeMdCell(row.signature)} | ${row.total} | ${new Date(row.latestAt).toISOString()} | ${fixes || 'n/a'} |`);
  }
  lines.push('');
  lines.push('## Signature fix playbooks');
  lines.push('');
  for (const row of topSignatures.slice(0, 10)) {
    lines.push(`### ${row.type.toUpperCase()} ${row.signature}`);
    const fixes = getLikelyFixesForSignature(row.signature, row.type);
    for (const fix of fixes) {
      if (fix.commandId) {
        lines.push(`- ${commandLink(fix.label, fix.commandId)}`);
      } else if (fix.docUrl) {
        lines.push(`- [${fix.label}](${fix.docUrl})`);
      }
    }
    lines.push('');
  }

  const doc = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content: lines.join('\n'),
  });
  await vscode.window.showTextDocument(doc, { preview: false });
}

function parseDurationToMs(input: string): number {
  const text = input.trim().toLowerCase();
  let total = 0;
  const minuteMatch = text.match(/(\d+(?:\.\d+)?)\s*m/);
  if (minuteMatch) {
    total += Math.round(parseFloat(minuteMatch[1]) * 60_000);
  }
  const secondMatch = text.match(/(\d+(?:\.\d+)?)\s*s/);
  if (secondMatch) {
    total += Math.round(parseFloat(secondMatch[1]) * 1000);
  }
  const msMatch = text.match(/(\d+(?:\.\d+)?)\s*ms/);
  if (msMatch) {
    total += Math.round(parseFloat(msMatch[1]));
  }
  return total;
}

function toTopNamedCounts(map: Map<string, number>, limit: number): NamedCountHotspot[] {
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function analyzeGradleBottlenecks(task: string, exitCode: number, stdout: string, stderr: string): GradleBottleneckRecord {
  const combined = [stdout || '', stderr || ''].filter(Boolean).join('\n');
  const lines = combined.split('\n');
  const taskDurations = new Map<string, number>();
  const pluginCounts = new Map<string, number>();
  const depCounts = new Map<string, number>();
  let totalDurationMs = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const taskMatch = line.match(/(?:>\s*Task\s+)?(:[A-Za-z0-9_:.\-]+).*?\b(\d+(?:\.\d+)?(?:ms|s|m))\b/);
    if (taskMatch) {
      const durationMs = parseDurationToMs(taskMatch[2]);
      if (durationMs > 0) {
        const prev = taskDurations.get(taskMatch[1]) || 0;
        taskDurations.set(taskMatch[1], Math.max(prev, durationMs));
      }
    }

    const pluginMatch = line.match(/(?:plugin\s+|id\s*[=:]\s*|Applying plugin\s+)([A-Za-z0-9_.\-]+)/i);
    if (pluginMatch) {
      const name = pluginMatch[1];
      pluginCounts.set(name, (pluginCounts.get(name) || 0) + 1);
    }

    const depMatch = line.match(/Could not resolve\s+([A-Za-z0-9_.\-]+:[A-Za-z0-9_.\-]+(?::[A-Za-z0-9+_.\-]+)?)/i)
      || line.match(/[+\\]---\s+([A-Za-z0-9_.\-]+:[A-Za-z0-9_.\-]+:[A-Za-z0-9+_.\-]+)/);
    if (depMatch) {
      depCounts.set(depMatch[1], (depCounts.get(depMatch[1]) || 0) + 1);
    }

    if (totalDurationMs <= 0) {
      const totalMatch = line.match(/BUILD\s+(?:SUCCESSFUL|FAILED)\s+in\s+(.+)$/i);
      if (totalMatch) {
        totalDurationMs = parseDurationToMs(totalMatch[1]);
      }
    }
  }

  const slowTasks = Array.from(taskDurations.entries())
    .map(([taskName, durationMs]) => ({ task: taskName, durationMs }))
    .sort((a, b) => b.durationMs - a.durationMs || a.task.localeCompare(b.task))
    .slice(0, 12);
  if (totalDurationMs <= 0) {
    totalDurationMs = slowTasks.reduce((sum, item) => sum + item.durationMs, 0);
  }

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    task,
    success: exitCode === 0,
    timestamp: Date.now(),
    totalDurationMs,
    slowTasks,
    pluginHotspots: toTopNamedCounts(pluginCounts, 10),
    dependencyHotspots: toTopNamedCounts(depCounts, 10),
  };
}

async function appendGradleBottleneckRecord(record: GradleBottleneckRecord): Promise<void> {
  if (!extensionContext) {
    return;
  }
  const existing = extensionContext.globalState.get<GradleBottleneckRecord[]>(GRADLE_BOTTLENECK_HISTORY_KEY, []);
  existing.unshift(record);
  if (existing.length > 60) {
    existing.length = 60;
  }
  await extensionContext.globalState.update(GRADLE_BOTTLENECK_HISTORY_KEY, existing);
}

async function captureGradleBottlenecks(task: string, exitCode: number, stdout: string, stderr: string): Promise<void> {
  const analyzed = analyzeGradleBottlenecks(task, exitCode, stdout, stderr);
  await appendGradleBottleneckRecord(analyzed);
}

function formatDurationMs(ms: number): string {
  if (ms >= 60_000) {
    const minutes = Math.floor(ms / 60_000);
    const seconds = Math.round((ms % 60_000) / 1000);
    return `${minutes}m ${seconds}s`;
  }
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${ms}ms`;
}

async function openGradleBottleneckAnalyzer(): Promise<void> {
  if (!extensionContext) {
    showError('Extension context not available.');
    return;
  }
  const last = getLastGradleOutputSnapshot();
  if (last) {
    await captureGradleBottlenecks(last.task, last.exitCode, last.stdout, last.stderr);
  }

  const history = extensionContext.globalState
    .get<GradleBottleneckRecord[]>(GRADLE_BOTTLENECK_HISTORY_KEY, [])
    .slice()
    .sort((a, b) => b.timestamp - a.timestamp);

  if (history.length === 0) {
    showInfo('No Gradle outputs captured yet. Run a build and reopen the analyzer.');
    return;
  }

  const latest = history[0];
  const trend = history.slice(0, 10);
  const lines: string[] = [];
  lines.push('# Gradle Bottleneck Analyzer');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Build samples available: ${history.length}`);
  lines.push(`Latest task: ${latest.task}`);
  lines.push(`Latest duration: ${formatDurationMs(latest.totalDurationMs)}`);
  lines.push('');
  lines.push('## Slow tasks (latest build)');
  lines.push('');
  if (latest.slowTasks.length === 0) {
    lines.push('No per-task duration lines detected in latest output.');
  } else {
    lines.push('| Task | Duration |');
    lines.push('| --- | ---: |');
    for (const row of latest.slowTasks.slice(0, 12)) {
      lines.push(`| ${escapeMdCell(row.task)} | ${formatDurationMs(row.durationMs)} |`);
    }
  }
  lines.push('');
  lines.push('## Plugin hotspots (latest build)');
  lines.push('');
  if (latest.pluginHotspots.length === 0) {
    lines.push('No plugin hotspot markers found in latest output.');
  } else {
    lines.push('| Plugin | Hits |');
    lines.push('| --- | ---: |');
    for (const row of latest.pluginHotspots) {
      lines.push(`| ${escapeMdCell(row.name)} | ${row.count} |`);
    }
  }
  lines.push('');
  lines.push('## Dependency hotspots (latest build)');
  lines.push('');
  if (latest.dependencyHotspots.length === 0) {
    lines.push('No dependency hotspots found in latest output.');
  } else {
    lines.push('| Dependency | Hits |');
    lines.push('| --- | ---: |');
    for (const row of latest.dependencyHotspots) {
      lines.push(`| ${escapeMdCell(row.name)} | ${row.count} |`);
    }
  }
  lines.push('');
  lines.push('## Build trend (last 10 builds)');
  lines.push('');
  lines.push('| Time | Task | Duration | Result | Top slow task |');
  lines.push('| --- | --- | ---: | --- | --- |');
  for (const row of trend) {
    const topSlow = row.slowTasks[0] ? `${row.slowTasks[0].task} (${formatDurationMs(row.slowTasks[0].durationMs)})` : 'n/a';
    lines.push(`| ${new Date(row.timestamp).toISOString()} | ${escapeMdCell(row.task)} | ${formatDurationMs(row.totalDurationMs)} | ${row.success ? 'PASS' : 'FAIL'} | ${escapeMdCell(topSlow)} |`);
  }

  const doc = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content: lines.join('\n'),
  });
  await vscode.window.showTextDocument(doc, { preview: false });
}

async function listDeviceStateProfiles(): Promise<DeviceStateProfile[]> {
  if (!extensionContext) {
    return [];
  }
  return extensionContext.globalState
    .get<DeviceStateProfile[]>(DEVICE_STATE_PROFILES_KEY, [])
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

async function persistDeviceStateProfiles(profiles: DeviceStateProfile[]): Promise<void> {
  if (!extensionContext) {
    return;
  }
  const next = profiles.slice(0, 40);
  await extensionContext.globalState.update(DEVICE_STATE_PROFILES_KEY, next);
}

async function readShellValue(deviceId: string, ...shellArgs: string[]): Promise<string> {
  const sdk = detectSdk();
  const result = await execCommand(sdk.adb, ['-s', deviceId, 'shell', ...shellArgs], { timeout: 30_000 });
  if (result.exitCode !== 0) {
    return '';
  }
  return result.stdout.trim();
}

async function writeShell(deviceId: string, ...shellArgs: string[]): Promise<boolean> {
  const sdk = detectSdk();
  const result = await execCommand(sdk.adb, ['-s', deviceId, 'shell', ...shellArgs], { timeout: 30_000 });
  return result.exitCode === 0;
}

async function readGrantedPermissions(deviceId: string, packageName: string): Promise<string[]> {
  const sdk = detectSdk();
  const result = await execCommand(sdk.adb, ['-s', deviceId, 'shell', 'dumpsys', 'package', packageName], { timeout: 60_000 });
  if (result.exitCode !== 0) {
    return [];
  }
  const out: string[] = [];
  const regex = /\s([A-Za-z0-9_.]+):\sgranted=true/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(result.stdout)) !== null) {
    out.push(match[1]);
  }
  return Array.from(new Set(out)).sort((a, b) => a.localeCompare(b));
}

async function buildDeviceStateProfile(deviceId: string, name: string, moduleName?: string): Promise<DeviceStateProfile> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const resolvedModule = moduleName || (workspaceRoot ? await getSelectedModule() : '') || undefined;
  const packageName = workspaceRoot && resolvedModule
    ? findApplicationId(workspaceRoot, resolvedModule)
    : undefined;
  const battery = await AdbService.getBatteryInfo(deviceId);
  const locale =
    (await readShellValue(deviceId, 'getprop', 'persist.sys.locale'))
    || (await readShellValue(deviceId, 'getprop', 'ro.product.locale'))
    || 'unknown';

  const profile: DeviceStateProfile = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deviceId,
    moduleName: resolvedModule,
    packageName: packageName || undefined,
    network: await getNetworkStatus(deviceId),
    batteryLevel: battery.level,
    batteryStatus: battery.status,
    locale,
    animations: {
      window: (await readShellValue(deviceId, 'settings', 'get', 'global', 'window_animation_scale')) || '1',
      transition: (await readShellValue(deviceId, 'settings', 'get', 'global', 'transition_animation_scale')) || '1',
      animator: (await readShellValue(deviceId, 'settings', 'get', 'global', 'animator_duration_scale')) || '1',
    },
    grantedPermissions: packageName ? await readGrantedPermissions(deviceId, packageName) : [],
  };
  return profile;
}

async function saveDeviceStateProfileCommand(): Promise<void> {
  const devices = (await listDevicesDetailed()).filter(d => d.status === 'online');
  if (devices.length === 0) {
    showWarning('No online devices found.');
    return;
  }
  const selected = devices.length === 1
    ? devices[0]
    : await pickDevice(devices, { title: 'Select device for state snapshot' });
  if (!selected) {
    return;
  }
  const defaultName = `profile-${selected.id}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`;
  const name = await vscode.window.showInputBox({
    prompt: 'Device state profile name',
    value: defaultName,
  });
  if (!name?.trim()) {
    return;
  }

  const profile = await buildDeviceStateProfile(selected.id, name.trim());
  const existing = await listDeviceStateProfiles();
  const idx = existing.findIndex(item => item.name === profile.name);
  if (idx >= 0) {
    profile.id = existing[idx].id;
    profile.createdAt = existing[idx].createdAt;
    existing[idx] = profile;
  } else {
    existing.unshift(profile);
  }
  await persistDeviceStateProfiles(existing);
  showInfo(`Saved device state profile: ${profile.name}`);
}

async function applyDeviceStateProfileByName(
  profileName: string,
  deviceId: string,
  moduleName?: string,
  explicitPackageName?: string
): Promise<RunActionResult> {
  const profiles = await listDeviceStateProfiles();
  const profile = profiles.find(item => item.name === profileName);
  if (!profile) {
    return { success: false, message: `Device state profile not found: ${profileName}` };
  }
  return applyDeviceStateProfile(profile, deviceId, moduleName, explicitPackageName);
}

async function applyDeviceStateProfile(
  profile: DeviceStateProfile,
  deviceId: string,
  moduleName?: string,
  explicitPackageName?: string
): Promise<RunActionResult> {
  const warnings: string[] = [];

  if (profile.network === 'enabled') {
    const net = await enableNetwork(deviceId);
    if (!net.success) {
      warnings.push(`Network enable failed: ${net.message}`);
    }
  } else if (profile.network === 'disabled') {
    const net = await disableNetwork(deviceId);
    if (!net.success) {
      warnings.push(`Network disable failed: ${net.message}`);
    }
  }

  const batteryLevel = await AdbService.setBatteryLevel(deviceId, profile.batteryLevel);
  if (!batteryLevel.success) {
    warnings.push(batteryLevel.message);
  }
  const batteryStatus = await AdbService.setBatteryStatus(deviceId, profile.batteryStatus === 'unknown' ? 'charging' : profile.batteryStatus);
  if (!batteryStatus.success) {
    warnings.push(batteryStatus.message);
  }

  if (profile.locale && profile.locale !== 'unknown') {
    const localeOk = await writeShell(deviceId, 'setprop', 'persist.sys.locale', profile.locale);
    if (!localeOk) {
      warnings.push('Locale update failed (requires elevated permissions on some devices).');
    }
  }

  const animWindowOk = await writeShell(deviceId, 'settings', 'put', 'global', 'window_animation_scale', profile.animations.window || '1');
  const animTransOk = await writeShell(deviceId, 'settings', 'put', 'global', 'transition_animation_scale', profile.animations.transition || '1');
  const animAnimatorOk = await writeShell(deviceId, 'settings', 'put', 'global', 'animator_duration_scale', profile.animations.animator || '1');
  if (!animWindowOk || !animTransOk || !animAnimatorOk) {
    warnings.push('Animation scale update failed for one or more settings.');
  }

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const resolvedModule = moduleName || profile.moduleName;
  const packageName = explicitPackageName
    || profile.packageName
    || (workspaceRoot && resolvedModule ? findApplicationId(workspaceRoot, resolvedModule) : undefined)
    || undefined;
  if (packageName && profile.grantedPermissions.length > 0) {
    const sdk = detectSdk();
    for (const permission of profile.grantedPermissions) {
      const grantResult = await execCommand(sdk.adb, ['-s', deviceId, 'shell', 'pm', 'grant', packageName, permission], { timeout: 20_000 });
      if (grantResult.exitCode !== 0) {
        warnings.push(`Permission grant failed (${permission})`);
      }
    }
  }

  return {
    success: true,
    message: warnings.length > 0
      ? `Profile applied with warnings: ${warnings.join(' | ')}`
      : `Profile applied: ${profile.name}`,
  };
}

async function applyDeviceStateProfileCommand(): Promise<void> {
  const profiles = await listDeviceStateProfiles();
  if (profiles.length === 0) {
    showWarning('No device state profiles found. Save one first.');
    return;
  }
  const pickedProfile = await vscode.window.showQuickPick(
    profiles.map(item => ({
      label: item.name,
      description: `${item.deviceId} · ${new Date(item.updatedAt).toLocaleString()}`,
      profileId: item.id,
    })),
    { placeHolder: 'Select device state profile to apply' }
  );
  if (!pickedProfile) {
    return;
  }
  const profile = profiles.find(item => item.id === pickedProfile.profileId);
  if (!profile) {
    return;
  }

  const devices = (await listDevicesDetailed()).filter(d => d.status === 'online');
  if (devices.length === 0) {
    showWarning('No online devices found.');
    return;
  }
  const selected = devices.length === 1
    ? devices[0]
    : await pickDevice(devices, { title: 'Select target device for profile replay' });
  if (!selected) {
    return;
  }

  const result = await applyDeviceStateProfile(profile, selected.id);
  result.success ? showInfo(result.message) : showError(result.message);
}

async function runTestsWithDeviceStateProfileCommand(): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    showError('No workspace folder open.');
    return;
  }
  const moduleName = await selectModule(workspaceRoot);
  if (!moduleName) {
    return;
  }
  const profiles = await listDeviceStateProfiles();
  if (profiles.length === 0) {
    showWarning('No device state profiles found. Save one first.');
    return;
  }
  const pickedProfile = await vscode.window.showQuickPick(
    profiles.map(item => ({ label: item.name, description: `${item.deviceId} · ${new Date(item.updatedAt).toLocaleString()}` })),
    { placeHolder: 'Select state profile for test replay' }
  );
  if (!pickedProfile) {
    return;
  }
  const profile = profiles.find(item => item.name === pickedProfile.label);
  if (!profile) {
    return;
  }

  const devices = (await listDevicesDetailed()).filter(d => d.status === 'online');
  if (devices.length === 0) {
    showWarning('No online devices found.');
    return;
  }
  const pickedDevices = await vscode.window.showQuickPick(
    devices.map(d => ({ label: d.id, description: d.type })),
    {
      placeHolder: 'Select devices to run instrumentation tests on',
      canPickMany: true,
    }
  );
  if (!pickedDevices || pickedDevices.length === 0) {
    return;
  }
  const runner = await vscode.window.showInputBox({
    prompt: 'Instrumentation runner',
    placeHolder: 'com.example.test/androidx.test.runner.AndroidJUnitRunner',
  });
  if (!runner?.trim()) {
    showWarning('Instrumentation runner is required.');
    return;
  }

  const channel = vscode.window.createOutputChannel('Android Test Replay');
  channel.clear();
  channel.show(true);
  channel.appendLine(`Test replay profile: ${profile.name}`);
  channel.appendLine(`Module: ${moduleName}`);
  channel.appendLine('');

  for (const device of pickedDevices) {
    channel.appendLine(`== ${device.label} ==`);
    const applied = await applyDeviceStateProfile(profile, device.label, moduleName);
    channel.appendLine(applied.message);
    const test = await AdbService.runInstrumentation(device.label, runner.trim());
    channel.appendLine(test.success ? '[PASS] Instrumentation finished' : '[FAIL] Instrumentation failed');
    channel.appendLine((test.data || test.message || '').split('\n').slice(-25).join('\n'));
    channel.appendLine('');
  }
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
  if (!deviceId) return;
  const result = await recoverAdbDevice(deviceId);
  if (!result.success) throw new Error(result.message);
}
async function waitForDeviceWithRetry(deviceId: string): Promise<void> {
  const policy = getAutoRetryPolicy();
  const attempts = policy.enabled ? Math.max(1, policy.maxRetries + 1) : 1;
  let lastErr = '';
  for (let i = 0; i < attempts; i += 1) {
    const sdk = detectSdk();
    const res = await execCommand(sdk.adb, ['-s', deviceId, 'wait-for-device'], { timeout: 30_000 });
    if (res.exitCode === 0) {
      return;
    }
    lastErr = res.stderr || res.stdout || 'wait-for-device failed';
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(lastErr);
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
  return withSlowPathTrace(
    'startApp',
    async () => {
      let result = await AdbService.startApp(deviceId, packageName);
      if (result.success) {
        return result;
      }
      if (isAdbConnectionIssue(result.message)) {
        await recoverAdbConnection(deviceId);
        result = await AdbService.startApp(deviceId, packageName);
      }
      return result;
    },
    result => result.success
  );
}
async function installApkWithRetryForDevice(deviceId: string, apkPath: string): Promise<{ success: boolean; message: string; attempts: number }> {
  const policy = getAutoRetryPolicy();
  const attemptsMax = policy.enabled ? Math.max(1, policy.maxRetries + 1) : 1;
  let attempts = 0;
  let message = '';
  for (let i = 0; i < attemptsMax; i += 1) {
    attempts += 1;
    const attempt = await AdbService.installApk(deviceId, apkPath);
    message = attempt.message;
    if (attempt.success) {
      return { success: true, message: attempt.message, attempts };
    }
    if (!isAdbConnectionIssue(attempt.message)) {
      return { success: false, message: attempt.message, attempts };
    }
    await recoverAdbConnection(deviceId);
    await waitForDeviceWithRetry(deviceId);
  }
  return { success: false, message, attempts };
}
async function installVariant(
  workspaceRoot: string,
  moduleName: string,
  variant: string,
  deviceId: string,
  gradleArgs: string[] = [],
  env?: NodeJS.ProcessEnv
): Promise<boolean> {
  return withSlowPathTrace(
    'installVariant',
    async () => {
      const installTask = `:${moduleName}:install${variant}`;
      const availableTasks = await listGradleTasks(workspaceRoot);
      const hasInstallTask = availableTasks.some(t => t.fullName === installTask);
      if (hasInstallTask) {
        const installResult = await runGradleInstallWithRecovery(workspaceRoot, installTask, gradleArgs, env, deviceId);
        showGradleOutput(installTask, installResult, workspaceRoot);
        await captureGradleBottlenecks(installTask, installResult.exitCode, installResult.stdout || '', installResult.stderr || '');
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
        await captureGradleBottlenecks(task, buildResult.exitCode, buildResult.stdout || '', buildResult.stderr || '');
        if (buildResult.exitCode !== 0) {
          const gradleMessage = (buildResult.stderr || buildResult.stdout || '').trim();
          if (!ensureBuildToolsInstalled(workspaceRoot, moduleName, gradleMessage)) {
            return false;
          }
          if (gradleMessage) {
            const summary = summarizeGradleError(gradleMessage);
            const meta = gradleReasonMetaSummary();
            void showActionableError({
              title: `Gradle build failed for ${moduleName}:${variant}.`,
              why: firstReadableLine(summary) || firstReadableLine(gradleMessage),
              suggestions: [
                ...meta.suggestions,
                'Open Android Gradle Output to inspect full stacktrace.',
              ],
              actions: [
                {
                  label: 'Open Gradle Output',
                  action: async () => vscode.commands.executeCommand('android-toolkit.showGradleOutput'),
                },
                {
                  label: 'Select Variant',
                  action: async () => vscode.commands.executeCommand('android-toolkit.selectBuildVariant'),
                },
              ],
            });
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
      const result = await installApkWithRetryForDevice(deviceId, apkPath);
      if (result.success) {
        return true;
      }
      if (/INSTALL_FAILED_UPDATE_INCOMPATIBLE/i.test(result.message)) {
        const packageName = findApplicationId(workspaceRoot, moduleName);
        if (packageName) {
          await AdbService.uninstallApp(deviceId, packageName);
          const retry = await installApkWithRetryForDevice(deviceId, apkPath);
          if (retry.success) {
            return true;
          }
          showError(retry.message);
          return false;
        }
      }
      showError(result.message);
      return false;
    },
    result => result
  );
}
async function runAppOnTarget(workspaceRoot: string, moduleName: string, variant: string, deviceId: string): Promise<void> {
  const installed = await installVariant(workspaceRoot, moduleName, variant, deviceId);
  if (!installed) {
    await showInstallFailureMessage();
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
    if (!result.success) {
      showError(result.message);
      return;
    }
    const process = await waitForAppPid(deviceId, packageName as string);
    if (!process.pid) {
      showError(`Launch command completed, but ${packageName} did not stay running. ${process.error || ''}`.trim());
      return;
    }
    showInfo(`${result.message} Verified process PID ${process.pid}.`);
  });
}

async function openLogcatAndFilterForApp(deviceId: string): Promise<void> {
  if (!extensionContext) {
    return;
  }
  const { LogcatPanel } = require('./logcat/logcatPanel');
  const panel = LogcatPanel.createOrShow(extensionContext.extensionUri, extensionContext);
  if (panel && typeof panel.focusDeviceAndFilterApp === 'function') {
    await panel.focusDeviceAndFilterApp(deviceId);
  }
}

async function runCrashReproFlow(workspaceRoot: string, moduleName: string, deviceId: string): Promise<RunActionResult> {
  if (!deviceId) {
    return { success: false, message: 'Select a device first.' };
  }
  const packageName = findApplicationId(workspaceRoot, moduleName);
  if (!packageName) {
    return { success: false, message: 'Cannot resolve applicationId from project.' };
  }
  const stopRes = await AdbService.forceStopApp(deviceId, packageName);
  if (!stopRes.success) {
    return { success: false, message: stopRes.message };
  }
  const clearRes = await AdbService.clearAppData(deviceId, packageName);
  if (!clearRes.success) {
    return { success: false, message: clearRes.message };
  }
  const startRes = await startAppWithRecovery(deviceId, packageName);
  if (!startRes.success) {
    return { success: false, message: startRes.message };
  }
  try {
    const logcat = await collectLogcatSnapshot(deviceId, packageName);
    appendCrashAnrRecords(
      extractCrashAnrRecordsFromLogcat(logcat, {
        moduleName,
        deviceId,
        source: 'crash-repro',
      })
    );
  } catch {
    // best effort
  }
  await openLogcatAndFilterForApp(deviceId);
  return { success: true, message: 'Crash repro flow completed: clear data, stop, launch, and logcat app filter started.' };
}

async function collectLogcatSnapshot(deviceId: string, packageName?: string): Promise<string> {
  const sdk = detectSdk();
  if (!deviceId) {
    return 'No device selected.';
  }
  let pid = '';
  if (packageName) {
    const pidRes = await execCommand(sdk.adb, ['-s', deviceId, 'shell', 'pidof', packageName], { timeout: 5000 });
    pid = (pidRes.stdout || '').trim().split(/\s+/)[0] || '';
  }
  const args = ['-s', deviceId, 'logcat', '-d', '-v', 'threadtime'];
  if (pid) {
    args.push('--pid', pid);
  }
  const result = await execCommand(sdk.adb, args, { timeout: 60_000 });
  const raw = result.stdout || result.stderr || '';
  const maxBytes = 1_500_000;
  const softLines = 3500;
  const hardLines = 6000;
  const lines = raw.split('\n');
  let sliceStart = Math.max(0, lines.length - softLines);
  let out = lines.slice(sliceStart).join('\n');
  if (Buffer.byteLength(out, 'utf8') > maxBytes) {
    const bytesPerLine = Math.max(24, Math.floor(Buffer.byteLength(out, 'utf8') / Math.max(1, lines.length - sliceStart)));
    const allowedLines = Math.max(300, Math.min(hardLines, Math.floor(maxBytes / bytesPerLine)));
    sliceStart = Math.max(0, lines.length - allowedLines);
    out = lines.slice(sliceStart).join('\n');
  }
  if (Buffer.byteLength(out, 'utf8') > maxBytes) {
    out = out.slice(Math.max(0, out.length - maxBytes));
  }
  return out;
}

async function exportRunArtifactsBundle(
  workspaceRoot: string,
  moduleName: string,
  variant: string,
  deviceId: string,
  options?: { includeDiagnostics?: boolean }
): Promise<RunActionResult> {
  if (!deviceId) {
    return { success: false, message: 'Select a device first.' };
  }
  const packageName = findApplicationId(workspaceRoot, moduleName);
  const saveUri = await vscode.window.showSaveDialog({
    title: 'Export Run Artifacts Bundle',
    defaultUri: vscode.Uri.file(path.join(workspaceRoot, `run-artifacts-${moduleName}-${variant}-${Date.now()}.zip`)),
    filters: { Zip: ['zip'] },
    saveLabel: 'Export',
  });
  if (!saveUri) {
    return { success: false, message: 'Export canceled.' };
  }
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Exporting run artifacts bundle',
      cancellable: false,
    },
    async progress => {
      const zip = new JSZip();
      progress.report({ increment: 10, message: 'Collecting Gradle output…' });
      const gradle = getLastGradleOutputSnapshot();
      if (gradle) {
        zip.file(
          'gradle-output.txt',
          `Task: ${gradle.task}\nExit code: ${gradle.exitCode}\nTimestamp: ${new Date(gradle.renderedAt).toISOString()}\n\nSTDOUT:\n${gradle.stdout}\n\nSTDERR:\n${gradle.stderr}\n`
        );
      } else {
        zip.file('gradle-output.txt', 'No Gradle output captured yet.');
      }
      progress.report({ increment: 20, message: 'Collecting logcat snapshot…' });
      const logcat = await collectLogcatSnapshot(deviceId, packageName);
      zip.file('logcat-selected.txt', logcat || 'No logcat data captured.');
      appendCrashAnrRecords(
        extractCrashAnrRecordsFromLogcat(logcat, {
          moduleName,
          deviceId,
          source: 'artifacts-export',
        })
      );
      progress.report({ increment: 20, message: 'Collecting device info…' });
      try {
        const deviceProps = await AdbService.getDeviceProperties(deviceId);
        const storage = await AdbService.getStorageInfo(deviceId);
        const battery = await AdbService.getBatteryInfo(deviceId);
        zip.file(
          'device-info.json',
          JSON.stringify(
            {
              deviceId,
              moduleName,
              variant,
              packageName,
              capturedAt: new Date().toISOString(),
              deviceProps,
              storage,
              battery,
            },
            null,
            2
          )
        );
      } catch {
        zip.file('device-info.json', JSON.stringify({ deviceId, moduleName, variant, packageName, error: 'Failed to capture device info.' }, null, 2));
      }
      zip.file(
        'run-context.json',
        JSON.stringify(
          {
            workspaceRoot,
            moduleName,
            variant,
            packageName,
            deviceId,
            platform: os.platform(),
            exportedAt: new Date().toISOString(),
          },
          null,
          2
        )
      );
      if (options?.includeDiagnostics !== false) {
        progress.report({ increment: 10, message: 'Collecting diagnostics snapshot…' });
        const diagnosticsLines = await buildDiagnosticsSnapshotLines();
        zip.file('diagnostics.md', diagnosticsLines.join('\n'));
        zip.file('run-failure-report.md', buildRunFailureReport(runFailureRecords));
        zip.file('action-replay.md', buildActionReplayLines(160).join('\n'));
        zip.file(
          'session-timeline.json',
          JSON.stringify(listTimeline(240), null, 2)
        );
      }
      progress.report({ increment: 10, message: 'Compressing zip…' });
      const content = await zip.generateAsync(
        { type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } },
        (meta) => {
          const pct = Math.max(0, Math.min(100, Math.floor(meta.percent)));
          progress.report({ message: `Compressing… ${pct}%` });
        }
      );
      progress.report({ increment: 10, message: 'Writing file…' });
      await vscode.workspace.fs.writeFile(saveUri, content);
    }
  );
  return { success: true, message: `Run artifacts bundle exported: ${saveUri.fsPath}` };
}
async function exportDiagnosticsBundleCommand(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    showError('No workspace folder open.');
    return;
  }
  const workspaceRoot = workspaceFolder.uri.fsPath;
  const moduleName = (await getSelectedModule()) || (await selectModule(workspaceRoot));
  if (!moduleName) {
    showWarning('No module selected.');
    return;
  }
  const variant = await getSelectedVariant(moduleName);
  let deviceId = await getSelectedDeviceId();
  if (!deviceId) {
    const devices = await listDevicesDetailed();
    const online = devices.filter(device => device.status === 'online');
    if (online.length === 0) {
      showWarning('No online devices found.');
      return;
    }
    const picked = online.length === 1 ? online[0] : await pickDevice(online, { title: 'Select Device for Diagnostics Bundle' });
    if (!picked) {
      return;
    }
    deviceId = picked.id;
  }
  const result = await exportRunArtifactsBundle(workspaceRoot, moduleName, variant, deviceId, { includeDiagnostics: true });
  result.success ? showInfo(result.message) : showWarning(result.message);
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
    await showInstallFailureMessage();
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
async function executeDeviceFarmPreset(preset: DeviceFarmPreset): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    showError('No workspace folder open.');
    return;
  }
  const workspaceRoot = workspaceFolder.uri.fsPath;
  const devices = await listDevicesDetailed();
  const online = devices.filter(device => device.status === 'online');
  if (online.length === 0) {
    showWarning('No online devices found.');
    return;
  }
  const selectedDevices = online.filter(device => preset.deviceIds.includes(device.id));
  if (selectedDevices.length === 0) {
    showWarning(`Preset "${preset.name}" has no online devices. Reconfigure preset or launch devices first.`);
    return;
  }
  const moduleName = preset.moduleName || 'app';
  const variant = preset.variant || 'Debug';
  const output = vscode.window.createOutputChannel(`Android Device Farm: ${preset.name}`);
  output.clear();
  output.appendLine(`Preset: ${preset.name}`);
  output.appendLine(`Mode: ${preset.mode}`);
  output.appendLine(`Module: ${moduleName}`);
  output.appendLine(`Variant: ${variant}`);
  output.appendLine(`Devices: ${selectedDevices.map(device => device.id).join(', ')}`);
  output.appendLine('');
  let apkPath = '';
  if (preset.mode === 'install' || preset.mode === 'run' || preset.mode === 'smoke') {
    const built = await buildVariant(workspaceRoot, moduleName, variant);
    if (!built) {
      showError('Device Farm preset build failed.');
      output.show(true);
      return;
    }
    const foundApk = findLatestApk(workspaceRoot, moduleName, variant);
    if (!foundApk) {
      showError(`APK not found for ${moduleName}:${variant}.`);
      output.show(true);
      return;
    }
    apkPath = foundApk;
  }
  const packageName = preset.packageName || findApplicationId(workspaceRoot, moduleName) || '';
  const runner = preset.runner || '';
  if (preset.mode === 'tests' && !runner) {
    showError(`Preset "${preset.name}" requires instrumentation runner.`);
    return;
  }
  if (preset.mode === 'smoke' && !packageName) {
    showError(`Preset "${preset.name}" requires package name for smoke run.`);
    return;
  }
  const results = await Promise.all(selectedDevices.map(async (device) => {
    if (preset.mode === 'install') {
      const install = await installApkWithRetryForDevice(device.id, apkPath);
      return { deviceId: device.id, ok: install.success, message: install.message };
    }
    if (preset.mode === 'run') {
      const install = await installApkWithRetryForDevice(device.id, apkPath);
      if (!install.success) {
        return { deviceId: device.id, ok: false, message: install.message };
      }
      if (!packageName) {
        return { deviceId: device.id, ok: true, message: 'Installed (package name not set, launch skipped).' };
      }
      const start = await AdbService.startApp(device.id, packageName);
      return { deviceId: device.id, ok: start.success, message: start.message };
    }
    if (preset.mode === 'smoke') {
      const install = await installApkWithRetryForDevice(device.id, apkPath);
      if (!install.success) {
        return { deviceId: device.id, ok: false, message: install.message };
      }
      const start = await AdbService.startApp(device.id, packageName);
      if (!start.success) {
        return { deviceId: device.id, ok: false, message: start.message };
      }
      const stop = await AdbService.forceStopApp(device.id, packageName);
      return {
        deviceId: device.id,
        ok: stop.success,
        message: stop.success ? 'Smoke run passed (install/start/stop).' : stop.message,
      };
    }
    const test = await AdbService.runInstrumentation(device.id, runner);
    return {
      deviceId: device.id,
      ok: test.success,
      message: (test.data || test.message).split('\n').slice(-20).join('\n'),
    };
  }));
  let failed = 0;
  for (const result of results) {
    output.appendLine(`${result.ok ? '[OK]' : '[FAIL]'} ${result.deviceId} - ${result.message}`);
    if (!result.ok) {
      failed += 1;
    }
  }
  output.show(true);
  if (failed > 0) {
    showWarning(`Preset "${preset.name}" finished with ${failed} failure(s).`);
  } else {
    showInfo(`Preset "${preset.name}" completed successfully.`);
  }
}
async function configureDeviceFarmPresetCommand(): Promise<void> {
  if (!extensionContext) {
    return;
  }
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    showError('No workspace folder open.');
    return;
  }
  const existing = getDeviceFarmPresets(extensionContext);
  const presetPick = await vscode.window.showQuickPick(
    [
      ...existing.map(preset => ({
        label: preset.name,
        description: `${preset.mode} • ${preset.moduleName}:${preset.variant}`,
        value: preset,
      })),
      { label: 'Create Custom Preset', description: 'Add a new device farm preset', value: undefined as DeviceFarmPreset | undefined },
    ],
    { placeHolder: 'Select preset to configure' }
  );
  if (!presetPick) {
    return;
  }
  let preset = presetPick.value;
  if (!preset) {
    const name = await vscode.window.showInputBox({
      prompt: 'Preset name',
      placeHolder: 'Nightly QA',
      validateInput: (value) => value.trim().length > 0 ? undefined : 'Preset name is required',
    });
    if (!name) {
      return;
    }
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `preset-${Date.now()}`;
    preset = {
      id: `${id}-${Date.now()}`,
      name: name.trim(),
      mode: 'run',
      moduleName: 'app',
      variant: 'Debug',
      deviceIds: [],
    };
  }
  const modePick = await vscode.window.showQuickPick(
    [
      { label: 'Install', value: 'install' as const },
      { label: 'Run', value: 'run' as const },
      { label: 'Smoke', value: 'smoke' as const },
      { label: 'Tests', value: 'tests' as const },
    ],
    { placeHolder: 'Select preset mode' }
  );
  if (!modePick) {
    return;
  }
  const modules = findApplicationModules(workspaceRoot);
  if (modules.length === 0) {
    showError('No Android application modules found.');
    return;
  }
  const modulePick = await vscode.window.showQuickPick(
    modules.map(moduleName => ({ label: moduleName, value: moduleName })),
    { placeHolder: 'Select preset module' }
  );
  if (!modulePick) {
    return;
  }
  const availableVariants = await getAvailableVariants(workspaceRoot, modulePick.value);
  const variantPick = await vscode.window.showQuickPick(
    (availableVariants.length > 0 ? availableVariants : ['Debug', 'Release']).map(variant => ({ label: variant, value: variant })),
    { placeHolder: 'Select preset variant' }
  );
  if (!variantPick) {
    return;
  }
  const devices = await listDevicesDetailed();
  const online = devices.filter(device => device.status === 'online');
  if (online.length === 0) {
    showWarning('No online devices found.');
    return;
  }
  const selectedDevices = await vscode.window.showQuickPick(
    online.map(device => ({
      label: device.id,
      description: device.type,
      picked: preset.deviceIds.includes(device.id),
      value: device.id,
    })),
    { placeHolder: 'Select devices for this preset', canPickMany: true }
  );
  if (!selectedDevices || selectedDevices.length === 0) {
    showWarning('Preset needs at least one device.');
    return;
  }
  let packageName = preset.packageName;
  if (modePick.value === 'run' || modePick.value === 'smoke') {
    packageName = await vscode.window.showInputBox({
      prompt: 'Package name (optional for Run, required for Smoke)',
      value: preset.packageName || findApplicationId(workspaceRoot, modulePick.value) || '',
    });
    if (modePick.value === 'smoke' && !packageName) {
      showWarning('Smoke mode requires package name.');
      return;
    }
  }
  let runner = preset.runner;
  if (modePick.value === 'tests') {
    runner = await vscode.window.showInputBox({
      prompt: 'Instrumentation runner',
      value: preset.runner || 'com.example.test/androidx.test.runner.AndroidJUnitRunner',
    });
    if (!runner) {
      showWarning('Tests mode requires runner.');
      return;
    }
  }
  const nextPreset: DeviceFarmPreset = {
    ...preset,
    mode: modePick.value,
    moduleName: modulePick.value,
    variant: variantPick.value,
    deviceIds: selectedDevices.map(item => item.value),
    packageName: packageName?.trim() || undefined,
    runner: runner?.trim() || undefined,
  };
  await upsertDeviceFarmPreset(extensionContext, nextPreset);
  showInfo(`Device Farm preset saved: ${nextPreset.name}`);
}
async function runDeviceFarmPresetCommand(presetId?: string): Promise<void> {
  if (!extensionContext) {
    return;
  }
  const presets = getDeviceFarmPresets(extensionContext);
  if (presets.length === 0) {
    showWarning('No device farm presets found. Configure one first.');
    return;
  }
  let preset = presetId ? presets.find(item => item.id === presetId) : undefined;
  if (!preset) {
    const pick = await vscode.window.showQuickPick(
      presets.map(item => ({
        label: item.name,
        description: `${item.mode} • ${item.moduleName}:${item.variant} • ${item.deviceIds.length} device(s)`,
        value: item,
      })),
      { placeHolder: 'Select Device Farm preset to run' }
    );
    preset = pick?.value;
  }
  if (!preset) {
    return;
  }
  await executeDeviceFarmPreset(preset);
}
async function deleteDeviceFarmPresetCommand(): Promise<void> {
  if (!extensionContext) {
    return;
  }
  const presets = getDeviceFarmPresets(extensionContext).filter(item => !['qa', 'release', 'smoke'].includes(item.id));
  if (presets.length === 0) {
    showWarning('No custom Device Farm presets to delete.');
    return;
  }
  const pick = await vscode.window.showQuickPick(
    presets.map(item => ({
      label: item.name,
      description: `${item.mode} • ${item.moduleName}:${item.variant}`,
      value: item,
    })),
    { placeHolder: 'Select custom preset to delete' }
  );
  if (!pick) {
    return;
  }
  await removeDeviceFarmPreset(extensionContext, pick.value.id);
  showInfo(`Device Farm preset deleted: ${pick.value.name}`);
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
  const { validateManifest } = lazyLoad<typeof import('./projectView/manifestTools')>('./projectView/manifestTools');
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
  if (fixId === 'copyFixCommand') {
    const commands = lastFixCommandHints.length > 0
      ? lastFixCommandHints
      : extractCommandCandidates(lastGradleErrorSummary);
    if (commands.length === 0) {
      return { success: false, message: 'No fix command available for this error.' };
    }
    let command = commands[0];
    if (commands.length > 1) {
      const picked = await vscode.window.showQuickPick(
        commands.map(item => ({ label: item })),
        { placeHolder: 'Select command to copy' }
      );
      command = picked?.label || '';
    }
    if (!command) {
      return { success: false, message: 'Copy command canceled.' };
    }
    await vscode.env.clipboard.writeText(command);
    return { success: true, message: 'Fix command copied to clipboard.' };
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
  if (fixId === 'startEmulator') {
    await vscode.commands.executeCommand('android-toolkit.startEmulator');
    return { success: true, message: 'Emulator start flow opened.' };
  }
  if (fixId === 'openProjectWizard') {
    await vscode.commands.executeCommand('android-toolkit.createProject');
    return { success: true, message: 'Project wizard opened.' };
  }
  if (fixId === 'openLogcatThisApp') {
    await vscode.commands.executeCommand('android-toolkit.logcatThisApp');
    return { success: true, message: 'Logcat opened for the selected app.' };
  }
  if (fixId === 'openRunFailureReport') {
    await vscode.commands.executeCommand('android-toolkit.openRunFailureReport');
    return { success: true, message: 'Run failure report opened.' };
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
  const { FailureInsightsPanel, summarizeFailureInsights } = lazyLoad<typeof import('./insights/failureInsightsPanel')>('./insights/failureInsightsPanel');
  const summary = summarizeFailureInsights(runFailureRecords, runFixAttempts);
  FailureInsightsPanel.createOrShow(summary);
}
function openSloDashboardPanel(): void {
  const { SloDashboardPanel } = lazyLoad<typeof import('./insights/sloDashboardPanel')>('./insights/sloDashboardPanel');
  const summary = summarizeSlo(runActionMetrics, sessionHistory, summarizeCommandBudgets(commandLatencyMetrics));
  SloDashboardPanel.createOrShow(summary, summarizeSlowPaths(slowPathMetrics, TOP_SLOW_PATH_LIMIT));
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
  const firstCommandStartedAt = Date.now();
  await vscode.commands.executeCommand('android-toolkit.openRunPanel');
  const firstCommandLatencyMs = Date.now() - firstCommandStartedAt;
  output.appendLine('[OK] Run panel opened');
  output.appendLine(`[PERF] activationTotalMs=${startupProfilerTotalMs} firstCommandLatencyMs=${firstCommandLatencyMs}`);

  try {
    const online = (await listDevicesDetailed()).filter(d => d.status === 'online');
    output.appendLine(`[INFO] Online devices: ${online.length}`);
    if (online.length > 0) {
      const first = online[0];
      await setSelectedDeviceId(first.id, `${first.id} (${first.type})`);
      output.appendLine(`[OK] Selected device: ${first.id}`);
    } else {
      output.appendLine('[INFO] No online devices available; skipping device selection');
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    output.appendLine(`[WARN] Device discovery skipped: ${msg}`);
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

  try {
    const snapshot = {
      generatedAt: new Date().toISOString(),
      platform: process.platform,
      activationTotalMs: startupProfilerTotalMs,
      firstCommandLatencyMs,
    };
    const snapshotPath = path.join(context.extensionPath, CI_PERF_SNAPSHOT_RELATIVE_PATH);
    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8');
    output.appendLine(`[OK] CI perf snapshot written: ${snapshotPath}`);
  } catch (error) {
    output.appendLine(`[WARN] Failed to persist CI perf snapshot: ${error instanceof Error ? error.message : String(error)}`);
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
  getControlProvider: () => EmulatorControlProvider | undefined
): vscode.Disposable[] {
  return [
    registerCommand(
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
        getControlProvider()?.refresh();
      }
    ),
    registerCommand(
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
    registerCommand(
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
        getControlProvider()?.refresh();
        refreshStatusBar();
      }
    ),
    registerCommand(
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
        getControlProvider()?.refresh();
        refreshStatusBar();
      }
    ),
    registerCommand(
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
        getControlProvider()?.refresh();
        refreshStatusBar();
      }
    ),
    registerCommand(
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
        getControlProvider()?.refresh();
      }
    ),
  ];
}

export function activate(context: vscode.ExtensionContext): void {
  const activationStartedAt = Date.now();
  startupProfilerEntries.length = 0;
  extensionContext = context;
  
  // OPTIMIZATION: Limit persisted startup entries to last 5 (saves memory)
  const persistedStartupEntries = context.globalState.get<StartupProfilerEntry[]>(STARTUP_PROFILER_ENTRIES_KEY, [])
    .slice(-5);
  startupProfilerEntries.splice(0, startupProfilerEntries.length, ...persistedStartupEntries);
  startupProfilerTotalMs = context.globalState.get<number>(STARTUP_PROFILER_TOTAL_KEY, 0);
  
  // OPTIMIZATION: Limit session history to 50 entries and cleanup stale data (>30 days old)
  const MAX_SESSION_HISTORY = 50;
  const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
  const persistedSessions = context.globalState.get<SessionRecord[]>(SESSION_HISTORY_KEY, [])
    .filter(s => Date.now() - s.startedAt < SESSION_MAX_AGE_MS)
    .slice(0, MAX_SESSION_HISTORY);
  if (persistedSessions.length > 0) {
    sessionHistory.splice(0, sessionHistory.length, ...persistedSessions);
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
  let controlProvider: EmulatorControlProvider | undefined;
  let deviceManagerProvider: DeviceManagerProvider | undefined;
  let deviceFileExplorerProvider: DeviceFileExplorerProvider | undefined;
  let gradleTasksProvider: GradleTasksProvider | undefined;
  const { projectProvider, ensureAuxiliaryViewsInitialized } = registerAndroidViews(context, views => {
    controlProvider = views.controlProvider;
    deviceManagerProvider = views.deviceManagerProvider;
    deviceFileExplorerProvider = views.deviceFileExplorerProvider;
    gradleTasksProvider = views.gradleTasksProvider;
    problemsProvider = views.problemsProvider;
  });
  setTimeout(() => ensureAuxiliaryViewsInitialized(), 1500);
  recordStartupPhase('views:register', tViews, activationStartedAt);
  logPerf('activate:registerViews', Date.now() - activationStartedAt);
  const autoSyncEnabled = vscode.workspace.getConfiguration('androidToolkit').get<boolean>('sync.autoSync.enabled', true);
  const autoSyncInterval = vscode.workspace.getConfiguration('androidToolkit').get<number>('sync.autoSync.intervalMs', 4000);
  let lastDeviceFingerprint = '';
  let autoSyncInFlight = false;
  let autoSyncQueued = false;
  let autoSyncRefreshTimer: NodeJS.Timeout | undefined;
  const scheduleAutoSyncRefresh = (): void => {
    if (autoSyncRefreshTimer) {
      return;
    }
    autoSyncRefreshTimer = setTimeout(() => {
      autoSyncRefreshTimer = undefined;
      const refreshStartedAt = Date.now();
      invalidateFastCaches();
      projectProvider.refresh();
      controlProvider?.refresh();
      deviceManagerProvider?.refresh();
      deviceFileExplorerProvider?.refresh();
      refreshStatusBar();
      trackSlowPathMetric('autoSyncRefreshFanout', Date.now() - refreshStartedAt, true);
    }, 180);
  };
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
      scheduleAutoSyncRefresh();
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
    // OPTIMIZATION: Increase autoSync interval from 4000ms to 6000ms (33% less load)
    const optimizedAutoSyncInterval = Math.max(6000, autoSyncInterval);
    backgroundScheduler.register(
      'autoSync',
      optimizedAutoSyncInterval,
      async () => {
        await runAutoSyncTick();
      },
      {
        shouldRun: () => vscode.window.state.focused && RunPanel.isVisible,
      }
    );
    backgroundScheduler.start('autoSync');
    context.subscriptions.push(new vscode.Disposable(() => {
      backgroundScheduler.stop('autoSync');
      if (autoSyncRefreshTimer) {
        clearTimeout(autoSyncRefreshTimer);
        autoSyncRefreshTimer = undefined;
      }
    }));
  }
  // OPTIMIZATION: Increase statusBar refresh from 5s to 8s (reduces CPU ~37.5%)
  backgroundScheduler.register(
    'statusBarRefresh',
    8000,
    async () => {
      refreshStatusBar();
    },
    {
      shouldRun: () => vscode.window.state.focused,
    }
  );
  backgroundScheduler.start('statusBarRefresh');
  context.subscriptions.push(new vscode.Disposable(() => backgroundScheduler.stop('statusBarRefresh')));
  // OPTIMIZATION: Increase idle warmup interval from 12s to 15s
  let idleWarmupCompleted = false;
  backgroundScheduler.register(
    'idleWarmup',
    15_000,
    async () => {
      if (idleWarmupCompleted) {
        return;
      }
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        idleWarmupCompleted = true;
        backgroundScheduler.stop('idleWarmup');
        return;
      }
      await withSlowPathTrace('projectModuleScan', async () => {
        findApplicationModulesCached(workspaceRoot, 20_000);
      });
      await listGradleTasks(workspaceRoot);
      await listOnlineDevicesCached(2500);
      idleWarmupCompleted = true;
      backgroundScheduler.stop('idleWarmup');
    },
    {
      shouldRun: () => {
        const lastCommandTs = commandLatencyMetrics[0]?.timestamp || 0;
        return vscode.window.state.focused && Date.now() - lastCommandTs > 8_000;
      },
    }
  );
  // OPTIMIZATION: Delay idle warmup from 10s to 15s (avoid startup load)
  setTimeout(() => backgroundScheduler.start('idleWarmup'), 15_000);
  context.subscriptions.push(new vscode.Disposable(() => backgroundScheduler.stop('idleWarmup')));
  const tLanguage = Date.now();
  let xmlLivePreviewController: XmlLivePreviewController | undefined;
  let xmlLintController: AndroidLayoutLintController | undefined;
  const registerLanguageProviders = (): void => {
    if (xmlLivePreviewController && xmlLintController) {
      return;
    }
    xmlLivePreviewController = new XmlLivePreviewController();
    xmlLintController = new AndroidLayoutLintController();
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
  };
  const isLanguageProviderTarget = (doc: vscode.TextDocument | undefined): boolean => {
    if (!doc) {
      return false;
    }
    if (doc.uri.scheme !== 'file') {
      return false;
    }
    if (doc.languageId === 'xml' || doc.languageId === 'gradle') {
      return true;
    }
    return /\.gradle\.kts$/i.test(doc.uri.fsPath);
  };
  const maybeRegisterLanguageProviders = (doc: vscode.TextDocument | undefined): void => {
    if (!doc) {
      return;
    }
    if (!isLanguageProviderTarget(doc)) {
      return;
    }
    registerLanguageProviders();
  };
  const ensureLanguageControllers = (): void => {
    if (!xmlLivePreviewController || !xmlLintController) {
      registerLanguageProviders();
    }
  };
  maybeRegisterLanguageProviders(vscode.window.activeTextEditor?.document);
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc: any) => {
      maybeRegisterLanguageProviders(doc);
    })
  );
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor: any) => {
      maybeRegisterLanguageProviders(editor?.document);
    })
  );
  // Fallback: register after startup if no relevant editor events have fired.
  setTimeout(registerLanguageProviders, 3500);
  const workspaceWatcher = vscode.workspace.onDidChangeWorkspaceFolders(() => {
    invalidateFastCaches();
    projectProvider.refresh();
  });
  context.subscriptions.push(workspaceWatcher);
  const projectViewModeWatcher = vscode.workspace.onDidChangeConfiguration(event => {
    if (!event.affectsConfiguration('androidToolkit.projectView.mode')) {
      return;
    }
    const configured = vscode.workspace.getConfiguration('androidToolkit').get<string>('projectView.mode', 'android');
    const next = configured === 'files' || configured === 'packages' ? configured : 'android';
    projectProvider.setViewMode(next);
  });
  context.subscriptions.push(projectViewModeWatcher);
  const workspaceFileWatcher = vscode.workspace.createFileSystemWatcher('**/{settings.gradle,settings.gradle.kts,build.gradle,build.gradle.kts,gradle.properties,local.properties,AndroidManifest.xml}');
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
    registerCommand('android-toolkit.listDevices', listDevicesCommand),
    registerCommand('android-toolkit.startEmulator', startEmulatorCommand),
    registerCommand('android-toolkit.stopEmulator', stopEmulatorCommand),
    registerCommand('android-toolkit.createEmulator', createEmulatorCommand),
    registerCommand('android-toolkit.refreshProjectView', () => projectProvider.refresh()),
    registerCommand('android-toolkit.setProjectViewMode', async () => {
      const current = projectProvider.getViewMode();
      const picked = await vscode.window.showQuickPick(
        [
          { label: 'Android', description: 'Logical groups: Manifests / Java / Res / Assets / Gradle', value: 'android' as const },
          { label: 'Project Files', description: 'Real filesystem tree', value: 'files' as const },
          { label: 'Packages', description: 'Java/Kotlin package-oriented tree', value: 'packages' as const },
        ],
        {
          placeHolder: `Current mode: ${current}. Select project tree mode`,
        }
      );
      if (!picked) {
        return;
      }
      const target = vscode.workspace.workspaceFolders?.length
        ? vscode.ConfigurationTarget.Workspace
        : vscode.ConfigurationTarget.Global;
      await vscode.workspace.getConfiguration('androidToolkit').update('projectView.mode', picked.value, target);
      projectProvider.setViewMode(picked.value);
      showInfo(`Project view mode: ${picked.label}`);
    }),
    registerCommand('android-toolkit.openInExplorer', (item: ProjectTreeItem) => {
      if (item.data.resourceUri) {
        vscode.commands.executeCommand('revealInExplorer', item.data.resourceUri);
      }
    }),
    registerCommand('android-toolkit.createResource', (item?: ProjectTreeItem) => {
      createResourceFlow(item, projectProvider);
    }),
    registerCommand('android-toolkit.createFolder', (item?: ProjectTreeItem) => {
      createFolderFlow(item, projectProvider);
    }),
    registerCommand('android-toolkit.createAsset', (item?: ProjectTreeItem) => {
      createAssetFlow(item, projectProvider);
    }),
    registerCommand('android-toolkit.createLocale', (item?: ProjectTreeItem) => {
      createLocaleFlow(item, projectProvider);
    }),
    registerCommand('android-toolkit.createClass', (item?: ProjectTreeItem) => {
      const { createClassFlow } = require('./projectView/androidCreator');
      createClassFlow(item, projectProvider);
    }),
    registerCommand('android-toolkit.createFile', (item?: ProjectTreeItem) => {
      createFileCommand(item, projectProvider);
    }),
    registerCommand('android-toolkit.createFolderGeneric', (item?: ProjectTreeItem) => {
      createFolderCommand(item, projectProvider);
    }),
    registerCommand('android-toolkit.renameItem', (item?: ProjectTreeItem) => {
      renameItemCommand(item, projectProvider);
    }),
    registerCommand('android-toolkit.deleteItem', (item?: ProjectTreeItem) => {
      deleteItemCommand(item, projectProvider);
    }),
    registerCommand('android-toolkit.undoLastProjectAction', () => {
      undoLastProjectAction(projectProvider);
    }),
    registerCommand('android-toolkit.createProject', () => {
      createAndroidProjectWizard();
    }),
    registerCommand('android-toolkit.openTemplateGallery', () => {
      openTemplateGallery();
    }),
    registerCommand('android-toolkit.projectBlueprintTemplates', () => {
      runProjectBlueprintTemplatesWizard();
    }),
    registerCommand('android-toolkit.setJdk21Path', async () => {
      const ok = await setJdk21Path();
      if (ok) {
        showInfo('JDK path updated to selected folder.');
      }
    }),
    registerCommand('android-toolkit.cancelActiveOperation', () => {
      operationManager.cancel(RUN_PANEL_SCOPE);
      showInfo('Active operation cancel requested.');
    }),
    registerCommand('android-toolkit.collectDiagnosticsSnapshot', async () => {
      if (!(await ensureFeatureAllowed('diagnostics'))) {
        return;
      }
      ensureDiagnosticsDataLoaded();
      await collectDiagnosticsSnapshot();
    }),
    registerCommand('android-toolkit.projectDoctor', async () => {
      await runProjectDoctorCommand();
    }),
    registerCommand('android-toolkit.openRunFailureReport', async () => {
      if (!(await ensureFeatureAllowed('diagnostics'))) {
        return;
      }
      ensureDiagnosticsDataLoaded();
      await openRunFailureReport();
    }),
    registerCommand('android-toolkit.openCrashAnrTriage', async () => {
      if (!(await ensureFeatureAllowed('diagnostics'))) {
        return;
      }
      ensureDiagnosticsDataLoaded();
      await openCrashAnrTriageReport();
    }),
    registerCommand('android-toolkit.openGradleBottleneckAnalyzer', async () => {
      if (!(await ensureFeatureAllowed('diagnostics'))) {
        return;
      }
      ensureDiagnosticsDataLoaded();
      await openGradleBottleneckAnalyzer();
    }),
    registerCommand('android-toolkit.saveDeviceStateProfile', async () => {
      await saveDeviceStateProfileCommand();
    }),
    registerCommand('android-toolkit.applyDeviceStateProfile', async () => {
      await applyDeviceStateProfileCommand();
    }),
    registerCommand('android-toolkit.listDeviceStateProfiles', async () => {
      const profiles = await listDeviceStateProfiles();
      return profiles.map(item => ({
        id: item.id,
        name: item.name,
        deviceId: item.deviceId,
        moduleName: item.moduleName,
        updatedAt: item.updatedAt,
      }));
    }),
    registerCommand(
      'android-toolkit.applyDeviceStateProfileByName',
      async (payload?: { profileName?: string; deviceId?: string; moduleName?: string; packageName?: string }) => {
        if (!payload?.profileName || !payload?.deviceId) {
          return { success: false, message: 'profileName and deviceId are required.' };
        }
        return applyDeviceStateProfileByName(payload.profileName, payload.deviceId, payload.moduleName, payload.packageName);
      }
    ),
    registerCommand('android-toolkit.runTestsWithDeviceStateProfile', async () => {
      await runTestsWithDeviceStateProfileCommand();
    }),
    registerCommand('android-toolkit.openStartupProfiler', async () => {
      if (!isFeatureAllowed('diagnostics')) {
        void ensureFeatureAllowed('diagnostics');
        return;
      }
      ensureDiagnosticsDataLoaded();
      openStartupProfilerPanel();
    }),
    registerCommand('android-toolkit.openActionReplayReport', async () => {
      if (!(await ensureFeatureAllowed('diagnostics'))) {
        return;
      }
      ensureDiagnosticsDataLoaded();
      await openActionReplayReport();
    }),
    registerCommand('android-toolkit.openLastFailedStep', async () => {
      if (!(await ensureFeatureAllowed('diagnostics'))) {
        return;
      }
      await openLastFailedStepCommand();
    }),
    registerCommand('android-toolkit.exportDiagnosticsBundle', async () => {
      if (!(await ensureFeatureAllowed('diagnostics'))) {
        return;
      }
      ensureDiagnosticsDataLoaded();
      await exportDiagnosticsBundleCommand();
    }),
    registerCommand('android-toolkit.releaseQualityGate', async () => {
      await runReleaseQualityGate();
    }),
    registerCommand('android-toolkit.setUiMode', async () => {
      await setUiModeCommand();
    }),
    registerCommand('android-toolkit.applyConfigProfile', async () => {
      await applyConfigProfileCommand();
    }),
    registerCommand('android-toolkit.configureRunLayout', async () => {
      await configureRunLayoutCommand();
    }),
    registerCommand('android-toolkit.configureKeyboardShortcuts', async () => {
      await configureKeyboardShortcutsCommand();
    }),
    registerCommand('android-toolkit.setKeyboardShortcutProfile', async () => {
      await setKeyboardShortcutProfileCommand();
    }),
    registerCommand('android-toolkit.saveCurrentPanelLayout', async () => {
      await saveCurrentPanelLayoutCommand();
    }),
    registerCommand('android-toolkit.applySavedPanelLayout', async () => {
      await applySavedPanelLayoutCommand();
    }),
    registerCommand('android-toolkit.openSettingsCenter', async () => {
      await openSettingsCenterCommand();
    }),
    registerCommand('android-toolkit.openFailureInsights', () => {
      if (!isFeatureAllowed('diagnostics')) {
        void ensureFeatureAllowed('diagnostics');
        return;
      }
      ensureDiagnosticsDataLoaded();
      openFailureInsightsPanel();
    }),
    registerCommand('android-toolkit.openSloDashboard', () => {
      if (!isFeatureAllowed('diagnostics')) {
        void ensureFeatureAllowed('diagnostics');
        return;
      }
      ensureDiagnosticsDataLoaded();
      openSloDashboardPanel();
    }),
    registerCommand('android-toolkit.openErrorKnowledgeBase', () => {
      if (!isFeatureAllowed('diagnostics')) {
        void ensureFeatureAllowed('diagnostics');
        return;
      }
      ensureDiagnosticsDataLoaded();
      openErrorKnowledgeBasePanel();
    }),
    registerCommand('android-toolkit.exportTeamConfig', async () => {
      await exportTeamSettingsCommand(context);
    }),
    registerCommand('android-toolkit.importTeamConfig', async () => {
      await importTeamSettingsCommand(context);
    }),
    registerCommand('android-toolkit.teamPolicyDriftReport', async () => {
      await openTeamPolicyDriftReportCommand();
    }),
    registerCommand('android-toolkit.performanceRegressionGuardrail', async () => {
      await runPerformanceRegressionGuardrailCommand();
    }),
    registerCommand('android-toolkit.guidedFirstRunSuccessPath', async () => {
      await runGuidedFirstSuccessPathCommand();
    }),
    registerCommand('android-toolkit.whatNext', async () => {
      await openNextActionSurfaceCommand();
    }),
    registerCommand('android-toolkit.openIntelligenceHub', async () => {
      await openIntelligenceHubCommand();
    }),
    registerCommand('android-toolkit.runIntelligenceMatrixSmoke', async () => {
      await runIntelligenceMatrixSmokeCommand();
    }),
    registerCommand('android-toolkit.exportIntelligencePrHeatmap', async () => {
      await exportIntelligencePrHeatmapCommand();
    }),
    registerCommand('android-toolkit.approveReleaseRiskOverride', async () => {
      await approveReleaseRiskOverrideCommand();
    }),
    registerCommand('android-toolkit.enforcePolicyAsCode', async () => {
      await enforcePolicyAsCodeCommand();
    }),
    registerCommand('android-toolkit.replayDeepLinkFuzzCase', async () => {
      await replayDeepLinkFuzzCaseCommand();
    }),
    registerCommand('android-toolkit.runTeamPlaybook', async () => {
      await runTeamPlaybookCommand();
    }),
    registerCommand('android-toolkit.runFocusedPrChecks', async () => {
      await runFocusedPrChecksCommand();
    }),
    registerCommand('android-toolkit.openTelemetryDashboard', async () => {
      await openLocalTelemetryDashboardCommand();
    }),
    registerCommand('android-toolkit.ciSmoke', async () => {
      await runCiSmoke(context);
    }),
    registerCommand('android-toolkit.firstRunHealthWizard', async () => {
      await openFirstRunHealthWizard(true);
    }),
    registerCommand('android-toolkit.openOnboardingV2', async () => {
      await openOnboardingV2Panel(true);
    }),
    registerCommand('android-toolkit.runSelectedAlias', async () => {
      await withCommandBudget('android-toolkit.runSelectedAlias', async () => {
        await withActionReplay('android-toolkit.runSelectedAlias', {}, async () => {
          await runAppOnTargetSelected();
        });
      });
    }),
    registerCommand('android-toolkit.stopSelectedAlias', async () => {
      await stopAppCommand();
    }),
    registerCommand('android-toolkit.logcatThisApp', async () => {
      await vscode.commands.executeCommand('android-toolkit.openLogcat');
      showInfo('In Logcat, click "Only this app".');
    }),
    registerCommand('android-toolkit.runAppOnEmulator', async () => {
      await withCommandBudget('android-toolkit.runAppOnEmulator', async () => {
        await runAppOnEmulator();
      });
    }),
    registerCommand('android-toolkit.selectDevice', () => {
      selectDeviceCommand();
    }),
    registerCommand('android-toolkit.selectModule', () => {
      selectModuleCommand();
    }),
    registerCommand('android-toolkit.runAppOnTargetSelected', async () => {
      await withCommandBudget('android-toolkit.runAppOnTargetSelected', async () => {
        await runAppOnTargetSelected();
      });
    }),
    registerCommand('android-toolkit.stopApp', () => {
      stopAppCommand();
    }),
    registerCommand('android-toolkit.gradleSync', async () => {
      await withCommandBudget('android-toolkit.gradleSync', async () => {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
          showError('No workspace folder open.');
          return;
        }
        invalidateGradleTaskCache(workspaceRoot);
        const result = await runGradleTaskWithResult(workspaceRoot, 'tasks');
        showGradleOutput('tasks', result, workspaceRoot);
        await captureGradleBottlenecks('tasks', result.exitCode, result.stdout || '', result.stderr || '');
        if (result.exitCode === 0) {
          invalidateGradleTaskCache(workspaceRoot);
        }
        result.exitCode === 0 ? showInfo('Gradle sync completed') : showError('Gradle sync failed');
      });
    }),
    registerCommand('android-toolkit.projectHealth', () => {
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
    registerCommand('android-toolkit.runAppOnDevice', async () => {
      await withCommandBudget('android-toolkit.runAppOnDevice', async () => {
        await runAppOnDevice();
      });
    }),
    registerCommand('android-toolkit.selectBuildVariant', async () => {
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
    registerCommand('android-toolkit.gradleAssembleDebug', () => {
      gradleAssembleDebug();
    }),
    registerCommand('android-toolkit.gradleInstallDebug', () => {
      gradleInstallDebug();
    }),
    registerCommand('android-toolkit.gradleClean', () => {
      gradleClean();
    }),
    registerCommand('android-toolkit.openRunPanel', async () => {
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
      type RunPanelLaunchOptions = {
        launchTargetId?: string;
        installDiffMode?: boolean;
        preRunPipeline?: { clean: boolean; assemble: boolean; install: boolean; run: boolean };
      };
      const defaultRunPipeline = { clean: false, assemble: false, install: true, run: true };
      const resolveLaunchTarget = (workspaceRoot: string, moduleName: string, launchTargetId?: string): LaunchTarget | undefined => {
        const packageName = findApplicationId(workspaceRoot, moduleName) || '';
        const targets = listManifestLaunchTargetsCached(workspaceRoot, moduleName, packageName);
        return targets.find(t => t.id === (launchTargetId || 'launcher')) || targets[0];
      };
      const runLaunchTarget = async (
        workspaceRoot: string,
        moduleName: string,
        deviceId: string,
        launchTargetId?: string
      ): Promise<{ success: boolean; message: string }> => {
        const packageName = findApplicationId(workspaceRoot, moduleName);
        if (!packageName) {
          return { success: false, message: 'Cannot resolve applicationId from project.' };
        }
        const launchTarget = resolveLaunchTarget(workspaceRoot, moduleName, launchTargetId);
        if (!launchTarget || launchTarget.type === 'launcher') {
          return startAppWithRecovery(deviceId, packageName);
        }
        if (launchTarget.type === 'deepLink' && launchTarget.deepLink) {
          return AdbService.startDeepLink(deviceId, launchTarget.deepLink, packageName);
        }
        if (launchTarget.type === 'activity' && launchTarget.activity) {
          return AdbService.startActivity(deviceId, packageName, launchTarget.activity, []);
        }
        return startAppWithRecovery(deviceId, packageName);
      };
      const collectInstallDiff = async (
        before: InstallDiffSnapshot | undefined,
        workspaceRoot: string,
        moduleName: string,
        variant: string,
        fallbackPackageName?: string
      ): Promise<{ title: string; lines: string[] } | undefined> => {
        if (!before) {
          return undefined;
        }
        const apkPath = findLatestApk(workspaceRoot, moduleName, variant);
        if (!apkPath) {
          return { title: 'Install Diff', lines: ['Install diff unavailable: APK output not found.'] };
        }
        try {
          const after = await readApkSnapshot(apkPath);
          return buildInstallDiffSummary(before, {
            packageName: after.packageName || fallbackPackageName || before.packageName,
            versionName: after.versionName,
            versionCode: after.versionCode,
            signature: after.signature,
          });
        } catch {
          return { title: 'Install Diff', lines: ['Install diff unavailable: failed to inspect APK metadata.'] };
        }
      };
      const runFlow = async (
        workspaceRoot: string,
        moduleName: string,
        variant: string,
        deviceId: string,
        options?: RunPanelLaunchOptions
      ): Promise<RunActionResult> => {
        const startedAt = Date.now();
        const pipelineState = new RunPipelineMachine();
        pipelineState.transition('preflight');
        pushTimeline({ action: 'Run', stage: 'start', status: 'running', moduleName, variant, deviceId, message: 'Run started' });
        const opId = operationManager.start(RUN_PANEL_SCOPE);
        const shouldCancel = () => operationManager.isCancelled(RUN_PANEL_SCOPE, opId);
        const pipeline = {
          ...defaultRunPipeline,
          ...(options?.preRunPipeline || {}),
        };
        const packageName = findApplicationId(workspaceRoot, moduleName);
        let beforeInstall: InstallDiffSnapshot | undefined;
        if (options?.installDiffMode && pipeline.install && packageName) {
          try {
            beforeInstall = await readInstalledSnapshot(deviceId, packageName);
          } catch {
            beforeInstall = {
              packageName,
              versionName: 'n/a',
              versionCode: 'n/a',
              signature: 'n/a',
            };
          }
        }
        const preflight = await runPreflightChecks(workspaceRoot, moduleName, variant, deviceId, true);
        if (!preflight.ok) {
          operationManager.finish(RUN_PANEL_SCOPE, opId);
          pushTimeline({ action: 'Run', stage: 'preflight', status: 'failed', moduleName, variant, deviceId, durationMs: Date.now() - startedAt, message: preflight.message || 'Preflight failed' });
          return finalizeRunResult('Run', {
            success: false,
            message: preflight.message || 'Preflight checks failed',
            fixSuggestions: preflight.fixes,
          }, moduleName, variant, deviceId, Date.now() - startedAt);
        }
        if (preflight.warnings && preflight.warnings.length > 0) {
          showWarning(`Device health warnings: ${preflight.warnings.join(' | ')}`);
        }
        pipelineState.transition(
          pipeline.clean || pipeline.assemble ? 'build' : pipeline.install ? 'install' : pipeline.run ? 'launch' : 'succeeded'
        );
        let assembleHandledByBatch = false;
        if (pipeline.clean && pipeline.assemble) {
          const tBatch = Date.now();
          const task = `:${moduleName}:assemble${variant}`;
          const batchGuard = await runGuarded(
            'Clean + Assemble APK',
            () => runGradleTaskWithResult(workspaceRoot, 'clean', [task]),
            { timeoutMs: 300_000, retries: 1, shouldCancel }
          );
          if (!batchGuard.ok || !batchGuard.value) {
            operationManager.finish(RUN_PANEL_SCOPE, opId);
            pushTimeline({ action: 'Run', stage: 'clean+assemble', status: 'failed', moduleName, variant, deviceId, durationMs: Date.now() - tBatch, message: 'Pre-run clean+assemble failed' });
            return finalizeRunResult(
              'Run',
              issueToRunResult(batchGuard.issue!, 'Pre-run clean+assemble failed.', fixSuggestionsForGradle()),
              moduleName,
              variant,
              deviceId,
              Date.now() - startedAt
            );
          }
          showGradleOutput(`clean + ${task}`, batchGuard.value, workspaceRoot);
          await captureGradleBottlenecks(`clean + ${task}`, batchGuard.value.exitCode, batchGuard.value.stdout || '', batchGuard.value.stderr || '');
          if (batchGuard.value.exitCode !== 0) {
            operationManager.finish(RUN_PANEL_SCOPE, opId);
            pushTimeline({ action: 'Run', stage: 'clean+assemble', status: 'failed', moduleName, variant, deviceId, durationMs: Date.now() - tBatch, message: 'Gradle clean+assemble failed' });
            return finalizeRunResult('Run', {
              success: false,
              message: 'Pre-run clean+assemble failed.',
              gradleError: summarizeGradleError(batchGuard.value.stderr || batchGuard.value.stdout || ''),
              fixSuggestions: fixSuggestionsForGradle(),
            }, moduleName, variant, deviceId, Date.now() - startedAt);
          }
          pushTimeline({ action: 'Run', stage: 'clean', status: 'success', moduleName, variant, deviceId, durationMs: Date.now() - tBatch, message: 'Pre-run clean completed (batched)' });
          pushTimeline({ action: 'Run', stage: 'assemble', status: 'success', moduleName, variant, deviceId, durationMs: Date.now() - tBatch, message: 'Pre-run assemble completed (batched)' });
          assembleHandledByBatch = true;
        }
        if (pipeline.clean) {
          if (assembleHandledByBatch) {
            // Already executed via single Gradle process.
          } else {
          const tClean = Date.now();
          const cleanGuard = await runGuarded(
            'Clean project',
            () => runGradleTaskWithResult(workspaceRoot, 'clean'),
            { timeoutMs: 240_000, retries: 1, shouldCancel }
          );
          if (!cleanGuard.ok || !cleanGuard.value) {
            operationManager.finish(RUN_PANEL_SCOPE, opId);
            pushTimeline({ action: 'Run', stage: 'clean', status: 'failed', moduleName, variant, deviceId, durationMs: Date.now() - tClean, message: 'Pre-run clean failed' });
            return finalizeRunResult(
              'Run',
              issueToRunResult(cleanGuard.issue!, 'Pre-run clean failed.', fixSuggestionsForGradle()),
              moduleName,
              variant,
              deviceId,
              Date.now() - startedAt
            );
          }
          showGradleOutput('clean', cleanGuard.value, workspaceRoot);
          if (cleanGuard.value.exitCode !== 0) {
            operationManager.finish(RUN_PANEL_SCOPE, opId);
            pushTimeline({ action: 'Run', stage: 'clean', status: 'failed', moduleName, variant, deviceId, durationMs: Date.now() - tClean, message: 'Gradle clean failed' });
            return finalizeRunResult('Run', {
              success: false,
              message: 'Pre-run clean failed.',
              gradleError: summarizeGradleError(cleanGuard.value.stderr || cleanGuard.value.stdout || ''),
              fixSuggestions: fixSuggestionsForGradle(),
            }, moduleName, variant, deviceId, Date.now() - startedAt);
          }
          pushTimeline({ action: 'Run', stage: 'clean', status: 'success', moduleName, variant, deviceId, durationMs: Date.now() - tClean, message: 'Pre-run clean completed' });
          }
        }
        if (pipeline.assemble) {
          if (assembleHandledByBatch) {
            // Already executed via single Gradle process.
          } else {
          const tAssemble = Date.now();
          const buildGuard = await runGuarded(
            'Assemble APK',
            () => buildVariant(workspaceRoot, moduleName, variant),
            { timeoutMs: 240_000, retries: 1, shouldCancel }
          );
          if (!buildGuard.ok || !buildGuard.value) {
            operationManager.finish(RUN_PANEL_SCOPE, opId);
            pushTimeline({ action: 'Run', stage: 'assemble', status: 'failed', moduleName, variant, deviceId, durationMs: Date.now() - tAssemble, message: 'Pre-run assemble failed' });
            return finalizeRunResult(
              'Run',
              issueToRunResult(buildGuard.issue!, 'Pre-run assemble failed.', fixSuggestionsForGradle()),
              moduleName,
              variant,
              deviceId,
              Date.now() - startedAt
            );
          }
          pushTimeline({ action: 'Run', stage: 'assemble', status: 'success', moduleName, variant, deviceId, durationMs: Date.now() - tAssemble, message: 'Pre-run assemble completed' });
          }
        }
        let installDiff: { title: string; lines: string[] } | undefined;
        if (pipeline.install) {
          if (pipelineState.state !== 'install') pipelineState.transition('install');
          const tInstall = Date.now();
          const installGuard = await runGuarded(
            'Install APK',
            () => installVariant(workspaceRoot, moduleName, variant, deviceId),
            { timeoutMs: 240_000, retries: 1, shouldCancel }
          );
          if (!installGuard.ok) {
            operationManager.finish(RUN_PANEL_SCOPE, opId);
            pushTimeline({ action: 'Run', stage: 'install', status: 'failed', moduleName, variant, deviceId, durationMs: Date.now() - tInstall, message: 'Install failed' });
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
            pushTimeline({ action: 'Run', stage: 'install', status: 'failed', moduleName, variant, deviceId, durationMs: Date.now() - tInstall, message: 'Install failed' });
            return finalizeRunResult('Run', {
              success: false,
              message: 'Failed to install app.',
              gradleError: lastGradleErrorSummary,
              errorLocation: lastGradleErrorLocation,
              fixSuggestions: fixSuggestionsForGradle(),
            }, moduleName, variant, deviceId, Date.now() - startedAt);
          }
          if (options?.installDiffMode) {
            installDiff = await collectInstallDiff(beforeInstall, workspaceRoot, moduleName, variant, packageName);
          }
          pushTimeline({ action: 'Run', stage: 'install', status: 'success', moduleName, variant, deviceId, durationMs: Date.now() - tInstall, message: 'Install completed' });
        }
        if (!pipeline.run) {
          operationManager.finish(RUN_PANEL_SCOPE, opId);
          pushTimeline({ action: 'Run', stage: 'pipeline', status: 'success', moduleName, variant, deviceId, durationMs: Date.now() - startedAt, message: 'Run step disabled by pipeline' });
          return finalizeRunResult(
            'Run',
            {
              success: true,
              message: 'Pre-run pipeline completed (launch step disabled).',
              installDiff,
            },
            moduleName,
            variant,
            deviceId,
            Date.now() - startedAt
          );
        }
        if (!packageName) {
          operationManager.finish(RUN_PANEL_SCOPE, opId);
          pushTimeline({ action: 'Run', stage: 'launch', status: 'failed', moduleName, variant, deviceId, durationMs: Date.now() - startedAt, message: 'applicationId missing' });
          return finalizeRunResult('Run', {
            success: false,
            message: 'Cannot resolve applicationId from project.',
            fixSuggestions: [{ id: 'showGradleOutput', label: 'Open Gradle Output' }],
          }, moduleName, variant, deviceId, Date.now() - startedAt);
        }
        const tLaunch = Date.now();
        if (pipelineState.state !== 'launch') pipelineState.transition('launch');
        const startGuard = await runGuarded(
          'Start app',
          () => runLaunchTarget(workspaceRoot, moduleName, deviceId, options?.launchTargetId),
          { timeoutMs: 60_000, retries: 1, shouldCancel }
        );
        if (!startGuard.ok || !startGuard.value) {
          operationManager.finish(RUN_PANEL_SCOPE, opId);
          pushTimeline({ action: 'Run', stage: 'launch', status: 'failed', moduleName, variant, deviceId, durationMs: Date.now() - tLaunch, message: 'Launch failed' });
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
          pushTimeline({ action: 'Run', stage: 'launch', status: 'failed', moduleName, variant, deviceId, durationMs: Date.now() - tLaunch, message: startResult.message });
          return finalizeRunResult('Run', {
            success: false,
            message: startResult.message,
            fixSuggestions: [{ id: 'showGradleOutput', label: 'Open Gradle Output' }],
          }, moduleName, variant, deviceId, Date.now() - startedAt);
        }
        const tVerify = Date.now();
        pipelineState.transition('verify');
        const process = await waitForAppPid(deviceId, packageName, { shouldCancel });
        if (!process.pid) {
          operationManager.finish(RUN_PANEL_SCOPE, opId);
          pushTimeline({
            action: 'Run',
            stage: 'verify',
            status: 'failed',
            moduleName,
            variant,
            deviceId,
            durationMs: Date.now() - tVerify,
            message: process.error || 'App process was not found after launch',
          });
          return finalizeRunResult('Run', {
            success: false,
            message: `Launch command completed, but ${packageName} did not stay running.`,
            gradleError: process.error,
            fixSuggestions: [
              { id: 'openLogcatThisApp', label: 'Open Logcat for this app' },
              { id: 'openRunFailureReport', label: 'Open Run Failure Report' },
            ],
          }, moduleName, variant, deviceId, Date.now() - startedAt);
        }
        pushTimeline({
          action: 'Run',
          stage: 'verify',
          status: 'success',
          moduleName,
          variant,
          deviceId,
          durationMs: Date.now() - tVerify,
          message: `App process is running (PID ${process.pid})`,
        });
        await appendRunHistory({ moduleName, variant, deviceId });
        pipelineState.transition('succeeded');
        operationManager.finish(RUN_PANEL_SCOPE, opId);
        pushTimeline({ action: 'Run', stage: 'finish', status: 'success', moduleName, variant, deviceId, durationMs: Date.now() - startedAt, message: 'Run completed' });
        const warningSuffix = preflight.warnings && preflight.warnings.length > 0
          ? ` Health warnings: ${preflight.warnings.join(' | ')}`
          : '';
        return finalizeRunResult('Run', {
          success: true,
          message: `App started on ${deviceId}.${warningSuffix}`.trim(),
          installDiff,
        }, moduleName, variant, deviceId, Date.now() - startedAt);
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
        getLaunchTargets: async (moduleName: string) => {
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
          if (!workspaceFolder || !moduleName) {
            return [{ id: 'launcher', label: 'Default Launcher Activity', type: 'launcher' as const }];
          }
          const packageName = findApplicationId(workspaceFolder.uri.fsPath, moduleName) || '';
          return listManifestLaunchTargetsCached(workspaceFolder.uri.fsPath, moduleName, packageName);
        },
        setLaunchTarget: async (moduleName: string, launchTargetId: string) => {
          await setSelectedLaunchTarget(moduleName, launchTargetId);
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
          pushTimeline({ action: 'Build', stage: 'start', status: 'running', moduleName, variant: '', deviceId: '', message: 'Build started' });
          const shouldCancel = () => operationManager.isCancelled(RUN_PANEL_SCOPE, opId);
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
          if (!workspaceFolder) {
            operationManager.finish(RUN_PANEL_SCOPE, opId);
            pushTimeline({ action: 'Build', stage: 'start', status: 'failed', moduleName, variant: '', deviceId: '', durationMs: Date.now() - startedAt, message: 'No workspace folder open' });
            return finalizeRunResult('Build', { success: false, message: 'No workspace folder open' }, moduleName, '', '', Date.now() - startedAt);
          }
          const variant = await getSelectedVariant(moduleName);
          const preflight = await runPreflightChecks(workspaceFolder.uri.fsPath, moduleName, variant, '', false);
          if (!preflight.ok) {
            operationManager.finish(RUN_PANEL_SCOPE, opId);
            pushTimeline({ action: 'Build', stage: 'preflight', status: 'failed', moduleName, variant, deviceId: '', durationMs: Date.now() - startedAt, message: preflight.message || 'Preflight failed' });
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
            pushTimeline({ action: 'Build', stage: 'build', status: 'failed', moduleName, variant, deviceId: '', durationMs: Date.now() - startedAt, message: 'Build failed' });
            return finalizeRunResult('Build', issueToRunResult(buildGuard.issue!, 'Build failed.', fixSuggestionsForGradle()), moduleName, variant, '', Date.now() - startedAt);
          }
          const ok = Boolean(buildGuard.value);
          operationManager.finish(RUN_PANEL_SCOPE, opId);
          pushTimeline({ action: 'Build', stage: 'finish', status: ok ? 'success' : 'failed', moduleName, variant, deviceId: '', durationMs: Date.now() - startedAt, message: ok ? 'Build completed' : 'Build failed' });
          return finalizeRunResult('Build', {
            success: ok,
            message: ok ? 'Build completed' : 'Build failed',
            gradleError: ok ? undefined : lastGradleErrorSummary,
            errorLocation: ok ? undefined : lastGradleErrorLocation,
            fixSuggestions: ok ? undefined : fixSuggestionsForGradle(),
          }, moduleName, variant, '', Date.now() - startedAt);
        },
        install: async (moduleName: string, deviceId: string, options?: { installDiffMode?: boolean }) => {
          const startedAt = Date.now();
          const opId = operationManager.start(RUN_PANEL_SCOPE);
          pushTimeline({ action: 'Install', stage: 'start', status: 'running', moduleName, variant: '', deviceId, message: 'Install started' });
          const shouldCancel = () => operationManager.isCancelled(RUN_PANEL_SCOPE, opId);
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
          if (!workspaceFolder) {
            operationManager.finish(RUN_PANEL_SCOPE, opId);
            pushTimeline({ action: 'Install', stage: 'start', status: 'failed', moduleName, variant: '', deviceId, durationMs: Date.now() - startedAt, message: 'No workspace folder open' });
            return finalizeRunResult('Install', { success: false, message: 'No workspace folder open' }, moduleName, '', deviceId, Date.now() - startedAt);
          }
          if (!deviceId) {
            operationManager.finish(RUN_PANEL_SCOPE, opId);
            pushTimeline({ action: 'Install', stage: 'start', status: 'failed', moduleName, variant: '', deviceId, durationMs: Date.now() - startedAt, message: 'Device not selected' });
            return finalizeRunResult('Install', { success: false, message: 'Select a device', fixSuggestions: [{ id: 'selectDevice', label: 'Select Device' }] }, moduleName, '', deviceId, Date.now() - startedAt);
          }
          const variant = await getSelectedVariant(moduleName);
          const packageName = findApplicationId(workspaceFolder.uri.fsPath, moduleName);
          let beforeInstall: InstallDiffSnapshot | undefined;
          if (options?.installDiffMode && packageName) {
            try {
              beforeInstall = await readInstalledSnapshot(deviceId, packageName);
            } catch {
              beforeInstall = {
                packageName,
                versionName: 'n/a',
                versionCode: 'n/a',
                signature: 'n/a',
              };
            }
          }
          const preflight = await runPreflightChecks(workspaceFolder.uri.fsPath, moduleName, variant, deviceId, true);
          if (!preflight.ok) {
            operationManager.finish(RUN_PANEL_SCOPE, opId);
            pushTimeline({ action: 'Install', stage: 'preflight', status: 'failed', moduleName, variant, deviceId, durationMs: Date.now() - startedAt, message: preflight.message || 'Preflight failed' });
            return finalizeRunResult('Install', {
              success: false,
              message: preflight.message || 'Preflight checks failed',
              fixSuggestions: preflight.fixes,
            }, moduleName, variant, deviceId, Date.now() - startedAt);
          }
          if (preflight.warnings && preflight.warnings.length > 0) {
            showWarning(`Device health warnings: ${preflight.warnings.join(' | ')}`);
          }
          const installGuard = await runGuarded(
            'Install variant',
            () => installVariant(workspaceFolder.uri.fsPath, moduleName, variant, deviceId),
            { timeoutMs: 240_000, retries: 1, shouldCancel }
          );
          if (!installGuard.ok) {
            operationManager.finish(RUN_PANEL_SCOPE, opId);
            pushTimeline({ action: 'Install', stage: 'install', status: 'failed', moduleName, variant, deviceId, durationMs: Date.now() - startedAt, message: 'Install failed' });
            return finalizeRunResult('Install', issueToRunResult(installGuard.issue!, 'Install failed.', fixSuggestionsForGradle()), moduleName, variant, deviceId, Date.now() - startedAt);
          }
          const ok = Boolean(installGuard.value);
          let installDiff: { title: string; lines: string[] } | undefined;
          if (ok && options?.installDiffMode) {
            installDiff = await collectInstallDiff(beforeInstall, workspaceFolder.uri.fsPath, moduleName, variant, packageName);
          }
          operationManager.finish(RUN_PANEL_SCOPE, opId);
          pushTimeline({ action: 'Install', stage: 'finish', status: ok ? 'success' : 'failed', moduleName, variant, deviceId, durationMs: Date.now() - startedAt, message: ok ? 'Install completed' : 'Install failed' });
          return finalizeRunResult('Install', {
            success: ok,
            message: ok
              ? `Install completed${preflight.warnings && preflight.warnings.length ? `. Health warnings: ${preflight.warnings.join(' | ')}` : ''}`
              : 'Install failed',
            gradleError: ok ? undefined : lastGradleErrorSummary,
            errorLocation: ok ? undefined : lastGradleErrorLocation,
            fixSuggestions: ok ? undefined : fixSuggestionsForGradle(),
            installDiff: ok ? installDiff : undefined,
          }, moduleName, variant, deviceId, Date.now() - startedAt);
        },
        run: async (
          moduleName: string,
          deviceId: string,
          options?: {
            launchTargetId?: string;
            installDiffMode?: boolean;
            preRunPipeline?: { clean: boolean; assemble: boolean; install: boolean; run: boolean };
          }
        ) => {
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
          if (!workspaceFolder) {
            return { success: false, message: 'No workspace folder open' };
          }
          const rule = getModuleRunRule(moduleName);
          if (rule?.defaultVariant) {
            await setSelectedVariant(moduleName, rule.defaultVariant);
          }
          const effectiveDeviceId = deviceId || rule?.defaultDeviceId || '';
          if (!deviceId && rule?.defaultDeviceId) {
            await setSelectedDeviceId(rule.defaultDeviceId, `${rule.defaultDeviceId} (rule)`);
          }
          const effectivePipeline = options?.preRunPipeline || rule?.preRunPipeline;
          if (!deviceId) {
            if (!effectiveDeviceId) {
              return { success: false, message: 'Select a device', fixSuggestions: [{ id: 'selectDevice', label: 'Select Device' }] };
            }
          }
          const variant = await getSelectedVariant(moduleName);
          const launchTargetId = options?.launchTargetId || await getSelectedLaunchTarget(moduleName);
          return runFlow(workspaceFolder.uri.fsPath, moduleName, variant, effectiveDeviceId, {
            ...options,
            preRunPipeline: effectivePipeline,
            launchTargetId,
          });
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
          await captureGradleBottlenecks('clean', result.exitCode, result.stdout || '', result.stderr || '');
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
        getHealth: async (healthContext?: { moduleName?: string; deviceId?: string; variant?: string }) => {
          const smart = await getSmartRunHealthContext(healthContext);
          return {
            state: smart.state,
            message: smart.message,
            score: smart.score,
            recommendations: smart.recommendations,
          };
        },
        getUiConfig: async () => {
          return {
            mode: getUiMode(),
            runActions: getRunActionLayout(),
            shortcuts: getKeyboardShortcuts(),
          };
        },
        getModuleRunRule: async (moduleName: string) => {
          if (!moduleName) {
            return undefined;
          }
          return getModuleRunRule(moduleName);
        },
        saveModuleRunRule: async (rule: { moduleName: string; defaultDeviceId?: string; defaultVariant?: string; preRunPipeline?: { clean: boolean; assemble: boolean; install: boolean; run: boolean } }) => {
          if (!rule.moduleName) {
            return;
          }
          await saveModuleRunRule(rule);
        },
        launchIntent: async (
          moduleName: string,
          deviceId: string,
          payload: { action?: string; category?: string; dataUri?: string; flags?: string; extras?: string }
        ) => {
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
          if (!workspaceFolder) {
            return { success: false, message: 'No workspace folder open.' };
          }
          if (!deviceId) {
            return { success: false, message: 'Select a device first.' };
          }
          const packageName = findApplicationId(workspaceFolder.uri.fsPath, moduleName);
          const preflight = await runPreflightChecks(workspaceFolder.uri.fsPath, moduleName, await getSelectedVariant(moduleName), deviceId, true);
          if (!preflight.ok) {
            return {
              success: false,
              message: preflight.message || 'Preflight checks failed',
              fixSuggestions: preflight.fixes,
            };
          }
          const extras = (payload.extras || '')
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean)
            .map(line => {
              const idx = line.indexOf('=');
              if (idx < 0) {
                return { key: line, value: '' };
              }
              return { key: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
            })
            .filter(x => x.key.length > 0);
          const flags = (payload.flags || '').split(/\s+/).map(x => x.trim()).filter(Boolean);
          const res = await AdbService.launchIntent(deviceId, {
            action: payload.action || undefined,
            category: payload.category || undefined,
            dataUri: payload.dataUri || undefined,
            packageName: packageName || undefined,
            flags,
            extras,
          });
          pushTimeline({
            action: 'Intent',
            stage: 'launch',
            status: res.success ? 'success' : 'failed',
            moduleName,
            variant: await getSelectedVariant(moduleName),
            deviceId,
            message: res.message,
          });
          return { success: res.success, message: res.message };
        },
        getTimeline: async () => {
          return listTimeline(120);
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
          if (actionId === 'project-doctor') {
            await runProjectDoctorCommand();
            return { success: true, message: 'Project doctor finished.' };
          }
          if (actionId === 'what-next') {
            await openNextActionSurfaceCommand();
            return { success: true, message: 'What Next panel opened.' };
          }
          if (actionId === 'align-policy') {
            await vscode.commands.executeCommand('android-toolkit.teamPolicyDriftReport');
            return { success: true, message: 'Team policy drift panel opened.' };
          }
          if (actionId === 'crash-anr-triage') {
            await openCrashAnrTriageReport();
            return { success: true, message: 'Crash/ANR triage opened.' };
          }
          if (actionId === 'run-gradle-doctor') {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
              return { success: false, message: 'No workspace folder open.' };
            }
            await runGradleDoctor(workspaceFolder.uri.fsPath);
            return { success: true, message: 'Gradle doctor completed.' };
          }
          if (actionId === 'set-jdk21') {
            const ok = await setJdk21Path();
            return { success: ok, message: ok ? 'JDK path updated.' : 'JDK update canceled.' };
          }
          if (actionId === 'select-device') {
            await selectDeviceCommand();
            return { success: true, message: 'Select device flow opened.' };
          }
          if (actionId === 'select-module') {
            await selectModuleCommand();
            return { success: true, message: 'Select module flow opened.' };
          }
          if (actionId === 'select-variant') {
            await vscode.commands.executeCommand('android-toolkit.selectBuildVariant');
            return { success: true, message: 'Select variant flow opened.' };
          }
          if (actionId === 'smart-clean-build') {
            await vscode.commands.executeCommand('android-toolkit.gradleClean');
            return { success: true, message: 'Gradle clean started.' };
          }
          if (actionId === 'cold-boot-selected-emulator') {
            if (!_deviceId || !_deviceId.startsWith('emulator-')) {
              return { success: false, message: 'Selected target is not an emulator.' };
            }
            const avdName = await getAvdNameForDevice(_deviceId);
            if (!avdName) {
              return { success: false, message: 'Unable to resolve emulator AVD name.' };
            }
            const result = await coldBoot(_deviceId, avdName);
            return { success: result.success, message: result.message };
          }
          if (actionId === 'open-last-failed') {
            await openLastFailedStepCommand();
            return { success: true, message: 'Opened last failed step.' };
          }
          if (actionId === 'crash-repro') {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
              return { success: false, message: 'No workspace folder open.' };
            }
            return runCrashReproFlow(workspaceFolder.uri.fsPath, _moduleName, _deviceId);
          }
          if (actionId === 'export-run-artifacts') {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
              return { success: false, message: 'No workspace folder open.' };
            }
            const variant = await getSelectedVariant(_moduleName);
            return exportRunArtifactsBundle(workspaceFolder.uri.fsPath, _moduleName, variant, _deviceId);
          }
          return { success: false, message: `Unknown quick action: ${actionId}` };
        },
      });
      });
    }),
    registerCommand('android-toolkit.showGradleOutput', () => {
      revealGradleOutput();
    }),
    registerCommand('android-toolkit.runGradleTask', async (task) => {
      await runGradleTaskCommand(task);
    }),
    registerCommand('android-toolkit.refreshGradleTasks', () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      invalidateGradleTaskCache(workspaceRoot);
      ensureAuxiliaryViewsInitialized();
      gradleTasksProvider?.refresh();
    }),
    registerCommand('android-toolkit.clearProblems', () => {
      problemsProvider?.clear();
    }),
    registerCommand('android-toolkit.problemApplyFix', async (item?: AndroidProblemTreeItem) => {
      const fixId = item?.entry?.fixes?.[0]?.id;
      if (!fixId) {
        return;
      }
      await applyRunFixTracked(fixId);
    }),
    registerCommand('android-toolkit.problemOpenLocation', async (item?: AndroidProblemTreeItem) => {
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
    registerCommand('android-toolkit.openAppInspection', () => {
      const { AppInspectionPanel } = lazyLoad<typeof import('./inspection/appInspectionPanel')>('./inspection/appInspectionPanel');
      AppInspectionPanel.createOrShow();
    }),
    registerCommand('android-toolkit.openDatabaseInspector', () => {
      const { DatabaseInspectorPanel } = lazyLoad<typeof import('./database/databaseInspectorPanel')>('./database/databaseInspectorPanel');
      DatabaseInspectorPanel.createOrShow();
    }),
    registerCommand('android-toolkit.openDebugPanel', () => {
      const { DebugPanel } = lazyLoad<typeof import('./debug/debugPanel')>('./debug/debugPanel');
      DebugPanel.createOrShow();
    }),
    registerCommand('android-toolkit.signingWizard', () => {
      runSigningWizard();
    }),
    registerCommand('android-toolkit.releaseFlow', () => {
      runReleaseFlowWizard();
    }),
    registerCommand('android-toolkit.releaseGateWizardPlus', () => {
      runReleaseGateWizardPlus();
    }),
    registerCommand('android-toolkit.buildSignedApk', () => {
      buildSignedApk();
    }),
    registerCommand('android-toolkit.buildSignedBundle', () => {
      buildSignedBundle();
    }),
    registerCommand('android-toolkit.analyzeApk', async () => {
      await withCommandBudget('android-toolkit.analyzeApk', async () => {
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
      });
    }),
    registerCommand('android-toolkit.compareApk', async () => {
      await withCommandBudget('android-toolkit.compareApk', async () => {
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
      });
    }),
    registerCommand('android-toolkit.createLaunchProfile', async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        showError('No workspace folder open.');
        return;
      }
      await createLaunchProfileFlow(workspaceFolder.uri.fsPath, async (moduleName: string) => {
        return getAvailableVariants(workspaceFolder.uri.fsPath, moduleName);
      });
    }),
    registerCommand('android-toolkit.runLaunchProfile', async () => {
      await withCommandBudget('android-toolkit.runLaunchProfile', async () => {
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
      });
    }),
    registerCommand('android-toolkit.deleteLaunchProfile', async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        showError('No workspace folder open.');
        return;
      }
      await deleteLaunchProfileFlow(workspaceFolder.uri.fsPath);
    }),
    registerCommand('android-toolkit.createRunConfiguration', () => {
      createRunConfiguration();
    }),
    registerCommand('android-toolkit.runRunConfiguration', () => {
      runRunConfiguration('run');
    }),
    registerCommand('android-toolkit.runDebugConfiguration', () => {
      runRunConfiguration('debug');
    }),
    registerCommand('android-toolkit.deleteRunConfiguration', () => {
      deleteRunConfiguration();
    }),
    registerCommand('android-toolkit.duplicateRunConfiguration', () => {
      duplicateRunConfiguration();
    }),
    registerCommand('android-toolkit.openRunProfilesV2', () => {
      openRunProfilesV2();
    }),
    registerCommand('android-toolkit.openAdbShell', () => {
      openAdbShell();
    }),
    registerCommand('android-toolkit.openLayoutPreview', () => {
      openLayoutPreview();
    }),
    registerCommand('android-toolkit.openXmlLivePreview', async () => {
      ensureLanguageControllers();
      await xmlLivePreviewController?.openOnceFromActiveEditor();
    }),
    registerCommand('android-toolkit.toggleXmlLivePreview', async () => {
      ensureLanguageControllers();
      await xmlLivePreviewController?.toggle();
    }),
    registerCommand('android-toolkit.generateConstraintSetSnippet', async () => {
      await generateConstraintSetSnippetFromSelection();
    }),
    registerCommand('android-toolkit.lintCurrentLayoutXml', () => {
      ensureLanguageControllers();
      xmlLintController?.lintActiveEditor();
    }),
    registerCommand('android-toolkit.extractStringResourceFromXml', async (uriString?: string, range?: vscode.Range) => {
      await extractStringResourceFromXml(uriString, range);
      const activeDoc = vscode.window.activeTextEditor?.document;
      if (activeDoc) {
        xmlLintController?.lintDocument(activeDoc);
      }
    }),
    registerCommand('android-toolkit.extractAllHardcodedStringsFromLayout', async (uriString?: string) => {
      await extractAllHardcodedStringsFromLayout(uriString);
      const activeDoc = vscode.window.activeTextEditor?.document;
      if (activeDoc) {
        xmlLintController?.lintDocument(activeDoc);
      }
    }),
    registerCommand('android-toolkit.fixAllLayoutWarnings', async (uriString?: string) => {
      await fixAllLayoutWarningsInFile(uriString);
      const activeDoc = vscode.window.activeTextEditor?.document;
      if (activeDoc) {
        xmlLintController?.lintDocument(activeDoc);
      }
    }),
    registerCommand('android-toolkit.xmlFixMissingContentDescription', async (uriString?: string, range?: vscode.Range) => {
      await fixMissingContentDescription(uriString, range);
      const activeDoc = vscode.window.activeTextEditor?.document;
      if (activeDoc) {
        xmlLintController?.lintDocument(activeDoc);
      }
    }),
    registerCommand('android-toolkit.xmlFixMissingConstraints', async (uriString?: string, range?: vscode.Range) => {
      await fixMissingConstraints(uriString, range);
      const activeDoc = vscode.window.activeTextEditor?.document;
      if (activeDoc) {
        xmlLintController?.lintDocument(activeDoc);
      }
    }),
    registerCommand('android-toolkit.openLayoutEditor', () => {
      openLayoutEditor();
    }),
    registerCommand('android-toolkit.openLayoutInspector', () => {
      const { LayoutInspectorPanel } = lazyLoad<typeof import('./layout/layoutInspectorPanel')>('./layout/layoutInspectorPanel');
      LayoutInspectorPanel.createOrShow();
    }),
    registerCommand('android-toolkit.openQuickActions', () => {
      const { QuickActionsPanel } = lazyLoad<typeof import('./deviceActions/quickActionsPanel')>('./deviceActions/quickActionsPanel');
      QuickActionsPanel.createOrShow();
    }),
    registerCommand('android-toolkit.openDeviceCenter', () => {
      const { QuickActionsPanel } = lazyLoad<typeof import('./deviceActions/quickActionsPanel')>('./deviceActions/quickActionsPanel');
      QuickActionsPanel.createOrShow();
    }),
    registerCommand('android-toolkit.pairWirelessDevice', async () => {
      const address = await vscode.window.showInputBox({
        title: 'Pair Wireless Android Device',
        prompt: 'Pairing address shown in Wireless debugging',
        placeHolder: '192.168.1.20:37123',
      });
      if (!address) return;
      const code = await vscode.window.showInputBox({
        title: 'Pair Wireless Android Device',
        prompt: 'Six-digit pairing code',
        password: true,
        validateInput: value => /^\d{6}$/.test(value.trim()) ? undefined : 'Enter the 6-digit pairing code',
      });
      if (!code) return;
      const result = await pairWirelessDevice(address, code);
      result.success ? showInfo(result.message) : showError(result.message);
    }),
    registerCommand('android-toolkit.connectWirelessDevice', async () => {
      const address = await vscode.window.showInputBox({
        title: 'Connect Wireless Android Device',
        prompt: 'Device IP address and connection port',
        placeHolder: '192.168.1.20:5555',
      });
      if (!address) return;
      const result = await connectWirelessDevice(address);
      if (result.success) {
        invalidateDeviceCache();
        deviceManagerProvider?.refresh();
        showInfo(result.message);
      } else {
        showError(result.message);
      }
    }),
    registerCommand('android-toolkit.disconnectWirelessDevice', async () => {
      const address = await vscode.window.showInputBox({
        title: 'Disconnect Wireless Android Device',
        prompt: 'Connected device address',
        placeHolder: '192.168.1.20:5555',
      });
      if (!address) return;
      const result = await disconnectWirelessDevice(address);
      invalidateDeviceCache();
      deviceManagerProvider?.refresh();
      result.success ? showInfo(result.message) : showError(result.message);
    }),
    registerCommand('android-toolkit.mirrorDeviceScrcpy', async () => {
      const online = (await listDevicesDetailed()).filter(device => device.status === 'online');
      const device = online.length === 1 ? online[0] : await pickDevice(online, { title: 'Mirror Device with scrcpy' });
      if (!device) return;
      const command = configuredScrcpyPath(vscode.workspace.getConfiguration('androidToolkit').get<string>('scrcpy.path'));
      if (!(await isScrcpyAvailable(command))) {
        showError(`scrcpy was not found at "${command}". Install scrcpy or set androidToolkit.scrcpy.path.`);
        return;
      }
      launchScrcpy(command, device.id);
      showInfo(`Started scrcpy for ${device.id}.`);
    }),
    registerCommand('android-toolkit.clearAppData', async () => {
      const online = (await listDevicesDetailed()).filter(device => device.status === 'online');
      const device = online.length === 1 ? online[0] : await pickDevice(online, { title: 'Clear App Data' });
      if (!device) return;
      const packages = await AdbService.listPackages(device.id);
      const packageName = await vscode.window.showQuickPick(packages, { placeHolder: 'Select application package' });
      if (!packageName) return;
      const confirm = await vscode.window.showWarningMessage(
        `Clear all data for ${packageName} on ${device.id}?`,
        { modal: true },
        'Clear Data'
      );
      if (confirm !== 'Clear Data') return;
      const result = await AdbService.clearAppData(device.id, packageName);
      result.success ? showInfo(result.message) : showError(result.message);
    }),
    registerCommand('android-toolkit.openCrashSymbolicator', () => {
      const { CrashSymbolicatorPanel } = lazyLoad<typeof import('./diagnostics/crashSymbolicatorPanel')>('./diagnostics/crashSymbolicatorPanel');
      CrashSymbolicatorPanel.createOrShow();
    }),
    registerCommand('android-toolkit.openDeepLinkStudio', () => {
      const { DeepLinkStudioPanel } = lazyLoad<typeof import('./automation/deepLinkStudioPanel')>('./automation/deepLinkStudioPanel');
      DeepLinkStudioPanel.createOrShow(context);
    }),
    registerCommand('android-toolkit.openAdbMacroRecorder', () => {
      const { AdbMacroRecorderPanel } = lazyLoad<typeof import('./automation/adbMacroRecorderPanel')>('./automation/adbMacroRecorderPanel');
      AdbMacroRecorderPanel.createOrShow(context);
    }),
    registerCommand('android-toolkit.openSnapshotScenarioRunner', () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        showError('No workspace folder open.');
        return;
      }
      const { SnapshotScenarioRunnerPanel } = lazyLoad<typeof import('./automation/snapshotScenarioRunnerPanel')>('./automation/snapshotScenarioRunnerPanel');
      SnapshotScenarioRunnerPanel.createOrShow(context, workspaceRoot);
    }),
    registerCommand('android-toolkit.openMappingViewer', () => {
      const { MappingViewerPanel } = lazyLoad<typeof import('./mapping/mappingViewerPanel')>('./mapping/mappingViewerPanel');
      MappingViewerPanel.createOrShow();
    }),
    registerCommand('android-toolkit.openPerformanceMonitor', () => {
      const { PerformanceMonitorPanel } = lazyLoad<typeof import('./monitor/performanceMonitorPanel')>('./monitor/performanceMonitorPanel');
      PerformanceMonitorPanel.createOrShow();
    }),
    registerCommand('android-toolkit.inspectBuildCache', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        showError('No workspace folder open.');
        return;
      }
      await inspectBuildCache(workspaceRoot);
    }),
    registerCommand('android-toolkit.dependencyInsight', async () => {
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
    registerCommand('android-toolkit.openGradleIntelligence', async () => {
      if (!(await ensureFeatureAllowed('gradleIntelligence'))) {
        return;
      }
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        showError('No workspace folder open.');
        return;
      }
      const { GradleIntelligencePanel } = lazyLoad<typeof import('./gradle/gradleIntelligencePanel')>('./gradle/gradleIntelligencePanel');
      GradleIntelligencePanel.createOrShow(workspaceRoot);
    }),
    registerCommand('android-toolkit.openComposePreview', () => {
      const { ComposePreviewPanel } = lazyLoad<typeof import('./compose/composePreviewPanel')>('./compose/composePreviewPanel');
      ComposePreviewPanel.createOrShow();
    }),
    registerCommand('android-toolkit.openComposeLivePreview', () => {
      const { ComposeLivePreviewPanel } = lazyLoad<typeof import('./compose/composeLivePreviewPanel')>('./compose/composeLivePreviewPanel');
      ComposeLivePreviewPanel.createOrShow();
    }),
    registerCommand('android-toolkit.runTests', async () => {
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
    registerCommand('android-toolkit.killRestartClearData', () => {
      killRestartClearDataCommand();
    }),
    registerCommand('android-toolkit.validateManifest', () => {
      validateManifestCommand();
    }),
    registerCommand('android-toolkit.insertManifestTemplate', () => {
      const { insertManifestTemplate } = lazyLoad<typeof import('./projectView/manifestTools')>('./projectView/manifestTools');
      insertManifestTemplate();
    }),
    registerCommand('android-toolkit.addManifestEntry', () => {
      const { addManifestEntryFlow } = lazyLoad<typeof import('./projectView/manifestTools')>('./projectView/manifestTools');
      addManifestEntryFlow();
    }),
    registerCommand('android-toolkit.openManifestEditor', () => {
      const { openManifestEditor } = lazyLoad<typeof import('./projectView/manifestTools')>('./projectView/manifestTools');
      openManifestEditor();
    }),
    registerCommand('android-toolkit.manifestDiffAssistant', () => {
      const { runManifestDiffAssistant } = lazyLoad<typeof import('./projectView/manifestDiffAssistant')>('./projectView/manifestDiffAssistant');
      runManifestDiffAssistant();
    }),
    registerCommand('android-toolkit.validateResources', () => {
      validateResourcesCommand();
    }),
    registerCommand('android-toolkit.insertValuesTemplate', () => {
      insertValuesTemplate();
    }),
    registerCommand('android-toolkit.openResourceInspector', () => {
      openResourceInspector();
    }),
    registerCommand('android-toolkit.openResourceByQuery', () => {
      openResourceByQuery();
    }),
    registerCommand('android-toolkit.resourceRefactorTools', () => {
      openResourceRefactorTools();
    }),
    registerCommand('android-toolkit.bulkRenameResources', () => {
      bulkRenameResources();
    }),
    registerCommand('android-toolkit.bulkMoveResources', () => {
      bulkMoveResources();
    }),
    registerCommand('android-toolkit.scanApiCompatibility', () => {
      const { runApiCompatibilityScanner } = lazyLoad<typeof import('./core/apiCompatibilityScanner')>('./core/apiCompatibilityScanner');
      runApiCompatibilityScanner();
    }),
    registerCommand('android-toolkit.jumpToNavDestination', () => {
      jumpToNavigationDestination();
    }),
    registerCommand('android-toolkit.jumpToNavArgument', () => {
      jumpToNavigationArgument();
    }),
    registerCommand('android-toolkit.previewNavGraphSvg', () => {
      previewNavigationGraphSvg();
    }),
    registerCommand('android-toolkit.deviceExplorer.refresh', () => {
      ensureAuxiliaryViewsInitialized();
      deviceFileExplorerProvider?.refresh();
    }),
    registerCommand('android-toolkit.deviceExplorer.pull', (item: any) => {
      deviceExplorerPull(item);
    }),
    registerCommand('android-toolkit.deviceExplorer.push', (item: any) => {
      deviceExplorerPush(item);
    }),
    registerCommand('android-toolkit.deviceExplorer.delete', (item: any) => {
      deviceExplorerDelete(item);
    }),
    registerCommand('android-toolkit.emulator.saveSnapshot', async () => {
      const target = await selectEmulator();
      if (!target) { return; }
      const name = await vscode.window.showInputBox({ prompt: 'Snapshot name', value: 'snapshot1' });
      if (!name) { return; }
      const result = await saveSnapshot(target.deviceId, name);
      result.success ? showInfo(result.message) : showError(result.message);
    }),
    registerCommand('android-toolkit.emulator.loadSnapshot', async () => {
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
    registerCommand('android-toolkit.refreshDeviceManager', () => {
      ensureAuxiliaryViewsInitialized();
      deviceManagerProvider?.refresh();
    }),
    registerCommand('android-toolkit.createDevice', (platform?: string) => {
      ensureAuxiliaryViewsInitialized();
      createDeviceWizard(platform as any, deviceManagerProvider as DeviceManagerProvider);
    }),
    registerCommand('android-toolkit.deviceManager.launch', (device: UnifiedDevice) => {
      ensureAuxiliaryViewsInitialized();
      launchDevice(device, deviceManagerProvider as DeviceManagerProvider);
    }),
    registerCommand('android-toolkit.deviceManager.stop', (device: UnifiedDevice) => {
      ensureAuxiliaryViewsInitialized();
      stopDevice(device, deviceManagerProvider as DeviceManagerProvider);
    }),
    registerCommand('android-toolkit.deviceManager.delete', (device: UnifiedDevice) => {
      ensureAuxiliaryViewsInitialized();
      deleteDevice(device, deviceManagerProvider as DeviceManagerProvider);
    }),
    registerCommand('android-toolkit.refreshEmulatorControl', () => {
      ensureAuxiliaryViewsInitialized();
      controlProvider?.refresh();
    }),
    ...createEmulatorControlCommands(() => controlProvider),
    registerCommand('android-toolkit.openLogcat', () => {
      const { LogcatPanel } = require('./logcat/logcatPanel');
      LogcatPanel.createOrShow(context.extensionUri, context);
    }),
    registerCommand('android-toolkit.clearLogcat', () => {
      const { LogcatPanel } = require('./logcat/logcatPanel');
      if (LogcatPanel.currentPanel) {
        LogcatPanel.currentPanel.dispose();
      }
      showInfo('Logcat cleared');
    }),
    registerCommand('android-toolkit.attachDebugger', () => {
      const { debugSession } = require('./debug/debugAdapter');
      debugSession.attach();
    }),
    registerCommand('android-toolkit.detachDebugger', () => {
      const { debugSession } = require('./debug/debugAdapter');
      debugSession.detach();
    }),
    registerCommand('android-toolkit.toggleBreakpoint', () => {
      const { debugSession } = require('./debug/debugAdapter');
      debugSession.toggleBreakpoint();
    }),
    registerCommand('android-toolkit.debugStatus', () => {
      const { debugSession } = require('./debug/debugAdapter');
      debugSession.showStatus();
    }),
    registerCommand('android-toolkit.openEmulatorPanel', () => {
      EmulatorControlPanel.createOrShow(context.extensionUri);
    }),
    registerCommand('android-toolkit.installApk', async () => {
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
    registerCommand('android-toolkit.installApkMatrix', () => {
      if (!isFeatureAllowed('matrix')) {
        void ensureFeatureAllowed('matrix');
        return;
      }
      installApkMatrix();
    }),
    registerCommand('android-toolkit.runDeviceMatrix', () => {
      if (!isFeatureAllowed('matrix')) {
        void ensureFeatureAllowed('matrix');
        return;
      }
      runDeviceMatrix();
    }),
    registerCommand('android-toolkit.openMatrixDashboard', () => {
      if (!isFeatureAllowed('matrix')) {
        void ensureFeatureAllowed('matrix');
        return;
      }
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot || !extensionContext) {
        showError('No workspace folder open.');
        return;
      }
      const { MatrixDashboardPanel } = lazyLoad<typeof import('./matrix/matrixDashboardPanel')>('./matrix/matrixDashboardPanel');
      MatrixDashboardPanel.createOrShow(extensionContext, workspaceRoot);
    }),
    registerCommand('android-toolkit.configureDeviceFarmPresets', () => {
      if (!isFeatureAllowed('matrix')) {
        void ensureFeatureAllowed('matrix');
        return;
      }
      configureDeviceFarmPresetCommand();
    }),
    registerCommand('android-toolkit.runDeviceFarmPreset', () => {
      if (!isFeatureAllowed('matrix')) {
        void ensureFeatureAllowed('matrix');
        return;
      }
      runDeviceFarmPresetCommand();
    }),
    registerCommand('android-toolkit.runDeviceFarmQa', () => {
      if (!isFeatureAllowed('matrix')) {
        void ensureFeatureAllowed('matrix');
        return;
      }
      runDeviceFarmPresetCommand('qa');
    }),
    registerCommand('android-toolkit.runDeviceFarmRelease', () => {
      if (!isFeatureAllowed('matrix')) {
        void ensureFeatureAllowed('matrix');
        return;
      }
      runDeviceFarmPresetCommand('release');
    }),
    registerCommand('android-toolkit.runDeviceFarmSmoke', () => {
      if (!isFeatureAllowed('matrix')) {
        void ensureFeatureAllowed('matrix');
        return;
      }
      runDeviceFarmPresetCommand('smoke');
    }),
    registerCommand('android-toolkit.deleteDeviceFarmPreset', () => {
      if (!isFeatureAllowed('matrix')) {
        void ensureFeatureAllowed('matrix');
        return;
      }
      deleteDeviceFarmPresetCommand();
    }),
    registerCommand('android-toolkit.gradleDoctor', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        showError('No workspace folder open.');
        return;
      }
      await runGradleDoctor(workspaceRoot);
    }),
    registerCommand('android-toolkit.playSigningHelper', () => {
      openPlaySigningHelper();
    }),
    registerCommand('android-toolkit.bundletoolBuildApks', () => {
      bundletoolBuildApks();
    }),
    registerCommand('android-toolkit.bundletoolInstallApks', () => {
      bundletoolInstallApks();
    }),
    registerCommand('android-toolkit.bumpVersionCode', () => {
      bumpVersionCodeWizard();
    }),
    registerCommand('android-toolkit.uninstallApp', async () => {
      const devices = (await listDevicesDetailed()).filter(device => device.status === 'online');
      if (devices.length === 0) {
        showWarning('No online devices.');
        return;
      }
      const device = devices.length === 1 ? devices[0] : await pickDevice(devices, { title: 'Uninstall App' });
      if (!device) return;
      const deviceId = device.id;
      const packages = await AdbService.listPackages(deviceId);
      const pkg = await vscode.window.showQuickPick(packages, { placeHolder: 'Select app to uninstall' });
      if (pkg) {
        const result = await AdbService.uninstallApp(deviceId, pkg);
        result.success ? showInfo(result.message) : showError(result.message);
      }
    }),
    registerCommand('android-toolkit.restartApp', async () => {
      const devices = (await listDevicesDetailed()).filter(device => device.status === 'online');
      if (devices.length === 0) {
        showWarning('No online devices.');
        return;
      }
      const device = devices.length === 1 ? devices[0] : await pickDevice(devices, { title: 'Restart App' });
      if (!device) return;
      const deviceId = device.id;
      const packages = await AdbService.listPackages(deviceId);
      const pkg = await vscode.window.showQuickPick(packages, { placeHolder: 'Select app to restart' });
      if (pkg) {
        await withProgress('Restarting app...', async () => {
          const result = await AdbService.restartApp(deviceId, pkg);
          result.success ? showInfo(result.message) : showError(result.message);
        });
      }
    }),
    registerCommand('android-toolkit.setLocation', async () => {
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
    registerCommand('android-toolkit.startRecording', async () => {
      const emulators = await listRunningEmulators();
      if (emulators.length === 0) {
        showWarning('No running emulators.');
        return;
      }
      const result = await AdbService.startScreenRecording(emulators[0].id);
      result.success ? showInfo(result.message) : showError(result.message);
    }),
    registerCommand('android-toolkit.stopRecording', async () => {
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
    registerCommand('android-toolkit.setBattery', async () => {
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
    registerCommand('android-toolkit.openFile', async (uriOrPath: vscode.Uri | string) => {
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
    registerCommand('android-toolkit.openProfiler', () => {
      const { ProfilerPanel } = lazyLoad<typeof import('./profiler/profilerPanel')>('./profiler/profilerPanel');
      ProfilerPanel.createOrShow(context.extensionUri);
    }),
  ];
  context.subscriptions.push(...commands);
  recordStartupPhase('commands:register', tCommands, activationStartedAt);
  void startSession(context);
  logPerf('activate:commandsRegistered', Date.now() - activationStartedAt);
  
  setTimeout(() => {
    checkLanguageExtensions(context).catch(() => {});
  }, 1800);
  setTimeout(() => {
    openOnboardingV2Panel(false).catch(() => {});
  }, 1200);
  setTimeout(() => {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
      applyProjectOverridesFromConfig(workspaceRoot).catch(() => {});
      evaluateConfigPolicy(workspaceRoot).catch(() => {});
    }
  }, 1600);
  const deferMonitoring = vscode.workspace.getConfiguration('androidToolkit').get<boolean>('performance.deferBackgroundMonitoring', true);
  if (!autoSyncEnabled) {
    const scheduleBackground = (): void => {
      backgroundScheduler.register(
        'emulatorStateProbe',
        2200,
        async () => {
          await EmulatorStateService.getInstance().forceCheck();
        },
        {
          shouldRun: () => vscode.window.state.focused && RunPanel.isVisible,
        }
      );
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
  trackSlowPathMetric('activateExtension', startupProfilerTotalMs, true);
  if (startupProfilerTotalMs > ACTIVATION_BUDGET_MS) {
    logPerf('activate:budgetExceeded', startupProfilerTotalMs);
  }
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
