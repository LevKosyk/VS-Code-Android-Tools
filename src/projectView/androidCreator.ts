import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ProjectTreeItem } from './projectTreeItem';
import { AndroidProjectProvider } from './projectTreeProvider';
import { CategoryId } from './types';
import {
  validateResourceName,
  validateFolderName,
  checkDuplicate,
  ResourceFolderType,
  RESOURCE_FOLDER_TYPES,
} from './androidValidation';
import {
  pickResourceType,
  inputResourceName,
  inputFolderName,
  pickLocale,
  pickValuesFile,
  getResourceTemplate,
  confirmOverwrite,
} from './androidQuickPicks';
interface CreationResult {
  success: boolean;
  path?: string;
  error?: string;
}
function getResPath(workspaceRoot: string): string | undefined {
  const possiblePaths = [
    path.join(workspaceRoot, 'app', 'src', 'main', 'res'),
    path.join(workspaceRoot, 'src', 'main', 'res'),
  ];
  for (const resPath of possiblePaths) {
    if (fs.existsSync(resPath)) {
      return resPath;
    }
  }
  return undefined;
}
function getAssetsPath(workspaceRoot: string): string | undefined {
  const possiblePaths = [
    path.join(workspaceRoot, 'app', 'src', 'main', 'assets'),
    path.join(workspaceRoot, 'src', 'main', 'assets'),
  ];
  for (const assetsPath of possiblePaths) {
    if (fs.existsSync(assetsPath)) {
      return assetsPath;
    }
  }
  return possiblePaths[0];
}
function getTargetFromItem(
  item: ProjectTreeItem | undefined,
  workspaceRoot: string
): { categoryId?: CategoryId; folderPath?: string } {
  if (!item) {
    return {};
  }
  if (item.data.type === 'category' && item.data.categoryId) {
    return { categoryId: item.data.categoryId };
  }
  if (item.data.type === 'folder' && item.data.resourceUri) {
    return { folderPath: item.data.resourceUri.fsPath };
  }
  return {};
}
async function ensureDir(dirPath: string): Promise<void> {
  await fs.promises.mkdir(dirPath, { recursive: true });
}
async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.promises.writeFile(filePath, content, 'utf-8');
}
export async function createResourceFlow(
  item: ProjectTreeItem | undefined,
  provider: AndroidProjectProvider
): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open.');
    return;
  }
  const resPath = getResPath(workspaceFolder.uri.fsPath);
  if (!resPath) {
    vscode.window.showErrorMessage(
      'Could not find Android res directory. Make sure this is an Android project.'
    );
    return;
  }
  const resourceType = await pickResourceType();
  if (!resourceType) {
    return; 
  }
  let targetFolder = path.join(resPath, resourceType);
  const target = getTargetFromItem(item, workspaceFolder.uri.fsPath);
  if (target.folderPath && target.folderPath.includes(`${path.sep}res${path.sep}`)) {
    const folderName = path.basename(target.folderPath);
    if (folderName.startsWith(resourceType)) {
      targetFolder = target.folderPath;
    }
  }
  const defaultName = getDefaultFileName(resourceType);
  const fileName = await inputResourceName({
    title: `Create ${resourceType} Resource`,
    prompt: `Enter the ${resourceType} file name`,
    placeholder: defaultName,
  });
  if (!fileName) {
    return; 
  }
  const fileNameWithExt = ensureExtension(fileName, resourceType);
  const filePath = path.join(targetFolder, fileNameWithExt);
  const duplicate = await checkDuplicate(targetFolder, fileNameWithExt);
  if (duplicate.exists) {
    const overwrite = await confirmOverwrite(filePath);
    if (!overwrite) {
      return;
    }
  }
  try {
    await ensureDir(targetFolder);
    const template = getResourceTemplate(resourceType, fileNameWithExt);
    await writeFile(filePath, template);
    provider.refresh();
    const document = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(document);
    vscode.window.showInformationMessage(`Created ${fileNameWithExt}`);
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to create resource: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
export async function createFolderFlow(
  item: ProjectTreeItem | undefined,
  provider: AndroidProjectProvider
): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open.');
    return;
  }
  const resPath = getResPath(workspaceFolder.uri.fsPath);
  if (!resPath) {
    vscode.window.showErrorMessage(
      'Could not find Android res directory. Make sure this is an Android project.'
    );
    return;
  }
  const folderName = await inputFolderName({
    title: 'Create Resource Folder',
    prompt: 'Enter folder name (e.g., drawable-night, values-es, layout-land)',
  });
  if (!folderName) {
    return; 
  }
  const folderPath = path.join(resPath, folderName);
  if (fs.existsSync(folderPath)) {
    vscode.window.showWarningMessage(`Folder already exists: ${folderName}`);
    return;
  }
  try {
    await ensureDir(folderPath);
    provider.refresh();
    vscode.window.showInformationMessage(`Created folder: ${folderName}`);
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to create folder: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
export async function createAssetFlow(
  item: ProjectTreeItem | undefined,
  provider: AndroidProjectProvider
): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open.');
    return;
  }
  let assetsPath = getAssetsPath(workspaceFolder.uri.fsPath);
  if (!assetsPath || !fs.existsSync(assetsPath)) {
    assetsPath = path.join(workspaceFolder.uri.fsPath, 'app', 'src', 'main', 'assets');
  }
  const fileName = await vscode.window.showInputBox({
    title: 'Create Asset',
    prompt: 'Enter asset file name with extension',
    placeHolder: 'e.g., data.json, config.txt, font.ttf',
    validateInput: (value) => {
      if (!value || value.trim().length === 0) {
        return 'File name cannot be empty';
      }
      if (!/^[a-zA-Z0-9_.-]+$/.test(value)) {
        return 'File name can only contain letters, numbers, underscores, dots, and hyphens';
      }
      return undefined;
    },
  });
  if (!fileName) {
    return; 
  }
  const filePath = path.join(assetsPath, fileName);
  if (fs.existsSync(filePath)) {
    const overwrite = await confirmOverwrite(filePath);
    if (!overwrite) {
      return;
    }
  }
  try {
    await ensureDir(assetsPath);
    await writeFile(filePath, '');
    provider.refresh();
    const document = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(document);
    vscode.window.showInformationMessage(`Created asset: ${fileName}`);
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to create asset: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
export async function createLocaleFlow(
  item: ProjectTreeItem | undefined,
  provider: AndroidProjectProvider
): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open.');
    return;
  }
  const resPath = getResPath(workspaceFolder.uri.fsPath);
  if (!resPath) {
    vscode.window.showErrorMessage(
      'Could not find Android res directory. Make sure this is an Android project.'
    );
    return;
  }
  const locale = await pickLocale();
  if (!locale) {
    return; 
  }
  const valuesFile = await pickValuesFile();
  if (!valuesFile) {
    return; 
  }
  const folderName = `values-${locale}`;
  const folderPath = path.join(resPath, folderName);
  const filePath = path.join(folderPath, valuesFile.fileName);
  if (fs.existsSync(filePath)) {
    const overwrite = await confirmOverwrite(filePath);
    if (!overwrite) {
      return;
    }
  }
  try {
    await ensureDir(folderPath);
    await writeFile(filePath, valuesFile.template);
    provider.refresh();
    const document = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(document);
    vscode.window.showInformationMessage(`Created ${folderName}/${valuesFile.fileName}`);
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to create locale: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
function getDefaultFileName(type: ResourceFolderType): string {
  switch (type) {
    case 'layout':
      return 'activity_main';
    case 'drawable':
      return 'ic_icon';
    case 'values':
      return 'values';
    case 'mipmap':
      return 'ic_launcher';
    case 'menu':
      return 'menu_main';
    case 'anim':
      return 'fade_in';
    case 'animator':
      return 'slide_in';
    case 'color':
      return 'button_color';
    case 'navigation':
      return 'nav_graph';
    default:
      return 'resource';
  }
}
function ensureExtension(fileName: string, type: ResourceFolderType): string {
  if (fileName.includes('.')) {
    return fileName;
  }
  const xmlTypes: ResourceFolderType[] = [
    'layout', 'values', 'menu', 'anim', 'animator', 
    'color', 'xml', 'navigation', 'drawable'
  ];
  if (xmlTypes.includes(type)) {
    return `${fileName}.xml`;
  }
  return fileName;
}
export async function createClassFlow(
  item: ProjectTreeItem | undefined,
  provider: AndroidProjectProvider
): Promise<void> {
  let targetUri: vscode.Uri | undefined;
  let packageName = '';
  if (item && item.data.type === 'package' && item.data.resourceUri) {
    targetUri = item.data.resourceUri;
  } else if (item && item.data.type === 'folder' && item.data.resourceUri) {
     targetUri = item.data.resourceUri;
  } else {
     const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
     if (workspaceRoot) {
       const javaRoot = vscode.Uri.joinPath(workspaceRoot, 'app/src/main/java');
       try {
         await vscode.workspace.fs.stat(javaRoot);
         targetUri = javaRoot;
       } catch {
         targetUri = workspaceRoot;
       }
     }
  }
  if (!targetUri) {
    vscode.window.showErrorMessage('Select a package or folder to create the class in.');
    return;
  }
  const nameInput = await vscode.window.showInputBox({
    prompt: 'Enter class name (e.g. MainActivity)',
    placeHolder: 'MyClass',
    validateInput: (value) => {
      if (!value || !/^[A-Z][a-zA-Z0-9]*$/.test(value)) {
        return 'Class name must start with uppercase letter and contain only alphanumeric characters';
      }
      return null;
    }
  });
  if (!nameInput) return;
  const type = await vscode.window.showQuickPick(['Kotlin (.kt)', 'Java (.java)'], {
    placeHolder: 'Select language'
  });
  if (!type) return;
  const isKotlin = type.startsWith('Kotlin');
  const extension = isKotlin ? '.kt' : '.java';
  const fileName = nameInput + extension;
  const fileUri = vscode.Uri.joinPath(targetUri, fileName);
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(targetUri);
  if (workspaceFolder) {
    const relativePath = path.relative(workspaceFolder.uri.fsPath, targetUri.fsPath);
    const parts = relativePath.split(path.sep);
    const javaIndex = parts.indexOf('java');
    const kotlinIndex = parts.indexOf('kotlin');
    let packagePathParts: string[] = [];
    if (javaIndex !== -1) {
      packagePathParts = parts.slice(javaIndex + 1);
    } else if (kotlinIndex !== -1) {
      packagePathParts = parts.slice(kotlinIndex + 1);
    } else {
       packagePathParts = parts;
    }
    packageName = packagePathParts.join('.');
  }
  const content = `package ${packageName}
${isKotlin ? 'class' : 'public class'} ${nameInput} {
}
`;
  try {
    const fs = require('fs');
    if (fs.existsSync(fileUri.fsPath)) {
      vscode.window.showErrorMessage(`File ${fileName} already exists!`);
      return;
    }
    fs.writeFileSync(fileUri.fsPath, content);
    const doc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(doc);
    provider.refresh();
    vscode.window.showInformationMessage(`Created ${fileName}`);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to create class: ${error}`);
  }
}
