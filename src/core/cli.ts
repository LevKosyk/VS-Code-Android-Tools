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
const DEFAULT_TIMEOUT = 30_000;
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
    maxBuffer: 10 * 1024 * 1024, 
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
export async function execCommandWithInput(
  command: string,
  args: string[] = [],
  input: string = '',
  options: CommandOptions = {}
): Promise<ExecResult> {
  const spawnOptions: SpawnOptions = {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  };
  return new Promise<ExecResult>((resolve) => {
    const child = spawn(command, args, spawnOptions);
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timeoutId: NodeJS.Timeout | undefined;
    const finish = (exitCode: number, overrideStderr?: string) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      resolve({
        stdout: stdout.trim(),
        stderr: (overrideStderr ?? stderr).trim(),
        exitCode,
      });
    };
    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    child.on('error', (err) => {
      finish(1, err.message);
    });
    child.on('close', (code) => {
      finish(code ?? 0);
    });
    if (input) {
      child.stdin?.write(input);
    }
    child.stdin?.end();
    const timeoutMs = options.timeout ?? DEFAULT_TIMEOUT;
    timeoutId = timeoutMs
      ? setTimeout(() => {
          child.kill();
          finish(1, 'Command timed out');
        }, timeoutMs)
      : undefined;
  });
}
export function spawnProcess(
  command: string,
  args: string[] = [],
  options: CommandOptions = {}
): SpawnResult {
  const spawnOptions: SpawnOptions = {
    cwd: options.cwd,
    env: options.env ?? process.env,
    detached: true, 
    stdio: ['ignore', 'pipe', 'pipe'],
  };
  const childProcess = spawn(command, args, spawnOptions);
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
export async function waitFor(
  checkFn: () => Promise<boolean>,
  options: { timeout?: number; interval?: number } = {}
): Promise<boolean> {
  const timeout = options.timeout ?? 120_000; 
  const interval = options.interval ?? 2_000;  
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (await checkFn()) {
      return true;
    }
    await sleep(interval);
  }
  return false;
}
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
