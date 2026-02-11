import * as fs from 'fs';
import * as path from 'path';

function readIfExists(filePath: string): string | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return undefined;
  }
}

export function findApplicationId(workspaceRoot: string): string | undefined {
  const candidates = [
    path.join(workspaceRoot, 'app', 'build.gradle'),
    path.join(workspaceRoot, 'app', 'build.gradle.kts'),
  ];
  for (const file of candidates) {
    const content = readIfExists(file);
    if (!content) {
      continue;
    }
    const gradleMatch = content.match(/applicationId\s+["']([^"']+)["']/);
    if (gradleMatch) {
      return gradleMatch[1];
    }
    const ktsMatch = content.match(/applicationId\s*=\s*["']([^"']+)["']/);
    if (ktsMatch) {
      return ktsMatch[1];
    }
  }
  return undefined;
}
