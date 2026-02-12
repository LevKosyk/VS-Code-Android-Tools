import * as vscode from 'vscode';
import { runGradleTaskWithResult } from './gradleService';
import { showGradleOutput } from './gradleOutput';

export async function inspectBuildCache(workspaceRoot: string): Promise<void> {
  const channel = vscode.window.createOutputChannel('Android Build Cache');
  channel.clear();
  channel.appendLine('Inspecting build cache (dry run)...');
  const result = await runGradleTaskWithResult(
    workspaceRoot,
    'build',
    ['--dry-run', '--build-cache', '--info']
  );
  showGradleOutput('build --dry-run --build-cache --info', result, workspaceRoot);
  const info = summarize(result.stdout + '\n' + result.stderr);
  channel.appendLine('');
  channel.appendLine('Cache summary:');
  channel.appendLine(`- Hits: ${info.hits}`);
  channel.appendLine(`- Misses: ${info.misses}`);
  channel.appendLine(`- Disabled: ${info.disabled}`);
  channel.appendLine(`- Reused outputs: ${info.reused}`);
  channel.show(true);
}

function summarize(output: string) {
  const hits = (output.match(/FROM-CACHE/g) || []).length;
  const misses = (output.match(/cache miss/gi) || []).length;
  const disabled = output.includes('Build cache is disabled');
  const reused = (output.match(/Reusing outputs/g) || []).length;
  return { hits, misses, disabled, reused };
}
