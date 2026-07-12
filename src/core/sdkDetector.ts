import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SdkNotFoundError } from './errors';
export interface SdkPaths {
  root: string;
  adb: string;
  emulator: string;
  avdmanager: string;
}
let cachedSdkPaths: SdkPaths | null = null;
function getDefaultSdkPaths(): string[] {
  const home = os.homedir();
  const platform = os.platform();
  switch (platform) {
    case 'darwin': 
      return [
        path.join(home, 'Library', 'Android', 'sdk'),
      ];
    case 'linux':
      return [
        path.join(home, 'Android', 'Sdk'),
        path.join(home, 'android-sdk'),
      ];
    case 'win32': 
      return [
        path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk'),
        path.join(home, 'AppData', 'Local', 'Android', 'Sdk'),
      ];
    default:
      return [];
  }
}
function getExecutableExtension(): string {
  return os.platform() === 'win32' ? '.exe' : '';
}
function getScriptExtension(): string {
  return os.platform() === 'win32' ? '.bat' : '';
}
function isValidDirectory(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}
function isExecutable(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    try {
      return fs.statSync(filePath).isFile();
    } catch {
      return false;
    }
  }
}
function findExecutable(sdkRoot: string, subPath: string, name: string): string | null {
  const ext = getExecutableExtension();
  const candidates = [
    path.join(sdkRoot, subPath, name + ext),
    path.join(sdkRoot, subPath, name),
  ];
  for (const candidate of candidates) {
    if (isExecutable(candidate)) {
      return candidate;
    }
  }
  return null;
}
function findAvdManager(sdkRoot: string): string | null {
  const ext = getScriptExtension();
  const cmdlineToolsPath = path.join(sdkRoot, 'cmdline-tools');
  if (isValidDirectory(cmdlineToolsPath)) {
    try {
      const versions = fs.readdirSync(cmdlineToolsPath);
      const sorted = versions.sort((a, b) => {
        if (a === 'latest') {return -1;}
        if (b === 'latest') {return 1;}
        return b.localeCompare(a, undefined, { numeric: true });
      });
      for (const version of sorted) {
        const avdmanagerPath = path.join(cmdlineToolsPath, version, 'bin', 'avdmanager' + ext);
        if (isExecutable(avdmanagerPath)) {
          return avdmanagerPath;
        }
      }
    } catch {
    }
  }
  const legacyPath = path.join(sdkRoot, 'tools', 'bin', 'avdmanager' + ext);
  if (isExecutable(legacyPath)) {
    return legacyPath;
  }
  return null;
}
function validateSdk(sdkRoot: string): SdkPaths | null {
  if (!isValidDirectory(sdkRoot)) {
    return null;
  }
  const adb = findExecutable(sdkRoot, 'platform-tools', 'adb');
  if (!adb) {
    return null;
  }
  const emulator = findExecutable(sdkRoot, 'emulator', 'emulator');
  const avdmanager = findAvdManager(sdkRoot);
  return {
    root: sdkRoot,
    adb,
    emulator: emulator || '',
    avdmanager: avdmanager || '',
  };
}
export function detectSdk(): SdkPaths {
  if (cachedSdkPaths) {
    return cachedSdkPaths;
  }
  const searchedPaths: string[] = [];
  const sdkRoot = process.env.ANDROID_SDK_ROOT;
  if (sdkRoot) {
    searchedPaths.push(sdkRoot);
    const paths = validateSdk(sdkRoot);
    if (paths) {
      cachedSdkPaths = paths;
      return paths;
    }
  }
  const androidHome = process.env.ANDROID_HOME;
  if (androidHome && androidHome !== sdkRoot) {
    searchedPaths.push(androidHome);
    const paths = validateSdk(androidHome);
    if (paths) {
      cachedSdkPaths = paths;
      return paths;
    }
  }
  for (const defaultPath of getDefaultSdkPaths()) {
    if (defaultPath && !searchedPaths.includes(defaultPath)) {
      searchedPaths.push(defaultPath);
      const paths = validateSdk(defaultPath);
      if (paths) {
        cachedSdkPaths = paths;
        return paths;
      }
    }
  }
  throw new SdkNotFoundError(searchedPaths);
}
export function clearSdkCache(): void {
  cachedSdkPaths = null;
}
export function isSdkAvailable(): boolean {
  try {
    detectSdk();
    return true;
  } catch {
    return false;
  }
}
export function isBuildToolsInstalled(version: string): boolean {
  try {
    const sdk = detectSdk();
    return fs.existsSync(path.join(sdk.root, 'build-tools', version));
  } catch {
    return false;
  }
}
