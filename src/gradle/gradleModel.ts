import { findApplicationId, findApplicationModules } from '../core/androidProject';
import { GradleTaskInfo, listGradleTasks, parseVariants } from './gradleService';

export interface AndroidGradleModuleModel {
  name: string;
  applicationId?: string;
  buildTypes: string[];
  flavors: string[];
  variants: string[];
}

export interface AndroidGradleModel {
  workspaceRoot: string;
  modules: AndroidGradleModuleModel[];
  source: 'gradle-tasks-model';
}

export function buildAndroidGradleModel(
  workspaceRoot: string,
  tasks: GradleTaskInfo[]
): AndroidGradleModel {
  return {
    workspaceRoot,
    source: 'gradle-tasks-model',
    modules: findApplicationModules(workspaceRoot).map(name => {
      const variants = parseVariants(tasks, name);
      return {
        name,
        applicationId: findApplicationId(workspaceRoot, name),
        ...variants,
      };
    }),
  };
}

export async function loadAndroidGradleModel(workspaceRoot: string): Promise<AndroidGradleModel> {
  return buildAndroidGradleModel(workspaceRoot, await listGradleTasks(workspaceRoot));
}
