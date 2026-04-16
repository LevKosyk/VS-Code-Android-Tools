import * as fs from 'fs';
import * as path from 'path';
import { execCommand } from '../core/cli';
import { findApplicationId, findApplicationModules, findLatestApk } from '../core/androidProject';
import { runGradleTaskWithResult } from '../gradle/gradleService';
import { listDevicesDetailed } from '../devices/deviceManager';
import { AdbService } from '../services/adbService';
import type { SlowPathRecord } from './slowPathMetrics';
import type { RunFailureRecord } from '../run/runDiagnostics';

export interface CrashLikeRecord {
  type: 'crash' | 'anr';
  signature: string;
  message: string;
  source?: string;
  timestamp: number;
}

export interface ReleaseRiskOverride {
  approvedAt: number;
  approvedBy: string;
  reason: string;
}

export interface PerformanceBaselineLike {
  startupTotalMs: number;
}

export interface CrashCluster {
  id: string;
  title: string;
  count: number;
  confidence: number;
  suggestedFixLabel: string;
  suggestedCommandId: string;
  probableFile?: string;
  why: string;
}

export interface MatrixRecommendation {
  moduleName: string;
  packageName: string;
  minSdk: number;
  targetSdk: number;
  abiFilters: string[];
  featureFlags: string[];
  devices: Array<{ id: string; apiLevel: number; abi: string; reason: string }>;
  flakyHotspots: Array<{ deviceId: string; target: string; pass: number; fail: number; retryHint: number }>;
}

export interface ReleaseRiskSignal {
  id: string;
  label: string;
  score: number;
  detail: string;
}

export interface StartupAttribution {
  headline: string;
  p95DeltaMs: number;
  stage: string;
  fingerprint: string;
  suggestedDeferralPlan: string[];
}

export interface PolicyIssue {
  id: string;
  title: string;
  expected: string;
  actual: string;
  why?: string;
  safeAutoFix: boolean;
}

export interface DeepLinkCase {
  id: string;
  uri: string;
  source: string;
  issue: string;
  canReplay: boolean;
}

export interface ApkDiffInsight {
  oldApk?: string;
  newApk?: string;
  sizeDeltaBytes: number;
  dexDeltaBytes: number;
  nativeDeltaBytes: number;
  resourceDuplicationHints: string[];
  insights: string[];
}

export interface TeamPlaybook {
  id: string;
  title: string;
  steps: Array<{ label: string; commandId: string }>;
}

export interface FocusedPrCheck {
  trigger: string;
  checks: string[];
}

export interface ObservabilityCorrelation {
  provider: string;
  buildFingerprint: string;
  crashSpikeWindow?: string;
  summary: string;
  changesSinceHealthy: string[];
}

export interface IntelligenceHubSnapshot {
  generatedAt: string;
  crashClusters: CrashCluster[];
  matrix: MatrixRecommendation;
  releaseRisk: {
    score: number;
    threshold: number;
    blocked: boolean;
    override?: ReleaseRiskOverride;
    signals: ReleaseRiskSignal[];
  };
  startup: StartupAttribution;
  policy: {
    policyFile?: string;
    issues: PolicyIssue[];
  };
  deepLinks: DeepLinkCase[];
  apkDiff: ApkDiffInsight;
  playbooks: TeamPlaybook[];
  prAssistant: {
    changedFiles: string[];
    focusedChecks: FocusedPrCheck[];
  };
  observability: ObservabilityCorrelation[];
}

export interface MatrixSmokeResult {
  moduleName: string;
  variant: string;
  packageName: string;
  rows: Array<{ deviceId: string; success: boolean; retries: number; message: string }>;
}

interface PolicyRules {
  manifest?: {
    requiredPermissions?: string[];
    why?: string;
  };
  gradle?: {
    requiredPlugins?: string[];
    minSdk?: number;
    targetSdk?: number;
    lintSeverities?: string[];
    why?: string;
  };
  signing?: {
    required?: boolean;
    why?: string;
  };
}

