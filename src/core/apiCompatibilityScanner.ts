import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { findApplicationModules } from './androidProject';
import { showError, showInfo, showWarning } from '../ui/notifications';

interface ApiRule {
  id: string;
  minApi: number;
  description: string;
  fix: string;
  patterns: RegExp[];
  extensions: string[];
}

interface ApiFinding {
  moduleName: string;
  filePath: string;
  line: number;
  minSdk: number;
  targetSdk?: number;
  rule: ApiRule;
  snippet: string;
}

const SCAN_EXTENSIONS = new Set(['.kt', '.kts', '.java', '.xml']);
const IGNORED_DIRS = new Set(['.git', '.gradle', '.idea', 'build', 'node_modules', 'out']);

const RULES: ApiRule[] = [
  {
    id: 'notification-channel',
    minApi: 26,
    description: 'NotificationChannel API',
    fix: 'Use NotificationCompat for lower APIs or guard with Build.VERSION.SDK_INT >= 26.',
    patterns: [/(\bNotificationChannel\b|\bcreateNotificationChannel\s*\()/g],
    extensions: ['.kt', '.kts', '.java'],
  },
  {
    id: 'start-foreground-service',
    minApi: 26,
    description: 'startForegroundService usage',
    fix: 'Fallback to startService on API < 26 or use ServiceCompat helpers.',
    patterns: [/\bstartForegroundService\s*\(/g],
    extensions: ['.kt', '.kts', '.java'],
  },
  {
    id: 'biometric-prompt',
    minApi: 28,
    description: 'BiometricPrompt framework API',
    fix: 'Prefer androidx.biometric.BiometricPrompt and add API guard if framework class is used.',
    patterns: [/\bandroid\.hardware\.biometrics\.BiometricPrompt\b/g, /\bnew\s+BiometricPrompt\b/g],
    extensions: ['.kt', '.kts', '.java'],
  },
  {
    id: 'window-insets-controller',
    minApi: 30,
    description: 'WindowInsetsController API',
    fix: 'Use WindowInsetsControllerCompat for lower API support.',
    patterns: [/\bWindowInsetsController\b/g],
    extensions: ['.kt', '.kts', '.java'],
  },
  {
    id: 'post-notifications',
    minApi: 33,
    description: 'POST_NOTIFICATIONS permission',
    fix: 'Request permission only on API 33+ and keep runtime gate around code paths.',
    patterns: [/\bPOST_NOTIFICATIONS\b/g, /android\.permission\.POST_NOTIFICATIONS/g],
    extensions: ['.kt', '.kts', '.java', '.xml'],
  },
  {
    id: 'read-media-images',
    minApi: 33,
    description: 'READ_MEDIA_IMAGES permission',
    fix: 'Use READ_EXTERNAL_STORAGE fallback for API < 33 where applicable.',
    patterns: [/\bREAD_MEDIA_IMAGES\b/g, /android\.permission\.READ_MEDIA_IMAGES/g],
    extensions: ['.kt', '.kts', '.java', '.xml'],
  },
  {
    id: 'foreground-service-type',
    minApi: 29,
    description: 'android:foregroundServiceType attribute',
    fix: 'Guard service start path and verify manifest behavior for API < 29.',
    patterns: [/\bandroid:foregroundServiceType\b/g],
    extensions: ['.xml'],
  },
];

function readGradleFile(workspaceRoot: string, moduleName: string): string | undefined {
  const files = [
    path.join(workspaceRoot, moduleName, 'build.gradle'),
    path.join(workspaceRoot, moduleName, 'build.gradle.kts'),
  ];
  for (const filePath of files) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    return fs.readFileSync(filePath, 'utf8');
  }
  return undefined;
}

function readSdkLevels(workspaceRoot: string, moduleName: string): { minSdk?: number; targetSdk?: number } {
  const content = readGradleFile(workspaceRoot, moduleName);
  if (!content) {
    return {};
  }
  const minMatch =
    content.match(/\bminSdk(?:Version)?\s*(?:=)?\s*(\d+)/) ||
    content.match(/\bminSdkPreview\s*(?:=)?\s*["'](\d+)["']/);
  const targetMatch = content.match(/\btargetSdk(?:Version)?\s*(?:=)?\s*(\d+)/);
  const minSdk = minMatch ? Number.parseInt(minMatch[1], 10) : undefined;
  const targetSdk = targetMatch ? Number.parseInt(targetMatch[1], 10) : undefined;
  return {
    minSdk: Number.isFinite(minSdk) && (minSdk as number) > 0 ? minSdk : undefined,
    targetSdk: Number.isFinite(targetSdk) && (targetSdk as number) > 0 ? targetSdk : undefined,
  };
}

function walkFiles(root: string, onFile: (filePath: string) => void): void {
  if (!fs.existsSync(root)) {
    return;
  }
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    const stat = fs.statSync(current);
    if (!stat.isDirectory()) {
      onFile(current);
      continue;
    }
    for (const entry of fs.readdirSync(current)) {
      if (IGNORED_DIRS.has(entry)) {
        continue;
      }
      stack.push(path.join(current, entry));
    }
  }
}

function lineFromOffset(content: string, offset: number): number {
  return content.slice(0, Math.max(0, offset)).split('\n').length;
}

function lineSnippet(content: string, line: number): string {
  const lines = content.split('\n');
  return (lines[Math.max(0, line - 1)] || '').trim();
}

function scanModule(workspaceRoot: string, moduleName: string): ApiFinding[] {
  const moduleRoot = path.join(workspaceRoot, moduleName);
  if (!fs.existsSync(moduleRoot)) {
    return [];
  }
  const sdk = readSdkLevels(workspaceRoot, moduleName);
  const minSdk = sdk.minSdk;
  if (!minSdk) {
    return [];
  }
  const findings: ApiFinding[] = [];
  const seen = new Set<string>();
  walkFiles(moduleRoot, (filePath) => {
    const ext = path.extname(filePath);
    if (!SCAN_EXTENSIONS.has(ext)) {
      return;
    }
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      return;
    }
    for (const rule of RULES) {
      if (!rule.extensions.includes(ext)) {
        continue;
      }
      for (const pattern of rule.patterns) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(content)) !== null) {
          if (rule.minApi <= minSdk) {
            continue;
          }
          const line = lineFromOffset(content, match.index);
          const key = `${moduleName}:${filePath}:${line}:${rule.id}`;
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);
          findings.push({
            moduleName,
            filePath,
            line,
            minSdk,
            targetSdk: sdk.targetSdk,
            rule,
            snippet: lineSnippet(content, line),
          });
        }
      }
    }
  });
  return findings.sort((a, b) => b.rule.minApi - a.rule.minApi || a.filePath.localeCompare(b.filePath) || a.line - b.line);
}

function reportPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.artifacts', 'api-compatibility-report.md');
}

function buildReport(findings: ApiFinding[]): string {
  const generatedAt = new Date().toISOString();
  const lines: string[] = [];
  lines.push('# API Compatibility Report');
  lines.push('');
  lines.push(`Generated: ${generatedAt}`);
  lines.push(`Findings: ${findings.length}`);
  lines.push('');
  if (findings.length === 0) {
    lines.push('No incompatible API usage found for selected modules.');
    return lines.join('\n');
  }
  let index = 1;
  for (const finding of findings) {
    lines.push(`## ${index}. ${finding.rule.description}`);
    lines.push(`- Module: \`${finding.moduleName}\``);
    lines.push(`- File: \`${finding.filePath}\``);
    lines.push(`- Line: ${finding.line}`);
    lines.push(`- minSdk: ${finding.minSdk}`);
    lines.push(`- targetSdk: ${finding.targetSdk ?? 'n/a'}`);
    lines.push(`- Required API: ${finding.rule.minApi}`);
    lines.push(`- Suggested fix: ${finding.rule.fix}`);
    if (finding.snippet) {
      lines.push('- Snippet:');
      lines.push('```');
      lines.push(finding.snippet);
      lines.push('```');
    }
    lines.push('');
    index += 1;
  }
  return lines.join('\n');
}

async function openAtFinding(finding: ApiFinding): Promise<void> {
  const document = await vscode.workspace.openTextDocument(finding.filePath);
  const editor = await vscode.window.showTextDocument(document, { preview: false });
  const lineIndex = Math.max(0, finding.line - 1);
  const position = new vscode.Position(lineIndex, 0);
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
}

export async function runApiCompatibilityScanner(): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    showError('No workspace folder open.');
    return;
  }
  const modules = findApplicationModules(workspaceRoot);
  if (modules.length === 0) {
    showWarning('No Android application modules found.');
    return;
  }
  const modulePick = await vscode.window.showQuickPick(
    [
      { label: 'All application modules', value: '__all__' },
      ...modules.map(moduleName => ({ label: moduleName, value: moduleName })),
    ],
    { placeHolder: 'Select module scope for API Compatibility Scanner' }
  );
  if (!modulePick) {
    return;
  }
  const selectedModules = modulePick.value === '__all__' ? modules : [modulePick.value];
  const findings = selectedModules.flatMap(moduleName => scanModule(workspaceRoot, moduleName));
  const report = buildReport(findings);
  const filePath = reportPath(workspaceRoot);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, report, 'utf8');
  const reportDocument = await vscode.workspace.openTextDocument(filePath);
  await vscode.window.showTextDocument(reportDocument, { preview: false });
  if (findings.length === 0) {
    showInfo('API Compatibility Scanner: no blocking findings.');
    return;
  }
  showWarning(`API Compatibility Scanner found ${findings.length} issue(s). Review suggested fixes in report.`);
  const navigatePick = await vscode.window.showQuickPick(
    findings.slice(0, 60).map((finding) => ({
      label: `[API ${finding.rule.minApi}] ${path.basename(finding.filePath)}:${finding.line}`,
      description: `${finding.moduleName} • minSdk ${finding.minSdk} • ${finding.rule.description}`,
      detail: finding.rule.fix,
      finding,
    })),
    { placeHolder: 'Jump to finding (optional)' }
  );
  if (!navigatePick) {
    return;
  }
  await openAtFinding(navigatePick.finding);
}
