import * as vscode from 'vscode';
import { execCommand } from './cli';
import { parseJavaMajorVersion, parseJavaVersionLabel } from './javaVersion';
interface RequiredExtension {
  id: string;
  name: string;
  url: string;
}
const JAVA25_NOTICE_KEY = 'androidTools.langNotice.java25.lastShown';
const MISSING_EXT_NOTICE_KEY = 'androidTools.langNotice.missingExt.lastShown';
const NOTICE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
let contextStore: vscode.Memento | undefined;
const REQUIRED_EXTENSIONS: Record<string, RequiredExtension> = {
  java: {
    id: 'vscjava.vscode-java-pack',
    name: 'Extension Pack for Java',
    url: 'https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-java-pack'
  },
  kotlin: {
    id: 'fwcd.kotlin',
    name: 'Kotlin Language',
    url: 'https://marketplace.visualstudio.com/items?itemName=fwcd.kotlin'
  }
};
async function getJavaMajorVersion(): Promise<number | undefined> {
  try {
    const result = await execCommand('java', ['-version'], { timeout: 5000 });
    const combined = [result.stdout, result.stderr].filter(Boolean).join('\n');
    return parseJavaMajorVersion(combined);
  } catch {
    return undefined;
  }
}
async function getJavaVersionDetails(): Promise<{ major?: number; label?: string }> {
  try {
    const result = await execCommand('java', ['-version'], { timeout: 5000 });
    const combined = [result.stdout, result.stderr].filter(Boolean).join('\n');
    return {
      major: parseJavaMajorVersion(combined),
      label: parseJavaVersionLabel(combined),
    };
  } catch {
    return {};
  }
}
async function activateIfInstalled(extId: string): Promise<void> {
  const ext = vscode.extensions.getExtension(extId);
  if (ext && !ext.isActive) {
    try {
      await ext.activate();
    } catch {
    }
  }
}
export async function checkLanguageExtensions(context?: vscode.ExtensionContext): Promise<void> {
  if (context) {
    contextStore = context.globalState;
  }
  const missing: RequiredExtension[] = [];
  const javaExt = vscode.extensions.getExtension(REQUIRED_EXTENSIONS.java.id);
  if (!javaExt) {
    missing.push(REQUIRED_EXTENSIONS.java);
  }
  const kotlinExt = vscode.extensions.getExtension(REQUIRED_EXTENSIONS.kotlin.id);
  if (!kotlinExt) {
    missing.push(REQUIRED_EXTENSIONS.kotlin);
  } else {
    const javaMajor = await getJavaMajorVersion();
    if (javaMajor && javaMajor >= 25) {
      const now = Date.now();
      const lastShown = contextStore?.get<number>(JAVA25_NOTICE_KEY) || 0;
      if (now - lastShown > NOTICE_COOLDOWN_MS) {
        const action = await vscode.window.showWarningMessage(
          'Android Tools: Kotlin extension may fail on Java 25+. Use JDK 21 for better stability.',
          'Use JDK 21 path'
        );
        if (action === 'Use JDK 21 path') {
          await vscode.commands.executeCommand('android-toolkit.setJdk21Path');
        }
        await contextStore?.update(JAVA25_NOTICE_KEY, now);
      }
    } else {
      await activateIfInstalled(REQUIRED_EXTENSIONS.kotlin.id);
    }
  }
  if (missing.length > 0) {
    const now = Date.now();
    const lastShown = contextStore?.get<number>(MISSING_EXT_NOTICE_KEY) || 0;
    if (now - lastShown > NOTICE_COOLDOWN_MS) {
      vscode.window.setStatusBarMessage(
        `Android Tools: Missing language extensions: ${missing.map(e => e.name).join(', ')}`,
        8000
      );
      await contextStore?.update(MISSING_EXT_NOTICE_KEY, now);
    }
  }
}
export async function ensureLanguageMode(document: vscode.TextDocument): Promise<void> {
  const ext = document.fileName.split('.').pop()?.toLowerCase();
  if (ext === 'java' && document.languageId !== 'java') {
    await vscode.languages.setTextDocumentLanguage(document, 'java');
  } else if ((ext === 'kt' || ext === 'kts') && document.languageId !== 'kotlin') {
    await vscode.languages.setTextDocumentLanguage(document, 'kotlin');
    const javaMajor = await getJavaMajorVersion();
    if (!javaMajor || javaMajor < 25) {
      await activateIfInstalled(REQUIRED_EXTENSIONS.kotlin.id);
    }
  }
}

export async function setJdk21Path(): Promise<boolean> {
  const selected = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Use this JDK',
    title: 'Select JDK 21 Home',
  });
  if (!selected?.[0]) {
    return false;
  }
  const jdkPath = selected[0].fsPath;
  await vscode.workspace.getConfiguration().update('java.jdt.ls.java.home', jdkPath, vscode.ConfigurationTarget.Global);
  await vscode.workspace.getConfiguration().update('kotlin.languageServer.enabled', true, vscode.ConfigurationTarget.Global);
  vscode.window.setStatusBarMessage('Android Tools: JDK path updated. Reload window to apply.', 8000);
  return true;
}

export interface LanguageHealthStatus {
  javaMajor?: number;
  javaVersion?: string;
  hasJavaExtension: boolean;
  hasKotlinExtension: boolean;
  kotlinRiskOnJava25: boolean;
}

export async function getLanguageHealthStatus(): Promise<LanguageHealthStatus> {
  const javaExt = vscode.extensions.getExtension(REQUIRED_EXTENSIONS.java.id);
  const kotlinExt = vscode.extensions.getExtension(REQUIRED_EXTENSIONS.kotlin.id);
  const java = await getJavaVersionDetails();
  return {
    javaMajor: java.major,
    javaVersion: java.label,
    hasJavaExtension: Boolean(javaExt),
    hasKotlinExtension: Boolean(kotlinExt),
    kotlinRiskOnJava25: Boolean(kotlinExt && java.major && java.major >= 25),
  };
}