function readText(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

function toPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function extractSdkAndAbi(gradleText: string): { minSdk: number; targetSdk: number; abiFilters: string[] } {
  const min = gradleText.match(/\bminSdk(?:Version)?\s*(?:=)?\s*(\d+)/);
  const target = gradleText.match(/\btargetSdk(?:Version)?\s*(?:=)?\s*(\d+)/);
  const abiMatches = Array.from(gradleText.matchAll(/abiFilters\s+([^\n]+)/g));
  const abiFilters = new Set<string>();
  for (const match of abiMatches) {
    const line = match[1] || '';
    for (const token of line.match(/['"]([^'"]+)['"]/g) || []) {
      abiFilters.add(token.replace(/['"]/g, '').trim());
    }
  }
  return {
    minSdk: min ? Number.parseInt(min[1], 10) : 21,
    targetSdk: target ? Number.parseInt(target[1], 10) : 34,
    abiFilters: Array.from(abiFilters),
  };
}

function detectClusterKind(text: string): 'mapping' | 'npe' | 'resource' | 'abi' | 'other' {
  const normalized = text.toLowerCase();
  if (normalized.includes('mapping') || normalized.includes('proguard') || normalized.includes('obfuscat')) {
    return 'mapping';
  }
  if (normalized.includes('nullpointerexception') || normalized.includes('kotlinnullpointerexception') || normalized.includes(' n.p.e')) {
    return 'npe';
  }
  if (normalized.includes('resources$notfoundexception') || normalized.includes('resource') || normalized.includes('androidmanifest')) {
    return 'resource';
  }
  if (normalized.includes('abi') || normalized.includes('no implementation found') || normalized.includes('unsatisfiedlinkerror')) {
    return 'abi';
  }
  return 'other';
}

function clusterCrashes(records: CrashLikeRecord[]): CrashCluster[] {
  const buckets = new Map<string, CrashLikeRecord[]>();
  for (const row of records) {
    const base = `${row.signature}\n${row.message}\n${row.source || ''}`;
    const kind = detectClusterKind(base);
    const list = buckets.get(kind) || [];
    list.push(row);
    buckets.set(kind, list);
  }

  const mapBucket = (kind: string, rows: CrashLikeRecord[]): CrashCluster => {
    const count = rows.length;
    if (kind === 'mapping') {
      return {
        id: 'missing-proguard-mapping',
        title: 'Missing ProGuard/R8 mapping',
        count,
        confidence: Math.min(98, 65 + count * 7),
        suggestedFixLabel: 'Open Crash Symbolicator',
        suggestedCommandId: 'android-toolkit.openCrashSymbolicator',
        probableFile: 'app/build/outputs/mapping/release/mapping.txt',
        why: 'Obfuscated symbols without mapping hint at missing symbolication artifacts.',
      };
    }
    if (kind === 'npe') {
      return {
        id: 'null-pointer-exception',
        title: 'Null pointer crash cluster',
        count,
        confidence: Math.min(95, 58 + count * 8),
        suggestedFixLabel: 'Open Failure Insights',
        suggestedCommandId: 'android-toolkit.openFailureInsights',
        probableFile: 'app/src/main/java',
        why: 'Frequent NPE signatures indicate initialization/order or nullability defects.',
      };
    }
    if (kind === 'resource') {
      return {
        id: 'resource-resolution-failure',
        title: 'Resource / Manifest resolution issue',
        count,
        confidence: Math.min(92, 55 + count * 8),
        suggestedFixLabel: 'Open Manifest Diff Assistant',
        suggestedCommandId: 'android-toolkit.manifestDiffAssistant',
        probableFile: 'app/src/main/AndroidManifest.xml',
        why: 'Missing resources or manifest keys usually break only selected flows/devices.',
      };
    }
    if (kind === 'abi') {
      return {
        id: 'abi-mismatch',
        title: 'ABI/native mismatch',
        count,
        confidence: Math.min(97, 60 + count * 8),
        suggestedFixLabel: 'Open APK Analyzer',
        suggestedCommandId: 'android-toolkit.analyzeApk',
        probableFile: 'app/build.gradle',
        why: 'ABI mismatch often comes from missing split/ndk abi filters or packaging changes.',
      };
    }
    return {
      id: 'other-crash-pattern',
      title: 'General crash cluster',
      count,
      confidence: Math.min(80, 45 + count * 5),
      suggestedFixLabel: 'Open Crash/ANR Triage',
      suggestedCommandId: 'android-toolkit.openCrashAnrTriage',
      probableFile: undefined,
      why: 'Unclassified crash signatures still benefit from triage and grouped investigation.',
    };
  };

  return Array.from(buckets.entries())
    .map(([kind, rows]) => mapBucket(kind, rows))
    .sort((a, b) => b.count - a.count || b.confidence - a.confidence)
    .slice(0, 6);
}

function parseManifestInfo(manifestText: string): { features: string[]; permissions: string[]; deepLinks: string[] } {
  const features = Array.from(manifestText.matchAll(/<uses-feature[^>]*android:name="([^"]+)"/g)).map(m => m[1]);
  const permissions = Array.from(manifestText.matchAll(/<uses-permission[^>]*android:name="([^"]+)"/g)).map(m => m[1]);
  const deepLinks = Array.from(manifestText.matchAll(/<data[^>]*android:(?:host|scheme)="([^"]+)"/g)).map(m => m[1]);
  return { features, permissions, deepLinks };
}

function readMatrixHistory(globalStateHistory: unknown): Array<{ mode: string; deviceId: string; target: string; ok: boolean }> {
  if (!Array.isArray(globalStateHistory)) {
    return [];
  }
  return globalStateHistory
    .map(item => item as { mode?: unknown; deviceId?: unknown; target?: unknown; ok?: unknown })
    .filter(item => typeof item.mode === 'string' && typeof item.deviceId === 'string' && typeof item.target === 'string' && typeof item.ok === 'boolean')
    .map(item => ({
      mode: item.mode as string,
      deviceId: item.deviceId as string,
      target: item.target as string,
      ok: item.ok as boolean,
    }));
}

function computeFlakyHotspots(rows: Array<{ mode: string; deviceId: string; target: string; ok: boolean }>): MatrixRecommendation['flakyHotspots'] {
  const grouped = new Map<string, { deviceId: string; target: string; pass: number; fail: number }>();
  for (const row of rows) {
    if (row.mode !== 'tests' && row.mode !== 'smoke') {
      continue;
    }
    const key = `${row.deviceId}::${row.target}`;
    const current = grouped.get(key) || { deviceId: row.deviceId, target: row.target, pass: 0, fail: 0 };
    if (row.ok) {
      current.pass += 1;
    } else {
      current.fail += 1;
    }
    grouped.set(key, current);
  }
  return Array.from(grouped.values())
    .map(item => ({
      ...item,
      retryHint: item.pass > 0 && item.fail > 0 ? 2 : item.fail > 0 ? 1 : 0,
    }))
    .sort((a, b) => b.retryHint - a.retryHint || b.fail - a.fail)
    .slice(0, 8);
}

function pickRecommendedDevices(
  devices: Array<{ id: string; apiLevel: number; abi: string }>,
  minSdk: number,
  targetSdk: number,
  abiFilters: string[]
): MatrixRecommendation['devices'] {
  const sorted = [...devices].sort((a, b) => a.apiLevel - b.apiLevel);
  const picks: MatrixRecommendation['devices'] = [];
  const firstCompat = sorted.find(d => d.apiLevel >= minSdk);
  if (firstCompat) {
    picks.push({
      id: firstCompat.id,
      apiLevel: firstCompat.apiLevel,
      abi: firstCompat.abi,
      reason: 'Minimum compatible API sanity check',
    });
  }
  const target = sorted.reduce<{ id: string; apiLevel: number; abi: string } | undefined>((best, device) => {
    if (device.apiLevel < minSdk) {
      return best;
    }
    if (!best) {
      return device;
    }
    const currentDiff = Math.abs(best.apiLevel - targetSdk);
    const nextDiff = Math.abs(device.apiLevel - targetSdk);
    return nextDiff < currentDiff ? device : best;
  }, undefined);
  if (target && !picks.some(item => item.id === target.id)) {
    picks.push({
      id: target.id,
      apiLevel: target.apiLevel,
      abi: target.abi,
      reason: 'Closest to targetSdk runtime behavior',
    });
  }
  if (abiFilters.length > 0) {
    for (const abi of abiFilters) {
      const match = sorted.find(d => d.abi.includes(abi));
      if (match && !picks.some(item => item.id === match.id)) {
        picks.push({
          id: match.id,
          apiLevel: match.apiLevel,
          abi: match.abi,
          reason: `ABI coverage for ${abi}`,
        });
      }
    }
  }
  return picks.slice(0, 6);
}

function scoreReleaseRiskSignals(input: {
  anrTrend: number;
  startupRegressionMs: number;
  mappingDrift: number;
  permissionChanges: number;
  testFlakyRate: number;
}): { score: number; signals: ReleaseRiskSignal[] } {
  const signals: ReleaseRiskSignal[] = [
    {
      id: 'anr-trend',
      label: 'ANR trend',
      score: toPercent(input.anrTrend),
      detail: `Trend score ${toPercent(input.anrTrend)} from recent crash/anr records.`,
    },
    {
      id: 'startup-regression',
      label: 'Startup regression',
      score: toPercent(Math.max(0, input.startupRegressionMs / 8)),
      detail: `Regression ${Math.round(input.startupRegressionMs)} ms vs baseline.`,
    },
    {
      id: 'mapping-drift',
      label: 'Mapping drift',
      score: toPercent(input.mappingDrift),
      detail: input.mappingDrift > 0 ? 'Missing or stale mapping artifact.' : 'Mapping artifact looks healthy.',
    },
    {
      id: 'permission-changes',
      label: 'Permission changes',
      score: toPercent(input.permissionChanges * 20),
      detail: `${input.permissionChanges} permission-related file changes detected.`,
    },
    {
      id: 'test-flakiness',
      label: 'Test flakiness',
      score: toPercent(input.testFlakyRate * 100),
      detail: `Flaky rate ${Math.round(input.testFlakyRate * 100)}% from matrix history.`,
    },
  ];
  const weighted =
    signals.find(s => s.id === 'anr-trend')!.score * 0.25 +
    signals.find(s => s.id === 'startup-regression')!.score * 0.2 +
    signals.find(s => s.id === 'mapping-drift')!.score * 0.15 +
    signals.find(s => s.id === 'permission-changes')!.score * 0.15 +
    signals.find(s => s.id === 'test-flakiness')!.score * 0.25;
  return { score: Math.round(weighted), signals };
}

function bestSlowFingerprint(records: SlowPathRecord[]): { stage: string; fingerprint: string; p95: number } {
  const grouped = new Map<string, number[]>();
  for (const row of records) {
    const fp = row.fingerprint || 'unknown';
    const key = `${row.stage}::${fp}`;
    const current = grouped.get(key) || [];
    current.push(row.durationMs);
    grouped.set(key, current);
  }
  let best = { stage: 'unknown', fingerprint: 'unknown', p95: 0 };
  for (const [key, values] of grouped.entries()) {
    const sorted = [...values].sort((a, b) => a - b);
    const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] || 0;
    if (p95 > best.p95) {
      const split = key.indexOf('::');
      best = {
        stage: key.slice(0, split),
        fingerprint: key.slice(split + 2),
        p95,
      };
    }
  }
  return best;
}

function findPolicyFile(workspaceRoot: string): string | undefined {
  const candidates = [
    path.join(workspaceRoot, '.android-tools', 'policy.rules.json'),
    path.join(workspaceRoot, '.android-tools', 'policy.rules.yaml'),
    path.join(workspaceRoot, '.android-tools', 'policy.rules.yml'),
  ];
  return candidates.find(file => fs.existsSync(file));
}

function parseYamlLike(content: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const stack: Array<{ indent: number; target: Record<string, unknown> }> = [{ indent: -1, target: out }];
  const lines = content.split(/\r?\n/);
  for (const raw of lines) {
    if (!raw.trim() || raw.trim().startsWith('#')) {
      continue;
    }
    const indent = raw.match(/^\s*/)?.[0].length || 0;
    const line = raw.trim();
    const pair = line.split(':');
    if (pair.length < 2) {
      continue;
    }
    const key = pair.shift()!.trim();
    const rawValue = pair.join(':').trim();
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1].target;
    if (!rawValue) {
      const child: Record<string, unknown> = {};
      parent[key] = child;
      stack.push({ indent, target: child });
      continue;
    }
    if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
      parent[key] = rawValue
        .slice(1, -1)
        .split(',')
        .map(x => x.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
      continue;
    }
    if (/^\d+$/.test(rawValue)) {
      parent[key] = Number.parseInt(rawValue, 10);
      continue;
    }
    if (rawValue === 'true' || rawValue === 'false') {
      parent[key] = rawValue === 'true';
      continue;
    }
    parent[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }
  return out;
}

function readPolicyRules(workspaceRoot: string): { file?: string; rules?: PolicyRules } {
  const file = findPolicyFile(workspaceRoot);
  if (!file) {
    return {};
  }
  const text = readText(file);
  try {
    if (file.endsWith('.json')) {
      return { file, rules: JSON.parse(text) as PolicyRules };
    }
    return { file, rules: parseYamlLike(text) as PolicyRules };
  } catch {
    return { file };
  }
}

function collectPolicyIssues(workspaceRoot: string, moduleName: string, rules?: PolicyRules): PolicyIssue[] {
  if (!rules) {
    return [];
  }
  const issues: PolicyIssue[] = [];
  const manifestPath = path.join(workspaceRoot, moduleName, 'src', 'main', 'AndroidManifest.xml');
  const gradlePath = [
    path.join(workspaceRoot, moduleName, 'build.gradle'),
    path.join(workspaceRoot, moduleName, 'build.gradle.kts'),
  ].find(file => fs.existsSync(file));
  const manifestText = fs.existsSync(manifestPath) ? readText(manifestPath) : '';
  const gradleText = gradlePath ? readText(gradlePath) : '';

  for (const permission of rules.manifest?.requiredPermissions || []) {
    if (!manifestText.includes(permission)) {
      issues.push({
        id: `manifest-permission-${permission}`,
        title: `Missing required permission ${permission}`,
        expected: permission,
        actual: 'not found in AndroidManifest.xml',
        why: rules.manifest?.why,
        safeAutoFix: true,
      });
    }
  }

  for (const plugin of rules.gradle?.requiredPlugins || []) {
    if (!gradleText.includes(plugin)) {
      issues.push({
        id: `gradle-plugin-${plugin}`,
        title: `Missing required Gradle plugin ${plugin}`,
        expected: plugin,
        actual: 'plugin declaration not found',
        why: rules.gradle?.why,
        safeAutoFix: false,
      });
    }
  }

  if (typeof rules.gradle?.minSdk === 'number') {
    const sdk = extractSdkAndAbi(gradleText);
    if (sdk.minSdk !== rules.gradle.minSdk) {
      issues.push({
        id: 'gradle-min-sdk',
        title: 'minSdk drift',
        expected: String(rules.gradle.minSdk),
        actual: String(sdk.minSdk),
        why: rules.gradle?.why,
        safeAutoFix: true,
      });
    }
  }

  if (typeof rules.gradle?.targetSdk === 'number') {
    const sdk = extractSdkAndAbi(gradleText);
    if (sdk.targetSdk !== rules.gradle.targetSdk) {
      issues.push({
        id: 'gradle-target-sdk',
        title: 'targetSdk drift',
        expected: String(rules.gradle.targetSdk),
        actual: String(sdk.targetSdk),
        why: rules.gradle?.why,
        safeAutoFix: true,
      });
    }
  }

  if (rules.signing?.required) {
    const signingProps = path.join(workspaceRoot, 'android-tools.signing.properties');
    if (!fs.existsSync(signingProps)) {
      issues.push({
        id: 'signing-required',
        title: 'Signing config required',
        expected: 'android-tools.signing.properties exists',
        actual: 'missing',
        why: rules.signing?.why,
        safeAutoFix: false,
      });
    }
  }

  return issues;
}

function generateDeepLinkCases(workspaceRoot: string): DeepLinkCase[] {
  const navDir = path.join(workspaceRoot, 'app', 'src', 'main', 'res', 'navigation');
  const cases: DeepLinkCase[] = [];
  if (fs.existsSync(navDir)) {
    for (const fileName of fs.readdirSync(navDir)) {
      if (!fileName.endsWith('.xml')) {
        continue;
      }
      const filePath = path.join(navDir, fileName);
      const text = readText(filePath);
      const uriMatches = Array.from(text.matchAll(/app:uri="([^"]+)"/g));
      for (const match of uriMatches) {
        const uri = match[1];
        const hasParam = /\{[^}]+\}/.test(uri);
        cases.push({
          id: `nav-${fileName}-${cases.length}`,
          uri: hasParam ? uri.replace(/\{[^}]+\}/g, 'fuzz') : uri,
          source: fileName,
          issue: hasParam ? 'Route requires params, fuzzed placeholder generated.' : 'Route candidate generated from nav graph.',
          canReplay: true,
        });
      }
    }
  }

  const manifestPath = path.join(workspaceRoot, 'app', 'src', 'main', 'AndroidManifest.xml');
  if (fs.existsSync(manifestPath)) {
    const text = readText(manifestPath);
    const schemeMatches = Array.from(text.matchAll(/android:scheme="([^"]+)"/g)).map(m => m[1]);
    const hostMatches = Array.from(text.matchAll(/android:host="([^"]+)"/g)).map(m => m[1]);
    const count = Math.max(schemeMatches.length, hostMatches.length);
    for (let i = 0; i < count; i++) {
      const scheme = schemeMatches[i] || 'https';
      const host = hostMatches[i] || 'example.com';
      const uri = `${scheme}://${host}/fuzz-path-${i}`;
      cases.push({
        id: `manifest-${i}`,
        uri,
        source: 'AndroidManifest.xml',
        issue: 'Manifest deep link discovered; fuzz path generated for handler validation.',
        canReplay: true,
      });
    }
  }

  return cases.slice(0, 20);
}

async function buildApkDiffInsight(workspaceRoot: string, moduleName: string): Promise<ApkDiffInsight> {
  const apkRoot = path.join(workspaceRoot, moduleName, 'build', 'outputs', 'apk');
  if (!fs.existsSync(apkRoot)) {
    return {
      sizeDeltaBytes: 0,
      dexDeltaBytes: 0,
      nativeDeltaBytes: 0,
      resourceDuplicationHints: [],
      insights: ['No APK outputs found yet. Build Debug/Release to unlock APK diff intelligence.'],
    };
  }

  const apks: string[] = [];
  const walk = (dir: string): void => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        walk(full);
      } else if (item.isFile() && full.endsWith('.apk')) {
        apks.push(full);
      }
    }
  };
  walk(apkRoot);
  if (apks.length < 2) {
    const latest = findLatestApk(workspaceRoot, moduleName);
    return {
      oldApk: undefined,
      newApk: latest,
      sizeDeltaBytes: 0,
      dexDeltaBytes: 0,
      nativeDeltaBytes: 0,
      resourceDuplicationHints: [],
      insights: ['Need at least two APK artifacts to compute a meaningful diff.'],
    };
  }

  apks.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  const [newApk, oldApk] = [apks[0], apks[1]];
  const sizeDeltaBytes = fs.statSync(newApk).size - fs.statSync(oldApk).size;

  const parseJar = async (apkPath: string): Promise<Array<{ path: string; size: number }>> => {
    const result = await execCommand('jar', ['tvf', apkPath], { timeout: 60_000 });
    if (result.exitCode !== 0) {
      return [];
    }
    return result.stdout
      .split(/\r?\n/)
      .map(line => {
        const match = line.trim().match(/^([0-9]+)\s+\S+\s+\S+\s+(.+)$/);
        if (!match) {
          return undefined;
        }
        return { size: Number.parseInt(match[1], 10), path: match[2] };
      })
      .filter((item): item is { path: string; size: number } => Boolean(item));
  };

  const [newEntries, oldEntries] = await Promise.all([parseJar(newApk), parseJar(oldApk)]);
  const sumPrefix = (entries: Array<{ path: string; size: number }>, prefix: string): number =>
    entries.filter(item => item.path.startsWith(prefix)).reduce((sum, item) => sum + item.size, 0);
  const dexDeltaBytes = sumPrefix(newEntries, 'classes') - sumPrefix(oldEntries, 'classes');
  const nativeDeltaBytes = sumPrefix(newEntries, 'lib/') - sumPrefix(oldEntries, 'lib/');

  const resourceNames = new Map<string, number>();
  for (const entry of newEntries) {
    if (!entry.path.startsWith('res/')) {
      continue;
    }
    const base = path.basename(entry.path);
    resourceNames.set(base, (resourceNames.get(base) || 0) + 1);
  }
  const resourceDuplicationHints = Array.from(resourceNames.entries())
    .filter(([, count]) => count > 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => `${name} appears ${count} times across resource qualifiers.`);

  const insights: string[] = [];
  if (sizeDeltaBytes > 0) {
    insights.push(`APK grew by ${(sizeDeltaBytes / 1024).toFixed(1)} KB.`);
  } else if (sizeDeltaBytes < 0) {
    insights.push(`APK shrank by ${(Math.abs(sizeDeltaBytes) / 1024).toFixed(1)} KB.`);
  } else {
    insights.push('APK size unchanged between latest two builds.');
  }
  if (dexDeltaBytes > 0) {
    insights.push(`Dex footprint increased ${(dexDeltaBytes / 1024).toFixed(1)} KB. Review dependency additions and R8 keep rules.`);
  }
  if (nativeDeltaBytes > 0) {
    insights.push(`Native libs increased ${(nativeDeltaBytes / 1024).toFixed(1)} KB. Validate ABI splits and strip symbols.`);
  }
  if (resourceDuplicationHints.length > 0) {
    insights.push('Potential resource duplication detected. Consider vector/shared asset consolidation.');
  }

  return {
    oldApk,
    newApk,
    sizeDeltaBytes,
    dexDeltaBytes,
    nativeDeltaBytes,
    resourceDuplicationHints,
    insights,
  };
}

