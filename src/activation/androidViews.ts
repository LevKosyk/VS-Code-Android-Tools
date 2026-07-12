import * as vscode from 'vscode';
import { AndroidProjectProvider } from '../projectView/projectTreeProvider';
import { EmulatorControlProvider } from '../emulatorControl/emulatorControlProvider';
import { DeviceManagerProvider } from '../deviceManager';
import { DeviceFileExplorerProvider } from '../deviceExplorer/deviceFileExplorerProvider';
import { GradleTasksProvider } from '../gradle/gradleTasksProvider';
import { AndroidProblemsProvider } from '../problems/problemsProvider';

export interface AuxiliaryAndroidViews {
  controlProvider: EmulatorControlProvider;
  deviceManagerProvider: DeviceManagerProvider;
  deviceFileExplorerProvider: DeviceFileExplorerProvider;
  gradleTasksProvider: GradleTasksProvider;
  problemsProvider: AndroidProblemsProvider;
}

export interface RegisteredAndroidViews {
  projectProvider: AndroidProjectProvider;
  ensureAuxiliaryViewsInitialized(): void;
}

/** Registers the lightweight project tree immediately and the ADB-backed views lazily. */
export function registerAndroidViews(
  context: vscode.ExtensionContext,
  onAuxiliaryInitialized: (views: AuxiliaryAndroidViews) => void
): RegisteredAndroidViews {
  const projectProvider = new AndroidProjectProvider();
  context.subscriptions.push(vscode.window.createTreeView('androidProjectView', {
    treeDataProvider: projectProvider,
    showCollapseAll: true,
    dragAndDropController: projectProvider.dragAndDropController,
  }));

  let initialized = false;
  const ensureAuxiliaryViewsInitialized = (): void => {
    if (initialized) {
      return;
    }
    initialized = true;
    const views: AuxiliaryAndroidViews = {
      controlProvider: new EmulatorControlProvider(),
      deviceManagerProvider: new DeviceManagerProvider(),
      deviceFileExplorerProvider: new DeviceFileExplorerProvider(),
      gradleTasksProvider: new GradleTasksProvider(),
      problemsProvider: new AndroidProblemsProvider(),
    };
    context.subscriptions.push(
      vscode.window.registerTreeDataProvider('emulatorControlView', views.controlProvider),
      vscode.window.registerTreeDataProvider('deviceManagerView', views.deviceManagerProvider),
      vscode.window.registerTreeDataProvider('deviceFileExplorerView', views.deviceFileExplorerProvider),
      vscode.window.registerTreeDataProvider('androidToolkitGradleTasksView', views.gradleTasksProvider),
      vscode.window.registerTreeDataProvider('androidProblemsView', views.problemsProvider)
    );
    onAuxiliaryInitialized(views);
  };

  return { projectProvider, ensureAuxiliaryViewsInitialized };
}
