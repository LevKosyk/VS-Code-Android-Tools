import * as fs from 'fs';
import * as path from 'path';

function readIfExists(filePath: string): string | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return undefined;
  }
}

export function getWorkspaceRoot(): string | undefined {
  return require('vscode').workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export function listGradleModules(workspaceRoot: string): string[] {
  const settingsFiles = [
    path.join(workspaceRoot, 'settings.gradle'),
    path.join(workspaceRoot, 'settings.gradle.kts'),
  ];
  const modules = new Set<string>();
  for (const file of settingsFiles) {
    const content = readIfExists(file);
    if (!content) {
      continue;
    }
    const includeRegex = /include\(([^)]+)\)/g;
    let match: RegExpExecArray | null;
    while ((match = includeRegex.exec(content)) !== null) {
      const raw = match[1];
      const parts = raw.split(',').map(p => p.trim().replace(/['"]/g, ''));
      for (const part of parts) {
        const name = part.replace(/^:/, '').trim();
        if (name) {
          modules.add(name);
        }
      }
    }
  }
  if (modules.size === 0) {
    const appGradle = path.join(workspaceRoot, 'app', 'build.gradle');
    const appGradleKts = path.join(workspaceRoot, 'app', 'build.gradle.kts');
    if (fs.existsSync(appGradle) || fs.existsSync(appGradleKts)) {
      modules.add('app');
    }
  }
  return Array.from(modules.values());
}

export function findApplicationModules(workspaceRoot: string): string[] {
  const modules = listGradleModules(workspaceRoot);
  const appModules: string[] = [];
  for (const moduleName of modules) {
    const gradle = path.join(workspaceRoot, moduleName, 'build.gradle');
    const gradleKts = path.join(workspaceRoot, moduleName, 'build.gradle.kts');
    const content = readIfExists(gradle) || readIfExists(gradleKts);
    if (!content) {
      continue;
    }
    const hasAppPlugin =
      content.includes('com.android.application') ||
      content.includes('id("com.android.application")') ||
      content.includes("id('com.android.application')");
    if (hasAppPlugin) {
      appModules.push(moduleName);
    }
  }
  return appModules.length > 0 ? appModules : modules;
}

export function findApplicationId(workspaceRoot: string, moduleName: string): string | undefined {
  const candidates = [
    path.join(workspaceRoot, moduleName, 'build.gradle'),
    path.join(workspaceRoot, moduleName, 'build.gradle.kts'),
  ];
  for (const file of candidates) {
    const content = readIfExists(file);
    if (!content) {
      continue;
    }
    const gradleMatch = content.match(/applicationId\s+["']([^"']+)["']/);
    if (gradleMatch) {
      return gradleMatch[1];
    }
    const ktsMatch = content.match(/applicationId\s*=\s*["']([^"']+)["']/);
    if (ktsMatch) {
      return ktsMatch[1];
    }
  }
  return undefined;
}

export function findBuildToolsVersion(workspaceRoot: string, moduleName: string): string | undefined {
  const candidates = [
    path.join(workspaceRoot, moduleName, 'build.gradle'),
    path.join(workspaceRoot, moduleName, 'build.gradle.kts'),
  ];
  for (const file of candidates) {
    const content = readIfExists(file);
    if (!content) {
      continue;
    }
    const groovyMatch = content.match(/buildToolsVersion\s+["']([^"']+)["']/);
    if (groovyMatch) {
      return groovyMatch[1];
    }
    const ktsMatch = content.match(/buildToolsVersion\s*=\s*["']([^"']+)["']/);
    if (ktsMatch) {
      return ktsMatch[1];
    }
  }
  return undefined;
}

export function findLatestDebugApk(workspaceRoot: string, moduleName: string, variant?: string): string | undefined {
  const apkRoot = path.join(workspaceRoot, moduleName, 'build', 'outputs', 'apk');
  if (!fs.existsSync(apkRoot)) {
    return undefined;
  }
  const stack: string[] = [apkRoot];
  const apks: string[] = [];
  const matchingApks: string[] = [];
  const variantLower = variant?.toLowerCase();
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        stack.push(full);
      } else if (entry.endsWith('.apk')) {
        apks.push(full);
        if (variantLower) {
          const lower = full.toLowerCase();
          if (lower.includes(`${path.sep}${variantLower}${path.sep}`) || path.basename(lower).includes(variantLower)) {
            matchingApks.push(full);
          }
        }
      }
    }
  }
  const candidates = matchingApks.length > 0 ? matchingApks : apks;
  if (candidates.length === 0) {
    return undefined;
  }
  candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return candidates[0];
}