function defaultPlaybooks(): TeamPlaybook[] {
  return [
    {
      id: 'crash-spike',
      title: 'Crash Spike',
      steps: [
        { label: 'Open Crash/ANR Triage', commandId: 'android-toolkit.openCrashAnrTriage' },
        { label: 'Open Failure Insights', commandId: 'android-toolkit.openFailureInsights' },
        { label: 'Open Error Knowledge Base', commandId: 'android-toolkit.openErrorKnowledgeBase' },
      ],
    },
    {
      id: 'release-blocker',
      title: 'Release Blocker',
      steps: [
        { label: 'Run Release Quality Gate', commandId: 'android-toolkit.releaseQualityGate' },
        { label: 'Run Performance Guardrail', commandId: 'android-toolkit.performanceRegressionGuardrail' },
        { label: 'Open Team Policy Drift Report', commandId: 'android-toolkit.teamPolicyDriftReport' },
      ],
    },
    {
      id: 'device-only-bug',
      title: 'Device-only Bug',
      steps: [
        { label: 'Open Matrix Dashboard', commandId: 'android-toolkit.openMatrixDashboard' },
        { label: 'Open Deep Link Studio', commandId: 'android-toolkit.openDeepLinkStudio' },
        { label: 'Open Logcat', commandId: 'android-toolkit.openLogcat' },
      ],
    },
  ];
}

