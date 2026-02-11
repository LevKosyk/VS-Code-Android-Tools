import * as fs from 'fs';
import * as path from 'path';
import { detectSdk } from './sdkDetector';

export interface HealthIssue {
  title: string;
  fix?: string;
}

export function checkProjectHealth(): HealthIssue[] {
  const issues: HealthIssue[] = [];
  let sdkRoot = '';
  try {
    const sdk = detectSdk();
    sdkRoot = sdk.root;
  } catch {
    issues.push({ title: 'Android SDK not found', fix: 'Set ANDROID_SDK_ROOT or install SDK' });
    return issues;
  }
  const buildToolsDir = path.join(sdkRoot, 'build-tools');
  if (!fs.existsSync(buildToolsDir) || fs.readdirSync(buildToolsDir).length === 0) {
    issues.push({ title: 'Build Tools not found', fix: 'Install Build Tools in Android SDK Manager' });
  }
  const platformsDir = path.join(sdkRoot, 'platforms');
  if (!fs.existsSync(platformsDir) || fs.readdirSync(platformsDir).length === 0) {
    issues.push({ title: 'Android platforms not found', fix: 'Install at least one platform (e.g. android-34)' });
  }
  const ndkDir = path.join(sdkRoot, 'ndk');
  const ndkBundleDir = path.join(sdkRoot, 'ndk-bundle');
  if (!fs.existsSync(ndkDir) && !fs.existsSync(ndkBundleDir)) {
    issues.push({ title: 'NDK not found', fix: 'Install NDK if your project needs native builds' });
  }
  return issues;
}
