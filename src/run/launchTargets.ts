import * as fs from 'fs';
import * as path from 'path';

export type LaunchTargetType = 'launcher' | 'activity' | 'deepLink';

export interface LaunchTarget {
  id: string;
  label: string;
  type: LaunchTargetType;
  activity?: string;
  deepLink?: string;
}

function readManifest(workspaceRoot: string, moduleName: string): string | undefined {
  const candidates = [
    path.join(workspaceRoot, moduleName, 'src', 'main', 'AndroidManifest.xml'),
    path.join(workspaceRoot, 'app', 'src', 'main', 'AndroidManifest.xml'),
    path.join(workspaceRoot, 'src', 'main', 'AndroidManifest.xml'),
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) {
      continue;
    }
    try {
      return fs.readFileSync(candidate, 'utf-8');
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function attr(xml: string, name: string): string | undefined {
  const m = xml.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`));
  return m?.[1];
}

function resolveActivityName(appPackage: string, raw: string): string {
  if (raw.startsWith('.')) {
    return `${appPackage}${raw}`;
  }
  if (raw.includes('.')) {
    return raw;
  }
  return `${appPackage}.${raw}`;
}

function firstDataUri(intentFilterXml: string): string | undefined {
  const dataRegex = /<data\b([^>]*?)\/?>/gi;
  let match: RegExpExecArray | null;
  while ((match = dataRegex.exec(intentFilterXml)) !== null) {
    const attrs = match[1] || '';
    const scheme = attr(attrs, 'android:scheme');
    if (!scheme) {
      continue;
    }
    const host = attr(attrs, 'android:host');
    const port = attr(attrs, 'android:port');
    const pathValue = attr(attrs, 'android:path') || attr(attrs, 'android:pathPrefix') || attr(attrs, 'android:pathPattern') || '';
    const hostWithPort = host ? `${host}${port ? `:${port}` : ''}` : '';
    if (hostWithPort) {
      return `${scheme}://${hostWithPort}${pathValue}`;
    }
    return `${scheme}://`;
  }
  return undefined;
}

export function listManifestLaunchTargets(workspaceRoot: string, moduleName: string, fallbackPackageName = ''): LaunchTarget[] {
  const manifest = readManifest(workspaceRoot, moduleName);
  const targets: LaunchTarget[] = [
    { id: 'launcher', label: 'Default Launcher Activity', type: 'launcher' },
  ];
  if (!manifest) {
    return targets;
  }
  const pkg = attr(manifest, 'package') || fallbackPackageName;
  const activityRegex = /<activity\b([\s\S]*?)(?:\/>|>([\s\S]*?)<\/activity>)/gi;
  let activityMatch: RegExpExecArray | null;
  const seen = new Set<string>(targets.map(t => t.id));
  while ((activityMatch = activityRegex.exec(manifest)) !== null) {
    const attrs = activityMatch[1] || '';
    const body = activityMatch[2] || '';
    const rawName = attr(attrs, 'android:name');
    if (!rawName) {
      continue;
    }
    const fqcn = pkg ? resolveActivityName(pkg, rawName) : rawName;
    const activityId = `activity:${fqcn}`;
    if (!seen.has(activityId)) {
      targets.push({
        id: activityId,
        label: `Activity: ${fqcn}`,
        type: 'activity',
        activity: fqcn,
      });
      seen.add(activityId);
    }
    const intentRegex = /<intent-filter\b[\s\S]*?<\/intent-filter>/gi;
    let intentMatch: RegExpExecArray | null;
    while ((intentMatch = intentRegex.exec(body)) !== null) {
      const intentBlock = intentMatch[0];
      const hasView = /android\.intent\.action\.VIEW/.test(intentBlock);
      const hasBrowsable = /android\.intent\.category\.BROWSABLE/.test(intentBlock);
      if (!hasView || !hasBrowsable) {
        continue;
      }
      const uri = firstDataUri(intentBlock);
      if (!uri) {
        continue;
      }
      const deepId = `deeplink:${uri}->${fqcn}`;
      if (seen.has(deepId)) {
        continue;
      }
      targets.push({
        id: deepId,
        label: `Deep Link: ${uri} -> ${fqcn}`,
        type: 'deepLink',
        activity: fqcn,
        deepLink: uri,
      });
      seen.add(deepId);
    }
  }
  return targets;
}