async function computeFocusedPrChecks(workspaceRoot: string): Promise<{ changedFiles: string[]; focusedChecks: FocusedPrCheck[] }> {
  const diff = await execCommand('git', ['diff', '--name-only', 'HEAD~1...HEAD'], {
    cwd: workspaceRoot,
    timeout: 30_000,
    env: process.env,
  });
  const changedFiles = diff.exitCode === 0
    ? diff.stdout.split(/\r?\n/).map(x => x.trim()).filter(Boolean)
    : [];
  const focusedChecks: FocusedPrCheck[] = [];

  if (changedFiles.some(file => file.includes('AndroidManifest.xml'))) {
    focusedChecks.push({
      trigger: 'Manifest changed',
      checks: ['android-toolkit.manifestDiffAssistant', 'android-toolkit.teamPolicyDriftReport'],
    });
  }
  if (changedFiles.some(file => file.endsWith('build.gradle') || file.endsWith('build.gradle.kts'))) {
    focusedChecks.push({
      trigger: 'Gradle changed',
      checks: ['android-toolkit.gradleDoctor', 'android-toolkit.performanceRegressionGuardrail'],
    });
  }
  if (changedFiles.some(file => file.includes('/res/navigation/') || file.includes('DeepLink') || file.includes('deeplink'))) {
    focusedChecks.push({
      trigger: 'Navigation / deep link changed',
      checks: ['android-toolkit.openDeepLinkStudio'],
    });
  }
  if (focusedChecks.length === 0) {
    focusedChecks.push({
      trigger: 'General change set',
      checks: ['android-toolkit.ciSmoke', 'android-toolkit.openRunPanel'],
    });
  }
  return { changedFiles, focusedChecks };
}

