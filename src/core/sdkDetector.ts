/**
 * Android SDK Detection
 * Detects SDK location via environment variables and default paths
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SdkNotFoundError } from './errors';

/**
 * SDK paths and executables
 */
export interface SdkPaths {
  root: string;
  adb: string;
  emulator: string;
  avdmanager: string;
}

// Cached SDK paths (resolved once per session)
let cachedSdkPaths: SdkPaths | null = null;

/**
 * Get platform-specific default SDK paths
 */
function getDefaultSdkPaths(): string[] {
  const home = os.homedir();
  const platform = os.platform();

  switch (platform) {
    case 'darwin': // macOS
      return [
        path.join(home, 'Library', 'Android', 'sdk'),
      ];
    case 'linux':
      return [
        path.join(home, 'Android', 'Sdk'),
        path.join(home, 'android-sdk'),
      ];
    case 'win32': // Windows
      return [
        path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk'),
        path.join(home, 'AppData', 'Local', 'Android', 'Sdk'),
      ];
    default:
      return [];
  }
}

/**
 * Get executable extension for current platform
 */
function getExecutableExtension(): string {
  return os.platform() === 'win32' ? '.exe' : '';
}

/**
 * Get batch/shell extension for current platform
 */
function getScriptExtension(): string {
  return os.platform() === 'win32' ? '.bat' : '';
}

/**
 * Check if a path exists and is a directory
 */
function isValidDirectory(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if a path exists and is executable
 */
function isExecutable(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    // On Windows, just check if file exists
    try {
      return fs.statSync(filePath).isFile();
    } catch {
      return false;
    }
  }
}

/**
 * Find executable in SDK
 */
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

/**
 * Find avdmanager (in cmdline-tools)
 */
function findAvdManager(sdkRoot: string): string | null {
  const ext = getScriptExtension();
  const cmdlineToolsPath = path.join(sdkRoot, 'cmdline-tools');

  // Check versioned paths first (latest, 11.0, etc.)
  if (isValidDirectory(cmdlineToolsPath)) {
    try {
      const versions = fs.readdirSync(cmdlineToolsPath);
      // Sort to prefer 'latest' or highest version
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
      // Ignore read errors
    }
  }

  // Fallback to legacy tools path
  const legacyPath = path.join(sdkRoot, 'tools', 'bin', 'avdmanager' + ext);
  if (isExecutable(legacyPath)) {
    return legacyPath;
  }

  return null;
}

/**
 * Validate SDK directory and locate executables
 */
function validateSdk(sdkRoot: string): SdkPaths | null {
  if (!isValidDirectory(sdkRoot)) {
    return null;
  }

  // ADB must exist
  const adb = findExecutable(sdkRoot, 'platform-tools', 'adb');
  if (!adb) {
    return null;
  }

  // Emulator must exist
  const emulator = findExecutable(sdkRoot, 'emulator', 'emulator');
  if (!emulator) {
    return null;
  }

  // AVD Manager (optional but needed for creating AVDs)
  const avdmanager = findAvdManager(sdkRoot);

  return {
    root: sdkRoot,
    adb,
    emulator,
    avdmanager: avdmanager || '',
  };
}

/**
 * Detect Android SDK location
 * Checks environment variables first, then default paths
 * 
 * @throws SdkNotFoundError if SDK cannot be found
 */
export function detectSdk(): SdkPaths {
  // Return cached result if available
  if (cachedSdkPaths) {
    return cachedSdkPaths;
  }

  const searchedPaths: string[] = [];

  // 1. Check ANDROID_SDK_ROOT (preferred)
  const sdkRoot = process.env.ANDROID_SDK_ROOT;
  if (sdkRoot) {
    searchedPaths.push(sdkRoot);
    const paths = validateSdk(sdkRoot);
    if (paths) {
      cachedSdkPaths = paths;
      return paths;
    }
  }

  // 2. Check ANDROID_HOME (legacy)
  const androidHome = process.env.ANDROID_HOME;
  if (androidHome && androidHome !== sdkRoot) {
    searchedPaths.push(androidHome);
    const paths = validateSdk(androidHome);
    if (paths) {
      cachedSdkPaths = paths;
      return paths;
    }
  }

  // 3. Check default paths
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

/**
 * Clear cached SDK paths (useful for testing or re-detection)
 */
export function clearSdkCache(): void {
  cachedSdkPaths = null;
}

/**
 * Check if SDK is available without throwing
 */
export function isSdkAvailable(): boolean {
  try {
    detectSdk();
    return true;
  } catch {
    return false;
  }
}
