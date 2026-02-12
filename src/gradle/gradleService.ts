import * as path from 'path';
import * as fs from 'fs';
import { execCommand } from '../core/cli';

export interface GradleTaskInfo {
  name: string;
  fullName: string;
  group: string;
  description: string;
  module?: string;
}

export function getGradleCommand(workspaceRoot: string): string {
  const wrapper = process.platform === 'win32' ? 'gradlew.bat' : 'gradlew';
  const wrapperPath = path.join(workspaceRoot, wrapper);
  if (fs.existsSync(wrapperPath)) {
    return wrapperPath;
  }
  return 'gradle';
}

export async function runGradleTask(
  workspaceRoot: string,
  task: string,
  extraArgs: string[] = [],
  env?: NodeJS.ProcessEnv
): Promise<boolean> {
  const gradleCmd = getGradleCommand(workspaceRoot);
  const result = await execCommand(gradleCmd, [task, ...extraArgs], {
    cwd: workspaceRoot,
    timeout: 300_000,
    env,
  });
  return result.exitCode === 0;
}

export async function runGradleTaskWithResult(
  workspaceRoot: string,
  task: string,
  extraArgs: string[] = [],
  env?: NodeJS.ProcessEnv
) {
  const gradleCmd = getGradleCommand(workspaceRoot);
  return execCommand(gradleCmd, [task, ...extraArgs], {
    cwd: workspaceRoot,
    timeout: 300_000,
    env,
  });
}

export async function listGradleTasks(workspaceRoot: string): Promise<GradleTaskInfo[]> {
  const gradleCmd = getGradleCommand(workspaceRoot);
  const result = await execCommand(gradleCmd, ['tasks', '--all'], {
    cwd: workspaceRoot,
    timeout: 300_000,
  });
  if (result.exitCode !== 0) {
    return [];
  }
  const tasks: GradleTaskInfo[] = [];
  const lines = result.stdout.split('\n');
  let currentGroup = 'Other';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    if (!line.trim()) {
      continue;
    }
    if (lines[i + 1] && lines[i + 1].startsWith('-----')) {
      currentGroup = line.trim();
      continue;
    }
    const match = line.match(/^([:\\w.-]+)\\s+-\\s+(.+)$/);
    if (!match) {
      continue;
    }
    const fullName = match[1];
    const description = match[2];
    const moduleMatch = fullName.startsWith(':') ? fullName.split(':')[1] : undefined;
    tasks.push({
      name: fullName.split(':').pop() || fullName,
      fullName,
      group: currentGroup,
      description,
      module: moduleMatch || undefined,
    });
  }
  return tasks;
}

export function listVariantsFromTasks(tasks: GradleTaskInfo[], moduleName: string): string[] {
  const variants = new Set<string>();
  const modulePrefix = `:${moduleName}:`;
  for (const task of tasks) {
    const full = task.fullName;
    if (!full.startsWith(modulePrefix)) {
      continue;
    }
    const name = full.substring(modulePrefix.length);
    if (name.startsWith('assemble') && name.length > 'assemble'.length) {
      variants.add(name.substring('assemble'.length));
    }
    if (name === 'assembleDebug') {
      variants.add('Debug');
    }
    if (name === 'assembleRelease') {
      variants.add('Release');
    }
  }
  if (variants.size === 0) {
    variants.add('Debug');
  }
  return Array.from(variants.values()).sort((a, b) => a.localeCompare(b));
}

export function parseVariants(tasks: GradleTaskInfo[], moduleName: string): { buildTypes: string[]; flavors: string[]; variants: string[] } {
  const variants = listVariantsFromTasks(tasks, moduleName);
  const buildTypes = new Set<string>();
  const flavors = new Set<string>();
  for (const variant of variants) {
    const lower = variant.toLowerCase();
    if (lower.endsWith('debug')) {
      buildTypes.add('Debug');
      const flavor = variant.slice(0, -'Debug'.length);
      if (flavor) flavors.add(flavor);
      continue;
    }
    if (lower.endsWith('release')) {
      buildTypes.add('Release');
      const flavor = variant.slice(0, -'Release'.length);
      if (flavor) flavors.add(flavor);
      continue;
    }
  }
  if (buildTypes.size === 0) {
    buildTypes.add('Debug');
    buildTypes.add('Release');
  }
  return {
    buildTypes: Array.from(buildTypes.values()),
    flavors: Array.from(flavors.values()),
    variants,
  };
}