function readObservabilitySnapshots(workspaceRoot: string): ObservabilityCorrelation[] {
  const dir = path.join(workspaceRoot, '.android-tools', 'observability');
  if (!fs.existsSync(dir)) {
    return [];
  }
  const files = fs.readdirSync(dir).filter(file => file.endsWith('.json')).slice(0, 8);
  const out: ObservabilityCorrelation[] = [];
  for (const file of files) {
    const full = path.join(dir, file);
    try {
      const json = JSON.parse(readText(full)) as {
        provider?: string;
        buildFingerprint?: string;
        crashSpikeWindow?: string;
        summary?: string;
        changesSinceHealthy?: string[];
      };
      out.push({
        provider: json.provider || file,
        buildFingerprint: json.buildFingerprint || 'unknown',
        crashSpikeWindow: json.crashSpikeWindow,
        summary: json.summary || 'No summary provided.',
        changesSinceHealthy: Array.isArray(json.changesSinceHealthy) ? json.changesSinceHealthy : [],
      });
    } catch {
      out.push({
        provider: file,
        buildFingerprint: 'unknown',
        summary: 'Could not parse snapshot JSON.',
        changesSinceHealthy: [],
      });
    }
  }
  return out;
}

export async function buildIntelligenceHubSnapshot(input: {
  workspaceRoot: string;
  crashRecords: CrashLikeRecord[];
  runFailureRecords: RunFailureRecord[];
  slowPathMetrics: SlowPathRecord[];
  startupTotalMs: number;
  performanceBaseline?: PerformanceBaselineLike;
  matrixHistory: unknown;
  releaseOverride?: ReleaseRiskOverride;
}): Promise<IntelligenceHubSnapshot> {
  const workspaceRoot = input.workspaceRoot;
  const modules = findApplicationModules(workspaceRoot);
  const moduleName = modules[0] || 'app';
  const gradlePath = [
    path.join(workspaceRoot, moduleName, 'build.gradle'),
    path.join(workspaceRoot, moduleName, 'build.gradle.kts'),
  ].find(file => fs.existsSync(file));
  const gradleText = gradlePath ? readText(gradlePath) : '';
  const manifestPath = path.join(workspaceRoot, moduleName, 'src', 'main', 'AndroidManifest.xml');
  const manifestText = fs.existsSync(manifestPath) ? readText(manifestPath) : '';

  const sdkAbi = extractSdkAndAbi(gradleText);
  const manifestInfo = parseManifestInfo(manifestText);
  const devicesRaw = await listDevicesDetailed();
  const devices = devicesRaw
    .filter(device => device.status === 'online')
    .map(device => ({
      id: device.id,
      apiLevel: Number.parseInt(device.androidVersion || '0', 10) || 0,
      abi: device.model || 'unknown',
    }));
  const matrixHistory = readMatrixHistory(input.matrixHistory);
  const flakyHotspots = computeFlakyHotspots(matrixHistory);
  const recommendedDevices = pickRecommendedDevices(devices, sdkAbi.minSdk, sdkAbi.targetSdk, sdkAbi.abiFilters);

  const crashLikeRecords: CrashLikeRecord[] = [
    ...input.crashRecords,
    ...input.runFailureRecords.slice(0, 120).map(row => ({
      type: 'crash' as const,
      signature: row.reason,
      message: row.message,
      source: row.message,
      timestamp: row.timestamp,
    })),
  ];
  const crashClusters = clusterCrashes(crashLikeRecords.slice(0, 300));

  const now = Date.now();
  const recent = input.crashRecords.filter(row => now - row.timestamp <= 7 * 24 * 60 * 60 * 1000);
  const prior = input.crashRecords.filter(row => {
    const age = now - row.timestamp;
    return age > 7 * 24 * 60 * 60 * 1000 && age <= 14 * 24 * 60 * 60 * 1000;
  });
  const recentAnr = recent.filter(row => row.type === 'anr').length;
  const priorAnr = prior.filter(row => row.type === 'anr').length;
  const anrTrend = priorAnr === 0 ? (recentAnr > 0 ? 70 : 0) : ((recentAnr - priorAnr) / Math.max(1, priorAnr)) * 100;

  const startupRegressionMs = input.performanceBaseline
    ? Math.max(0, input.startupTotalMs - input.performanceBaseline.startupTotalMs)
    : 0;

  const mappingPath = path.join(workspaceRoot, moduleName, 'build', 'outputs', 'mapping', 'release', 'mapping.txt');
  const mappingDrift = fs.existsSync(mappingPath) ? 0 : 85;

  const permissionChangesResult = await execCommand('git', ['diff', '--name-only', 'HEAD~1...HEAD', '--', '**/AndroidManifest.xml'], {
    cwd: workspaceRoot,
    timeout: 20_000,
    env: process.env,
  });
  const permissionChanges = permissionChangesResult.exitCode === 0
    ? permissionChangesResult.stdout.split(/\r?\n/).map(x => x.trim()).filter(Boolean).length
    : 0;

  const flakyRows = matrixHistory.filter(row => row.mode === 'tests' || row.mode === 'smoke');
  const flakyFailCount = flakyRows.filter(row => !row.ok).length;
  const flakyRate = flakyRows.length > 0 ? flakyFailCount / flakyRows.length : 0;

  const releaseSignals = scoreReleaseRiskSignals({
    anrTrend,
    startupRegressionMs,
    mappingDrift,
    permissionChanges,
    testFlakyRate: flakyRate,
  });
  const threshold = 65;
  const blocked = releaseSignals.score >= threshold && !input.releaseOverride;

  const topSlow = bestSlowFingerprint(input.slowPathMetrics);
  const startup: StartupAttribution = {
    headline: `p95 startup +${Math.round(startupRegressionMs)} ms is most correlated with ${topSlow.stage}`,
    p95DeltaMs: Math.round(startupRegressionMs),
    stage: topSlow.stage,
    fingerprint: topSlow.fingerprint,
    suggestedDeferralPlan: [
      `Move heavy work from ${topSlow.stage} to lazy/first-use execution.`,
      'Guard optional initialization behind feature usage instead of startup path.',
      'Split synchronous startup chain into two phases: critical + deferred.',
    ],
  };

  const policyRules = readPolicyRules(workspaceRoot);
  const policyIssues = collectPolicyIssues(workspaceRoot, moduleName, policyRules.rules);
  const deepLinks = generateDeepLinkCases(workspaceRoot);
  const apkDiff = await buildApkDiffInsight(workspaceRoot, moduleName);
  const playbooks = defaultPlaybooks();
  const prAssistant = await computeFocusedPrChecks(workspaceRoot);
  const observability = readObservabilitySnapshots(workspaceRoot);

  return {
    generatedAt: new Date().toISOString(),
    crashClusters,
    matrix: {
      moduleName,
      packageName: findApplicationId(workspaceRoot, moduleName) || '',
      minSdk: sdkAbi.minSdk,
      targetSdk: sdkAbi.targetSdk,
      abiFilters: sdkAbi.abiFilters,
      featureFlags: manifestInfo.features,
      devices: recommendedDevices,
      flakyHotspots,
    },
    releaseRisk: {
      score: releaseSignals.score,
      threshold,
      blocked,
      override: input.releaseOverride,
      signals: releaseSignals.signals,
    },
    startup,
    policy: {
      policyFile: policyRules.file,
      issues: policyIssues,
    },
    deepLinks,
    apkDiff,
    playbooks,
    prAssistant,
    observability,
  };
}

