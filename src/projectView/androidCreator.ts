/**
 * Android Resource Creator
 * Creates Android resources, folders, assets, and locales
 */

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

/**
 * Result of a creation operation
 */
interface CreationResult {
  success: boolean;
  path?: string;
  error?: string;
}

/**
 * Get the res directory path from workspace
 */
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

/**
 * Get the assets directory path from workspace
 */
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

  // Return first possible path for creation
  return possiblePaths[0];
}

/**
 * Get target directory from tree item selection
 */
function getTargetFromItem(
  item: ProjectTreeItem | undefined,
  workspaceRoot: string
): { categoryId?: CategoryId; folderPath?: string } {
  if (!item) {
    return {};
  }

  // Category node
  if (item.data.type === 'category' && item.data.categoryId) {
    return { categoryId: item.data.categoryId };
  }

  // Folder node
  if (item.data.type === 'folder' && item.data.resourceUri) {
    return { folderPath: item.data.resourceUri.fsPath };
  }

  return {};
}

/**
 * Ensure directory exists
 */
async function ensureDir(dirPath: string): Promise<void> {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

/**
 * Write file with content
 */
async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.promises.writeFile(filePath, content, 'utf-8');
}

/**
 * Create Android Resource Flow
 * Opens dialogs to create a new resource file
 */
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

  // Step 1: Pick resource type
  const resourceType = await pickResourceType();
  if (!resourceType) {
    return; // User cancelled
  }

  // Step 2: Determine target folder
  let targetFolder = path.join(resPath, resourceType);
  const target = getTargetFromItem(item, workspaceFolder.uri.fsPath);

  // If user selected a specific res subfolder, use that
  if (target.folderPath && target.folderPath.includes(`${path.sep}res${path.sep}`)) {
    const folderName = path.basename(target.folderPath);
    // Check if folder matches the resource type
    if (folderName.startsWith(resourceType)) {
      targetFolder = target.folderPath;
    }
  }

  // Step 3: Get file name
  const defaultName = getDefaultFileName(resourceType);
  const fileName = await inputResourceName({
    title: `Create ${resourceType} Resource`,
    prompt: `Enter the ${resourceType} file name`,
    placeholder: defaultName,
  });

  if (!fileName) {
    return; // User cancelled
  }

  // Add appropriate extension
  const fileNameWithExt = ensureExtension(fileName, resourceType);
  const filePath = path.join(targetFolder, fileNameWithExt);

  // Step 4: Check for duplicates
  const duplicate = await checkDuplicate(targetFolder, fileNameWithExt);
  if (duplicate.exists) {
    const overwrite = await confirmOverwrite(filePath);
    if (!overwrite) {
      return;
    }
  }

  // Step 5: Create file
  try {
    await ensureDir(targetFolder);
    const template = getResourceTemplate(resourceType, fileNameWithExt);
    await writeFile(filePath, template);

    // Refresh tree and open file
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

/**
 * Create Folder Flow
 * Opens dialog to create a new resource folder
 */
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

  // Get folder name from user
  const folderName = await inputFolderName({
    title: 'Create Resource Folder',
    prompt: 'Enter folder name (e.g., drawable-night, values-es, layout-land)',
  });

  if (!folderName) {
    return; // User cancelled
  }

  const folderPath = path.join(resPath, folderName);

  // Check if folder already exists
  if (fs.existsSync(folderPath)) {
    vscode.window.showWarningMessage(`Folder already exists: ${folderName}`);
    return;
  }

  // Create folder
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

/**
 * Create Asset Flow
 * Opens dialog to create a new asset file
 */
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
  
  // Create assets directory if it doesn't exist
  if (!assetsPath || !fs.existsSync(assetsPath)) {
    assetsPath = path.join(workspaceFolder.uri.fsPath, 'app', 'src', 'main', 'assets');
  }

  // Get asset file name from user
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
    return; // User cancelled
  }

  const filePath = path.join(assetsPath, fileName);

  // Check if file already exists
  if (fs.existsSync(filePath)) {
    const overwrite = await confirmOverwrite(filePath);
    if (!overwrite) {
      return;
    }
  }

  // Create asset file
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

/**
 * Create Locale Flow
 * Opens dialog to create a new locale/language folder with strings.xml
 */
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

  // Step 1: Pick locale
  const locale = await pickLocale();
  if (!locale) {
    return; // User cancelled
  }

  // Step 2: Pick which values file to create
  const valuesFile = await pickValuesFile();
  if (!valuesFile) {
    return; // User cancelled
  }

  // Create the values-{locale} folder
  const folderName = `values-${locale}`;
  const folderPath = path.join(resPath, folderName);
  const filePath = path.join(folderPath, valuesFile.fileName);

  // Check if file already exists
  if (fs.existsSync(filePath)) {
    const overwrite = await confirmOverwrite(filePath);
    if (!overwrite) {
      return;
    }
  }

  // Create folder and file
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

/**
 * Get default file name for resource type
 */
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

/**
 * Ensure file has appropriate extension
 */
function ensureExtension(fileName: string, type: ResourceFolderType): string {
  // Already has extension
  if (fileName.includes('.')) {
    return fileName;
  }

  // Add .xml for most resource types
  const xmlTypes: ResourceFolderType[] = [
    'layout', 'values', 'menu', 'anim', 'animator', 
    'color', 'xml', 'navigation', 'drawable'
  ];
  
  if (xmlTypes.includes(type)) {
    return `${fileName}.xml`;
  }

  return fileName;
}
