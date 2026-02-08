import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { CategoryConfig, CATEGORY_CONFIGS, CategoryId } from './types';
export interface DiscoveredFile {
  uri: vscode.Uri;
  relativePath: string;
  name: string;
  isDirectory: boolean;
}
export interface CategoryScanResult {
  categoryId: CategoryId;
  files: DiscoveredFile[];
  rootPath?: string;  
}
function pathExists(p: string): boolean {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}
async function scanDirectory(
  basePath: string,
  patterns: string[],
  maxDepth: number = 5
): Promise<DiscoveredFile[]> {
  const results: DiscoveredFile[] = [];
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return results;
  }
  const relativBase = path.relative(workspaceFolder.uri.fsPath, basePath);
  for (const pattern of patterns) {
    const fullPattern = relativBase 
      ? new vscode.RelativePattern(workspaceFolder, `${relativBase}/${pattern}`)
      : new vscode.RelativePattern(workspaceFolder, pattern);
    try {
      const uris = await vscode.workspace.findFiles(fullPattern, '**/build/**', 100);
      for (const uri of uris) {
        const relativePath = path.relative(basePath, uri.fsPath);
        const stats = fs.statSync(uri.fsPath);
        results.push({
          uri,
          relativePath,
          name: path.basename(uri.fsPath),
          isDirectory: stats.isDirectory(),
        });
      }
    } catch {
    }
  }
  return results;
}
function findCategoryRoot(
  workspaceRoot: string,
  rootPaths: string[]
): string | undefined {
  for (const rootPath of rootPaths) {
    const fullPath = path.join(workspaceRoot, rootPath);
    if (pathExists(fullPath)) {
      return fullPath;
    }
  }
  return undefined;
}
export async function scanCategory(
  workspaceRoot: string,
  config: CategoryConfig
): Promise<CategoryScanResult> {
  const result: CategoryScanResult = {
    categoryId: config.id,
    files: [],
  };
  const rootPath = findCategoryRoot(workspaceRoot, config.rootPaths);
  if (!rootPath) {
    return result;
  }
  result.rootPath = rootPath;
  if (config.id === 'gradle') {
    for (const rootDir of config.rootPaths) {
      const fullPath = path.join(workspaceRoot, rootDir);
      if (!pathExists(fullPath)) {
        continue;
      }
      for (const pattern of config.patterns) {
        const files = await scanDirectory(fullPath, [pattern], 1);
        result.files.push(...files);
      }
    }
  } else if (config.id === 'manifests') {
    const files = await scanDirectory(rootPath, config.patterns, 3);
    result.files.push(...files);
  } else {
    const files = await scanDirectory(rootPath, config.patterns, 10);
    result.files.push(...files);
  }
  result.files.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  return result;
}
export async function scanAllCategories(
  workspaceRoot: string
): Promise<Map<CategoryId, CategoryScanResult>> {
  const results = new Map<CategoryId, CategoryScanResult>();
  for (const config of CATEGORY_CONFIGS) {
    const result = await scanCategory(workspaceRoot, config);
    results.set(config.id, result);
  }
  return results;
}
export function isAndroidProject(workspaceRoot: string): boolean {
  const indicators = [
    'app/build.gradle',
    'app/build.gradle.kts',
    'settings.gradle',
    'settings.gradle.kts',
    'app/src/main/AndroidManifest.xml',
    'src/main/AndroidManifest.xml',
  ];
  return indicators.some(indicator => 
    pathExists(path.join(workspaceRoot, indicator))
  );
}
export function getProjectName(workspaceRoot: string): string {
  const settingsFiles = ['settings.gradle', 'settings.gradle.kts'];
  for (const file of settingsFiles) {
    const settingsPath = path.join(workspaceRoot, file);
    if (pathExists(settingsPath)) {
      try {
        const content = fs.readFileSync(settingsPath, 'utf-8');
        const match = content.match(/rootProject\.name\s*=\s*["']([^"']+)["']/);
        if (match) {
          return match[1];
        }
      } catch {
      }
    }
  }
  return path.basename(workspaceRoot);
}