export async function runSmartMatrixSmoke(workspaceRoot: string, snapshot: IntelligenceHubSnapshot): Promise<MatrixSmokeResult> {
  const moduleName = snapshot.matrix.moduleName;
  const packageName = snapshot.matrix.packageName;
  const variant = 'Debug';

  const build = await runGradleTaskWithResult(workspaceRoot, `:${moduleName}:assemble${variant}`);
  if (build.exitCode !== 0) {
    throw new Error('Build failed while preparing smart matrix smoke run.');
  }
  const apk = findLatestApk(workspaceRoot, moduleName, variant);
  if (!apk) {
    throw new Error('No APK found after assemble task.');
  }

  const rows: MatrixSmokeResult['rows'] = [];
  for (const device of snapshot.matrix.devices) {
    let retries = 0;
    let success = false;
    let message = 'No attempt executed.';
    const flakyHint = snapshot.matrix.flakyHotspots.find(item => item.deviceId === device.id)?.retryHint || 0;
    const maxAttempts = 1 + Math.max(0, Math.min(2, flakyHint));
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const install = await AdbService.installApk(device.id, apk);
      if (!install.success) {
        message = install.message;
        retries += 1;
        continue;
      }
      const start = await AdbService.startApp(device.id, packageName);
      if (!start.success) {
        message = start.message;
        retries += 1;
        continue;
      }
      const stop = await AdbService.forceStopApp(device.id, packageName);
      if (!stop.success) {
        message = stop.message;
        retries += 1;
        continue;
      }
      success = true;
      message = 'install/start/stop smoke path passed';
      break;
    }
    rows.push({
      deviceId: device.id,
      success,
      retries: Math.max(0, retries - (success ? 1 : 0)),
      message,
    });
  }

  return {
    moduleName,
    variant,
    packageName,
    rows,
  };
}

