import * as vscode from 'vscode';
import { execCommand } from './cli';
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
function parseJavaMajorVersion(output: string): number | undefined {
  const versionMatch = output.match(/version\s+"([^"]+)"/i);
  const raw = versionMatch ? versionMatch[1] : output.trim();
  const parts = raw.split(/[._-]/).filter(Boolean);
  if (parts.length === 0) {
    return undefined;
  }
  const first = parseInt(parts[0], 10);
  if (Number.isNaN(first)) {
    return undefined;
  }
  if (first === 1 && parts.length > 1) {
    const legacy = parseInt(parts[1], 10);
    return Number.isNaN(legacy) ? undefined : legacy;
  }
  return first;
}
async function getJavaMajorVersion(): Promise<number | undefined> {
  try {
    const result = await execCommand('java', ['-version'], { timeout: 5000 });
    const combined = [result.stdout, result.stderr].filter(Boolean).join('\n');
    return parseJavaMajorVersion(combined);
  } catch {
    return undefined;
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
        vscode.window.setStatusBarMessage(
          'Android Tools: Kotlin extension may fail on Java 25. Use JDK 21 if needed.',
          8000
        );
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
