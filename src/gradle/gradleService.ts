import * as path from 'path';
import * as fs from 'fs';
import { execCommand } from '../core/cli';
import { measureAsync } from '../core/perf';

export interface GradleTaskInfo {
  name: string;
  fullName: string;
  group: string;
  description: string;
  module?: string;
}

type GradleTaskCacheEntry = {
  at: number;
  tasks: GradleTaskInfo[];
  refreshing?: boolean;
};
const GRADLE_TASK_CACHE_TTL_MS = 10_000;
const GRADLE_TASK_STALE_TTL_MS = 60_000;
const gradleTaskCache = new Map<string, GradleTaskCacheEntry>();
const gradleTasksInFlight = new Map<string, Promise<GradleTaskInfo[]>>();
const gradleResultCache = new Map<string, { at: number; result: Awaited<ReturnType<typeof runGradleTaskWithResult>> }>();

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

export async function runGradleTaskWithResultCached(
  workspaceRoot: string,
  task: string,
  extraArgs: string[] = [],
  ttlMs = 8_000
) {
  const cacheKey = `${path.resolve(workspaceRoot)}::${task}::${extraArgs.join(' ')}`;
  const cached = gradleResultCache.get(cacheKey);
  if (cached && Date.now() - cached.at <= ttlMs) {
    return cached.result;
  }
  const result = await runGradleTaskWithResult(workspaceRoot, task, extraArgs);
  gradleResultCache.set(cacheKey, { at: Date.now(), result });
  return result;
}

export async function listGradleTasks(workspaceRoot: string): Promise<GradleTaskInfo[]> {
  const cacheKey = path.resolve(workspaceRoot);
  const cached = gradleTaskCache.get(cacheKey);
  if (cached && Date.now() - cached.at < GRADLE_TASK_CACHE_TTL_MS) {
    return cached.tasks;
  }
  if (cached && Date.now() - cached.at < GRADLE_TASK_STALE_TTL_MS) {
    if (!cached.refreshing) {
      cached.refreshing = true;
      void (async () => {
        try {
          const refreshed = await fetchGradleTasks(workspaceRoot);
          if (refreshed.length > 0) {
            gradleTaskCache.set(cacheKey, { at: Date.now(), tasks: refreshed, refreshing: false });
          } else {
            cached.refreshing = false;
          }
        } catch {
          cached.refreshing = false;
        }
      })();
    }
    return cached.tasks;
  }
  const inFlight = gradleTasksInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }
  const taskPromise = (async () => {
    const tasks = await fetchGradleTasks(workspaceRoot);
    gradleTaskCache.set(cacheKey, { at: Date.now(), tasks, refreshing: false });
    return tasks;
  })();
  gradleTasksInFlight.set(cacheKey, taskPromise);
  try {
    return await taskPromise;
  } finally {
    gradleTasksInFlight.delete(cacheKey);
  }
}

async function fetchGradleTasks(workspaceRoot: string): Promise<GradleTaskInfo[]> {
  const gradleCmd = getGradleCommand(workspaceRoot);
  const result = await measureAsync('gradle:listTasks:exec', () =>
    execCommand(gradleCmd, ['tasks', '--all'], {
      cwd: workspaceRoot,
      timeout: 300_000,
    })
  );
  if (result.exitCode !== 0) {
    return [];
  }
  const tasks = await measureAsync('gradle:listTasks:parse', async () => {
    const parsed: GradleTaskInfo[] = [];
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
      parsed.push({
        name: fullName.split(':').pop() || fullName,
        fullName,
        group: currentGroup,
        description,
        module: moduleMatch || undefined,
      });
    }
    return parsed;
  });
  return tasks;
}

export function invalidateGradleTaskCache(workspaceRoot?: string): void {
  if (!workspaceRoot) {
    gradleTaskCache.clear();
    gradleTasksInFlight.clear();
    gradleResultCache.clear();
    return;
  }
  const resolved = path.resolve(workspaceRoot);
  gradleTaskCache.delete(resolved);
  gradleTasksInFlight.delete(resolved);
  for (const key of gradleResultCache.keys()) {
    if (key.startsWith(`${resolved}::`)) {
      gradleResultCache.delete(key);
    }
  }
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