export function renderHeatmapComment(result: MatrixSmokeResult): string {
  const lines: string[] = [];
  lines.push('### Android Smart Matrix Heatmap');
  lines.push('');
  lines.push(`Target: ${result.moduleName} (${result.variant})`);
  lines.push('');
  lines.push('| Device | Result | Retries | Notes |');
  lines.push('| --- | --- | ---: | --- |');
  for (const row of result.rows) {
    lines.push(`| ${row.deviceId} | ${row.success ? 'PASS' : 'FAIL'} | ${row.retries} | ${row.message.replace(/\|/g, '\\/|')} |`);
  }
  return lines.join('\n');
}

export function renderIntelligenceHubMarkdown(snapshot: IntelligenceHubSnapshot): string {
  const lines: string[] = [];
  lines.push('# AI Intelligence Hub');
  lines.push('');
  lines.push(`Generated: ${snapshot.generatedAt}`);
  lines.push('');

  lines.push('## AI Crash Triage Hub');
  lines.push('');
  lines.push('| Cluster | Count | Confidence | Suggested Fix | Probable File | Why |');
  lines.push('| --- | ---: | ---: | --- | --- | --- |');
  for (const cluster of snapshot.crashClusters) {
    lines.push(`| ${cluster.title} | ${cluster.count} | ${cluster.confidence}% | [${cluster.suggestedFixLabel}](command:${cluster.suggestedCommandId}) | ${cluster.probableFile || '-'} | ${cluster.why} |`);
  }
  lines.push('');

  lines.push('## Smart Device Test Matrix');
  lines.push('');
  lines.push(`Module: ${snapshot.matrix.moduleName}  `);
  lines.push(`Package: ${snapshot.matrix.packageName || 'unknown'}  `);
  lines.push(`minSdk/targetSdk: ${snapshot.matrix.minSdk}/${snapshot.matrix.targetSdk}  `);
  lines.push(`ABI filters: ${snapshot.matrix.abiFilters.length > 0 ? snapshot.matrix.abiFilters.join(', ') : 'none declared'}  `);
  lines.push(`Features: ${snapshot.matrix.featureFlags.length > 0 ? snapshot.matrix.featureFlags.join(', ') : 'none declared'}  `);
  lines.push('');
  lines.push('| Device | API | ABI | Selection Reason |');
  lines.push('| --- | ---: | --- | --- |');
  for (const device of snapshot.matrix.devices) {
    lines.push(`| ${device.id} | ${device.apiLevel} | ${device.abi} | ${device.reason} |`);
  }
  lines.push('');
  lines.push('[Run Smart Matrix Smoke (with flaky retries)](command:android-toolkit.runIntelligenceMatrixSmoke)');
  lines.push('');
  if (snapshot.matrix.flakyHotspots.length > 0) {
    lines.push('| Flaky Hotspot | Pass | Fail | Retry Hint |');
    lines.push('| --- | ---: | ---: | ---: |');
    for (const row of snapshot.matrix.flakyHotspots) {
      lines.push(`| ${row.deviceId} / ${row.target} | ${row.pass} | ${row.fail} | ${row.retryHint} |`);
    }
    lines.push('');
  }
  lines.push('[Export PR Heatmap Comment](command:android-toolkit.exportIntelligencePrHeatmap)');
  lines.push('');

  lines.push('## Release Risk Score');
  lines.push('');
  lines.push(`Risk score: **${snapshot.releaseRisk.score} / 100** (threshold ${snapshot.releaseRisk.threshold})  `);
  lines.push(`Gate: **${snapshot.releaseRisk.blocked ? 'BLOCKED' : 'PASS'}**  `);
  if (snapshot.releaseRisk.override) {
    lines.push(`Override: approved by ${snapshot.releaseRisk.override.approvedBy} at ${new Date(snapshot.releaseRisk.override.approvedAt).toISOString()} (${snapshot.releaseRisk.override.reason})  `);
  }
  lines.push('');
  lines.push('| Signal | Score | Detail |');
  lines.push('| --- | ---: | --- |');
  for (const signal of snapshot.releaseRisk.signals) {
    lines.push(`| ${signal.label} | ${signal.score} | ${signal.detail} |`);
  }
  lines.push('');
  if (snapshot.releaseRisk.blocked) {
    lines.push('[Approve Release Override](command:android-toolkit.approveReleaseRiskOverride)');
    lines.push('');
  }

  lines.push('## Startup Performance Guard');
  lines.push('');
  lines.push(`${snapshot.startup.headline}  `);
  lines.push(`Attributed stage: ${snapshot.startup.stage}  `);
  lines.push(`Fingerprint: ${snapshot.startup.fingerprint}  `);
  lines.push('');
  lines.push('Suggested init deferral plan:');
  for (const step of snapshot.startup.suggestedDeferralPlan) {
    lines.push(`- ${step}`);
  }
  lines.push('');

  lines.push('## Policy-as-Code for Android Teams');
  lines.push('');
  lines.push(`Policy file: ${snapshot.policy.policyFile || 'not found'}  `);
  if (snapshot.policy.issues.length === 0) {
    lines.push('No policy drift detected.');
  } else {
    lines.push('| Policy Issue | Expected | Actual | Auto-fix | Why Rule Exists |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const issue of snapshot.policy.issues) {
      lines.push(`| ${issue.title} | ${issue.expected} | ${issue.actual} | ${issue.safeAutoFix ? 'safe' : 'manual'} | ${issue.why || '-'} |`);
    }
    lines.push('');
    lines.push('[Enforce Policy Locally (safe auto-fix)](command:android-toolkit.enforcePolicyAsCode)');
  }
  lines.push('');

  lines.push('## Deep Link Fuzz + Contract Validator');
  lines.push('');
  if (snapshot.deepLinks.length === 0) {
    lines.push('No deep links discovered from nav graph/manifest.');
  } else {
    lines.push('| Deep Link | Source | Validation Note | Replay |');
    lines.push('| --- | --- | --- | --- |');
    for (const row of snapshot.deepLinks.slice(0, 12)) {
      lines.push(`| ${row.uri} | ${row.source} | ${row.issue} | ${row.canReplay ? '[Replay failing case](command:android-toolkit.replayDeepLinkFuzzCase)' : '-'} |`);
    }
  }
  lines.push('');

  lines.push('## APK Diff Intelligence');
  lines.push('');
  lines.push(`New APK: ${snapshot.apkDiff.newApk || 'n/a'}  `);
  lines.push(`Old APK: ${snapshot.apkDiff.oldApk || 'n/a'}  `);
  lines.push(`Size delta: ${(snapshot.apkDiff.sizeDeltaBytes / 1024).toFixed(1)} KB  `);
  lines.push(`Dex delta: ${(snapshot.apkDiff.dexDeltaBytes / 1024).toFixed(1)} KB  `);
  lines.push(`Native delta: ${(snapshot.apkDiff.nativeDeltaBytes / 1024).toFixed(1)} KB  `);
  for (const insight of snapshot.apkDiff.insights) {
    lines.push(`- ${insight}`);
  }
  for (const hint of snapshot.apkDiff.resourceDuplicationHints) {
    lines.push(`- ${hint}`);
  }
  lines.push('');

  lines.push('## Team Playbooks');
  lines.push('');
  for (const playbook of snapshot.playbooks) {
    lines.push(`- **${playbook.title}**: [Run playbook](command:android-toolkit.runTeamPlaybook)`);
  }
  lines.push('');

  lines.push('## PR Quality Assistant');
  lines.push('');
  lines.push(`Changed files inspected: ${snapshot.prAssistant.changedFiles.length}`);
  lines.push('');
  for (const row of snapshot.prAssistant.focusedChecks) {
    lines.push(`- ${row.trigger}: ${row.checks.join(', ')}`);
  }
  lines.push('');
  lines.push('[Run Focused PR Checks](command:android-toolkit.runFocusedPrChecks)');
  lines.push('');

  lines.push('## Observability Bridge');
  lines.push('');
  if (snapshot.observability.length === 0) {
    lines.push('No provider snapshots found. Add JSON files under `.android-tools/observability/` for Crashlytics/Sentry/Datadog correlation.');
  } else {
    lines.push('| Provider | Build Fingerprint | Crash Spike Window | Summary | Changes Since Last Healthy |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const row of snapshot.observability) {
      lines.push(`| ${row.provider} | ${row.buildFingerprint} | ${row.crashSpikeWindow || '-'} | ${row.summary} | ${row.changesSinceHealthy.join('; ') || '-'} |`);
    }
  }

  return lines.join('\n');
}

