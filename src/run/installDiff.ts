import * as fs from 'fs';
import * as path from 'path';
import { detectSdk } from '../core/sdkDetector';
import { execCommand } from '../core/cli';
import { AdbService } from '../services';

export interface InstallDiffSnapshot {
  packageName?: string;
  versionName?: string;
  versionCode?: string;
  signature?: string;
}

export interface InstallDiffSummary {
  title: string;
  lines: string[];
}

function exe(name: string): string {
  return process.platform === 'win32' ? `${name}.exe` : name;
}

function bat(name: string): string {
  return process.platform === 'win32' ? `${name}.bat` : name;
}

function compareVersions(a: string, b: string): number {
  const left = a.split(/[.\-]/).map(v => Number.parseInt(v, 10));
  const right = b.split(/[.\-]/).map(v => Number.parseInt(v, 10));
  const size = Math.max(left.length, right.length);
  for (let i = 0; i < size; i += 1) {
    const lv = Number.isFinite(left[i]) ? left[i] : 0;
    const rv = Number.isFinite(right[i]) ? right[i] : 0;
    if (lv !== rv) {
      return lv - rv;
    }
  }
  return a.localeCompare(b);
}

function findLatestBuildToolsBin(sdkRoot: string, toolName: string): string | undefined {
  const buildToolsRoot = path.join(sdkRoot, 'build-tools');
  if (!fs.existsSync(buildToolsRoot)) {
    return undefined;
  }
  const candidates = fs.readdirSync(buildToolsRoot)
    .map(v => path.join(buildToolsRoot, v, toolName))
    .filter(full => fs.existsSync(full))
    .sort((a, b) => compareVersions(path.basename(path.dirname(a)), path.basename(path.dirname(b))))
    .reverse();
  return candidates[0];
}

function parseAaptBadging(output: string): InstallDiffSnapshot {
  const packageName = output.match(/package:\s+name='([^']+)'/)?.[1];
  const versionCode = output.match(/versionCode='([^']+)'/)?.[1];
  const versionName = output.match(/versionName='([^']+)'/)?.[1];
  return { packageName, versionCode, versionName };
}

function parseApkSigner(output: string): string | undefined {
  const sha256 = output.match(/SHA-256 digest:\s*([A-Fa-f0-9:]+)/)?.[1];
  if (sha256) {
    return sha256.toLowerCase();
  }
  return undefined;
}

function parseInstalledSignature(output: string): string | undefined {
  const sha = output.match(/SHA-256\s+digest:\s*([A-Fa-f0-9:]+)/)?.[1];
  if (sha) {
    return sha.toLowerCase();
  }
  const legacy = output.match(/signatures:\s*\[([^\]]+)\]/)?.[1];
  if (legacy) {
    return legacy.trim().toLowerCase();
  }
  return undefined;
}

export async function readApkSnapshot(apkPath: string): Promise<InstallDiffSnapshot> {
  const sdk = detectSdk();
  const aapt = findLatestBuildToolsBin(sdk.root, exe('aapt'));
  const apksigner = findLatestBuildToolsBin(sdk.root, bat('apksigner'));
  const out: InstallDiffSnapshot = {};
  if (aapt) {
    const badging = await execCommand(aapt, ['dump', 'badging', apkPath], { timeout: 45_000 });
    if (badging.exitCode === 0 && badging.stdout) {
      Object.assign(out, parseAaptBadging(badging.stdout));
    }
  }
  if (apksigner) {
    const signer = await execCommand(apksigner, ['verify', '--print-certs', apkPath], { timeout: 45_000 });
    if (signer.stdout || signer.stderr) {
      out.signature = parseApkSigner(`${signer.stdout}\n${signer.stderr}`);
    }
  }
  return out;
}

export async function readInstalledSnapshot(deviceId: string, packageName: string): Promise<InstallDiffSnapshot> {
  const pkg = await AdbService.getPackageDetails(deviceId, packageName);
  const sdk = detectSdk();
  const dumpsys = await execCommand(sdk.adb, ['-s', deviceId, 'shell', 'dumpsys', 'package', packageName], { timeout: 30_000 });
  return {
    packageName,
    versionName: pkg.versionName,
    versionCode: pkg.versionCode,
    signature: parseInstalledSignature(`${dumpsys.stdout}\n${dumpsys.stderr}`),
  };
}

function lineDiff(name: string, before?: string, after?: string): string {
  const left = before && before.length > 0 ? before : 'n/a';
  const right = after && after.length > 0 ? after : 'n/a';
  if (left === right) {
    return `${name}: unchanged (${right})`;
  }
  return `${name}: ${left} -> ${right}`;
}

export function buildInstallDiffSummary(before: InstallDiffSnapshot, after: InstallDiffSnapshot): InstallDiffSummary {
  return {
    title: 'Install Diff',
    lines: [
      lineDiff('Package', before.packageName, after.packageName),
      lineDiff('versionName', before.versionName, after.versionName),
      lineDiff('versionCode', before.versionCode, after.versionCode),
      lineDiff('Signature', before.signature, after.signature),
    ],
  };
}

