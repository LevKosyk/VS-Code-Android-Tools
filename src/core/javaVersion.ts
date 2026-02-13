export function parseJavaMajorVersion(output: string): number | undefined {
  const versionMatch = output.match(/version\s+"([^"]+)"/i);
  const raw = versionMatch ? versionMatch[1] : output.trim();
  const parts = raw.split(/[._-]/).filter(Boolean);
  if (parts.length === 0) {
    return undefined;
  }
  const first = parseInt(parts[0], 10);
  if (Number.isNaN(first)) {
    return undefined;
  }
  if (first === 1 && parts.length > 1) {
    const legacy = parseInt(parts[1], 10);
    return Number.isNaN(legacy) ? undefined : legacy;
  }
  return first;
}

export function parseJavaVersionLabel(output: string): string | undefined {
  const versionMatch = output.match(/version\s+"([^"]+)"/i);
  if (versionMatch?.[1]) {
    return versionMatch[1];
  }
  return output.trim() || undefined;
}
