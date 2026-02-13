export type GradleFailureTag =
  | 'buildToolsVersion'
  | 'sdkMissing'
  | 'dependencyResolution'
  | 'jdkMismatch'
  | 'kotlinK2'
  | 'signingConfig'
  | 'namespaceMissing'
  | 'manifestMerge'
  | 'taskNotFound'
  | 'daemonIssue'
  | 'unknown';

export interface GradleFailureClassification {
  summary: string;
  tags: GradleFailureTag[];
}

export interface RunFailureRecord {
  action: string;
  message: string;
  reason: string;
  timestamp: number;
}

function lines(raw: string): string[] {
  return raw.trim().split('\n').map((l) => l.trim()).filter(Boolean);
}

export function classifyGradleFailure(raw: string): GradleFailureClassification {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      summary: 'Gradle task failed. See Android Gradle output for details.',
      tags: ['unknown'],
    };
  }
  const all = trimmed.toLowerCase();
  const outTags = new Set<GradleFailureTag>();

  if (/what went wrong:\s*25\.0\.1/i.test(trimmed) || /\b25\.0\.1\b/.test(trimmed)) {
    outTags.add('buildToolsVersion');
    outTags.add('jdkMismatch');
  }
  if (/sdk location not found|android sdk.*not found|sdk.dir is missing/i.test(all)) {
    outTags.add('sdkMissing');
  }
  if (/could not resolve|failed to resolve|dependency/i.test(all)) {
    outTags.add('dependencyResolution');
  }
  if (/kotlin language server|kotlincoreenvironment|illegalargumentexception:\s*25\.0\.1/i.test(all)) {
    outTags.add('kotlinK2');
    outTags.add('jdkMismatch');
  }
  if (/signingconfig|keystore|keystore was tampered|storefile|key alias/i.test(all)) {
    outTags.add('signingConfig');
  }
  if (/namespace not specified|android\.namespace/i.test(all)) {
    outTags.add('namespaceMissing');
  }
  if (/manifest merger failed|manifest merger/i.test(all)) {
    outTags.add('manifestMerge');
  }
  if (/task .* not found|cannot locate tasks|task '.+' not found/i.test(all)) {
    outTags.add('taskNotFound');
  }
  if (/gradle daemon|daemon disappeared|unable to start daemon/i.test(all)) {
    outTags.add('daemonIssue');
  }

  if (outTags.size === 0) {
    outTags.add('unknown');
  }

  const lns = lines(trimmed);
  const whatIdx = lns.findIndex((l) => /what went wrong/i.test(l));
  const top = whatIdx >= 0 ? lns.slice(whatIdx, Math.min(lns.length, whatIdx + 8)).join('\n') : lns.slice(0, 8).join('\n');

  if (outTags.has('buildToolsVersion')) {
    return {
      tags: Array.from(outTags),
      summary: [
        'Top error: Build Tools / Java mismatch (detected around 25.0.1).',
        'Why: Required Build Tools or Gradle JDK is not aligned with project requirements.',
        'What to do: install required build-tools, set JDK 21 for Gradle/Kotlin, then sync project.',
      ].join('\n'),
    };
  }
  if (outTags.has('sdkMissing')) {
    return {
      tags: Array.from(outTags),
      summary: [
        'Top error: Android SDK not configured.',
        'Why: SDK path is missing or invalid.',
        'What to do: set ANDROID_SDK_ROOT/local.properties and install required platforms/build-tools.',
      ].join('\n'),
    };
  }
  if (outTags.has('dependencyResolution')) {
    return {
      tags: Array.from(outTags),
      summary: [
        'Top error: Dependency resolution failed.',
        'Why: Missing repository, offline mode, or invalid coordinates.',
        'What to do: disable offline mode, verify repositories, refresh dependencies.',
      ].join('\n'),
    };
  }
  return { tags: Array.from(outTags), summary: top };
}

export function buildRunFailureReport(records: RunFailureRecord[], maxItems = 10): string {
  const sorted = [...records].sort((a, b) => b.timestamp - a.timestamp);
  const grouped = new Map<string, { count: number; lastTs: number; lastAction: string; sample: string }>();
  for (const record of sorted) {
    const key = `${record.action}::${record.reason}`;
    const current = grouped.get(key);
    if (current) {
      current.count += 1;
      if (record.timestamp > current.lastTs) {
        current.lastTs = record.timestamp;
        current.sample = record.message;
      }
    } else {
      grouped.set(key, {
        count: 1,
        lastTs: record.timestamp,
        lastAction: record.action,
        sample: record.message,
      });
    }
  }

  const top = Array.from(grouped.entries())
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => b.count - a.count || b.lastTs - a.lastTs)
    .slice(0, maxItems);

  const linesOut: string[] = [];
  linesOut.push('# Android Tools Run Failure Report');
  linesOut.push('');
  linesOut.push(`Generated: ${new Date().toISOString()}`);
  linesOut.push(`Total records: ${records.length}`);
  linesOut.push('');

  if (top.length === 0) {
    linesOut.push('No failures recorded in this session.');
    return linesOut.join('\n');
  }

  linesOut.push('## Top Reasons');
  top.forEach((item, index) => {
    const reason = item.key.split('::')[1] || 'unknown';
    linesOut.push(`${index + 1}. [${item.count}] ${item.lastAction} :: ${reason}`);
    linesOut.push(`   Last seen: ${new Date(item.lastTs).toISOString()}`);
    linesOut.push(`   Sample: ${item.sample}`);
  });
  return linesOut.join('\n');
}