export async function enforcePolicyAsCode(workspaceRoot: string, snapshot: IntelligenceHubSnapshot): Promise<{ fixed: number; remaining: number; details: string[] }> {
  const rules = readPolicyRules(workspaceRoot);
  if (!rules.rules) {
    return { fixed: 0, remaining: 0, details: ['No policy file found.'] };
  }

  const moduleName = snapshot.matrix.moduleName;
  const gradlePath = [
    path.join(workspaceRoot, moduleName, 'build.gradle'),
    path.join(workspaceRoot, moduleName, 'build.gradle.kts'),
  ].find(file => fs.existsSync(file));
  const manifestPath = path.join(workspaceRoot, moduleName, 'src', 'main', 'AndroidManifest.xml');
  const details: string[] = [];
  let fixed = 0;

  if (gradlePath && typeof rules.rules.gradle?.minSdk === 'number') {
    const before = readText(gradlePath);
    const after = before.replace(/\bminSdk(?:Version)?\s*(?:=)?\s*\d+/, match => match.replace(/\d+/, String(rules.rules!.gradle!.minSdk)));
    if (after !== before) {
      fs.writeFileSync(gradlePath, after);
      fixed += 1;
      details.push(`Updated minSdk in ${path.relative(workspaceRoot, gradlePath)}.`);
    }
  }

  if (gradlePath && typeof rules.rules.gradle?.targetSdk === 'number') {
    const before = readText(gradlePath);
    const after = before.replace(/\btargetSdk(?:Version)?\s*(?:=)?\s*\d+/, match => match.replace(/\d+/, String(rules.rules!.gradle!.targetSdk)));
    if (after !== before) {
      fs.writeFileSync(gradlePath, after);
      fixed += 1;
      details.push(`Updated targetSdk in ${path.relative(workspaceRoot, gradlePath)}.`);
    }
  }

  if (fs.existsSync(manifestPath)) {
    const requiredPermissions = rules.rules.manifest?.requiredPermissions || [];
    if (requiredPermissions.length > 0) {
      let manifest = readText(manifestPath);
      let manifestChanged = false;
      for (const permission of requiredPermissions) {
        if (!manifest.includes(permission)) {
          manifest = manifest.replace(
            /<application\b/,
            `    <uses-permission android:name="${permission}" />\n\n    <application`
          );
          manifestChanged = true;
          details.push(`Added manifest permission ${permission}.`);
        }
      }
      if (manifestChanged) {
        fs.writeFileSync(manifestPath, manifest);
        fixed += 1;
      }
    }
  }

  return {
    fixed,
    remaining: Math.max(0, snapshot.policy.issues.length - fixed),
    details,
  };
}

export async function replayDeepLinkCase(snapshot: IntelligenceHubSnapshot, deviceId?: string): Promise<string> {
  const candidate = snapshot.deepLinks.find(item => item.canReplay);
  if (!candidate) {
    return 'No replayable deep-link case found.';
  }
  if (!deviceId) {
    return 'No target device selected. Select a device first.';
  }
  const packageName = snapshot.matrix.packageName || undefined;
  const result = await AdbService.startDeepLink(deviceId, candidate.uri, packageName);
  return result.message;
}

export async function runFocusedPrChecks(workspaceRoot: string, snapshot: IntelligenceHubSnapshot): Promise<string[]> {
  const executed: string[] = [];
  for (const group of snapshot.prAssistant.focusedChecks) {
    for (const check of group.checks) {
      if (check === 'android-toolkit.ciSmoke') {
        const smoke = await execCommand('npm', ['run', '-s', 'test:smoke'], {
          cwd: workspaceRoot,
          timeout: 12 * 60 * 1000,
          env: process.env,
        });
        executed.push(`${check}: ${smoke.exitCode === 0 ? 'PASS' : 'FAIL'}`);
        continue;
      }
      executed.push(`${check}: queued`);
    }
  }
  return executed;
}

export async function runPlaybook(playbook: TeamPlaybook): Promise<string[]> {
  const lines: string[] = [];
  for (const step of playbook.steps) {
    lines.push(`- ${step.label}: execute command ${step.commandId}`);
  }
  return lines;
}
