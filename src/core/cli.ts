/**
 * CLI execution utilities
 * Promise-based wrappers for child_process with timeout and error handling
 */

import { spawn, exec, ChildProcess, SpawnOptions, ExecOptions } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface SpawnResult {
  process: ChildProcess;
  exitPromise: Promise<number>;
}

export interface CommandOptions {
  cwd?: string;
  timeout?: number;
  env?: NodeJS.ProcessEnv;
}

/**
 * Default timeout for commands (30 seconds)
 */
const DEFAULT_TIMEOUT = 30_000;

/**
 * Execute a command and wait for completion
 * Use for short-running commands that return output
 */
export async function execCommand(
  command: string,
  args: string[] = [],
  options: CommandOptions = {}
): Promise<ExecResult> {
  const fullCommand = args.length > 0
    ? `"${command}" ${args.map(a => `"${a}"`).join(' ')}`
    : `"${command}"`;

  const execOptions: ExecOptions = {
    cwd: options.cwd,
    timeout: options.timeout ?? DEFAULT_TIMEOUT,
    env: options.env ?? process.env,
    maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large outputs
  };

  try {
    const { stdout, stderr } = await execAsync(fullCommand, execOptions);
    return {
      stdout: String(stdout).trim(),
      stderr: String(stderr).trim(),
      exitCode: 0,
    };
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: (execError.stdout ?? '').toString().trim(),
      stderr: (execError.stderr ?? '').toString().trim(),
      exitCode: execError.code ?? 1,
    };
  }
}

/**
 * Spawn a long-running process
 * Use for processes that run indefinitely (like emulators)
 */
export function spawnProcess(
  command: string,
  args: string[] = [],
  options: CommandOptions = {}
): SpawnResult {
  const spawnOptions: SpawnOptions = {
    cwd: options.cwd,
    env: options.env ?? process.env,
    detached: true, // Allow process to run independently
    stdio: ['ignore', 'pipe', 'pipe'],
  };

  const childProcess = spawn(command, args, spawnOptions);

  // Unref to allow Node.js to exit even if emulator is running
  childProcess.unref();

  const exitPromise = new Promise<number>((resolve) => {
    childProcess.on('exit', (code) => {
      resolve(code ?? 0);
    });
    childProcess.on('error', () => {
      resolve(1);
    });
  });

  return {
    process: childProcess,
    exitPromise,
  };
}

/**
 * Execute command and parse output lines
 * Filters empty lines and trims whitespace
 */
export async function execCommandLines(
  command: string,
  args: string[] = [],
  options: CommandOptions = {}
): Promise<string[]> {
  const result = await execCommand(command, args, options);
  
  if (result.exitCode !== 0) {
    return [];
  }

  return result.stdout
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
}

/**
 * Wait for a condition with polling
 */
export async function waitFor(
  checkFn: () => Promise<boolean>,
  options: { timeout?: number; interval?: number } = {}
): Promise<boolean> {
  const timeout = options.timeout ?? 120_000; // 2 minutes default
  const interval = options.interval ?? 2_000;  // 2 seconds
  
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await checkFn()) {
      return true;
    }
    await sleep(interval);
  }
  
  return false;
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
