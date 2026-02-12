import { execCommand } from '../core/cli';
import { detectSdk } from '../core/sdkDetector';
import { CpuSnapshot, MemorySnapshot, GraphicsStats, StartupStats, ProfilerResult } from './types';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
export class ProfilerService {
  private static instance: ProfilerService;
  private constructor() {}
  static getInstance(): ProfilerService {
    if (!ProfilerService.instance) {
      ProfilerService.instance = new ProfilerService();
    }
    return ProfilerService.instance;
  }
  async captureCpu(deviceId: string, packageName: string): Promise<ProfilerResult<CpuSnapshot>> {
    const sdk = detectSdk();
    const result = await execCommand(sdk.adb, [
      '-s', deviceId, 'shell', 'top', '-n', '1', '-s', '9'
    ]);
    if (result.exitCode !== 0) {
      return { success: false, message: `Failed to capture CPU: ${result.stderr}` };
    }
    const lines = result.stdout.split('\n');
    const processLine = lines.find(line => line.includes(packageName));
    if (!processLine) {
      return { success: false, message: `Process not found: ${packageName}` };
    }
    const parts = processLine.trim().split(/\s+/);
    const cpuIndex = parts.findIndex(p => p.includes('%') || (!isNaN(parseFloat(p)) && parseFloat(p) <= 800)); 
    const cpuVal = parseFloat(parts[parts.length - 4] || '0'); 
    return {
      success: true,
      message: 'CPU snapshot captured',
      data: {
        timestamp: Date.now(),
        totalCpu: cpuVal, 
        processCpu: cpuVal, 
        threads: 0 
      }
    };
  }
  async captureMemory(deviceId: string, packageName: string): Promise<ProfilerResult<MemorySnapshot>> {
    const sdk = detectSdk();
    const result = await execCommand(sdk.adb, [
      '-s', deviceId, 'shell', 'dumpsys', 'meminfo', packageName
    ]);
    if (result.exitCode !== 0 || result.stdout.includes('No process found')) {
      return { success: false, message: `Failed to capture memory: ${result.stderr || 'Process not found'}` };
    }
    const output = result.stdout;
    const getVal = (regex: RegExp): number => {
      const match = output.match(regex);
      return match ? parseInt(match[1], 10) : 0;
    };
    const javaHeap = getVal(/Java Heap:\s+(\d+)/);
    const nativeHeap = getVal(/Native Heap:\s+(\d+)/);
    const totalPss = getVal(/TOTAL:\s+(\d+)/); 
    return {
      success: true,
      message: 'Memory snapshot captured',
      data: {
        timestamp: Date.now(),
        javaHeap: { used: javaHeap, max: 0 }, 
        nativeHeap: { used: nativeHeap, max: 0 },
        totalPss: totalPss
      }
    };
  }
  async captureGraphics(deviceId: string, packageName: string): Promise<ProfilerResult<GraphicsStats>> {
    const sdk = detectSdk();
    const result = await execCommand(sdk.adb, [
      '-s', deviceId, 'shell', 'dumpsys', 'gfxinfo', packageName
    ]);
    if (result.exitCode !== 0) {
      return { success: false, message: `Failed to capture graphics: ${result.stderr}` };
    }
    const output = result.stdout;
    const totalFramesMatch = output.match(/Total frames rendered: (\d+)/);
    const jankyFramesMatch = output.match(/Janky frames: (\d+)/);
    const p90Match = output.match(/90th percentile: (\d+)ms/);
    const p95Match = output.match(/95th percentile: (\d+)ms/);
    const p99Match = output.match(/99th percentile: (\d+)ms/);
    if (!totalFramesMatch) {
       return { success: false, message: 'No graphics stats found. App might not have drawn frames yet.' };
    }
    return {
      success: true,
      message: 'Graphics stats captured',
      data: {
        timestamp: Date.now(),
        totalFrames: parseInt(totalFramesMatch[1], 10),
        jankyFrames: parseInt(jankyFramesMatch ? jankyFramesMatch[1] : '0', 10),
        percentile90: parseInt(p90Match ? p90Match[1] : '0', 10),
        percentile95: parseInt(p95Match ? p95Match[1] : '0', 10),
        percentile99: parseInt(p99Match ? p99Match[1] : '0', 10)
      }
    };
  }
  async resetGraphics(deviceId: string, packageName: string): Promise<void> {
    const sdk = detectSdk();
    await execCommand(sdk.adb, [
      '-s', deviceId, 'shell', 'dumpsys', 'gfxinfo', packageName, 'reset'
    ]);
  }
  async measureStartup(deviceId: string, packageName: string, activityName: string): Promise<ProfilerResult<StartupStats>> {
    const sdk = detectSdk();
    await execCommand(sdk.adb, ['-s', deviceId, 'shell', 'am', 'force-stop', packageName]);
    await new Promise(r => setTimeout(r, 1000));
    const component = `${packageName}/${activityName}`;
    const result = await execCommand(sdk.adb, [
      '-s', deviceId, 'shell', 'am', 'start', '-W', '-n', component
    ]);
    if (result.exitCode !== 0) {
      return { success: false, message: `Failed to measure startup: ${result.stderr}` };
    }
    const output = result.stdout;
    const totalTimeMatch = output.match(/TotalTime: (\d+)/);
    const waitTimeMatch = output.match(/WaitTime: (\d+)/);
    if (!totalTimeMatch) {
      return { success: false, message: 'Could not parse startup time' };
    }
    return {
      success: true,
      message: 'Startup time measured',
      data: {
        timestamp: Date.now(),
        type: 'cold',
        totalTime: parseInt(totalTimeMatch[1], 10),
        waitTime: parseInt(waitTimeMatch ? waitTimeMatch[1] : '0', 10)
      }
    };
  }
  async recordSeries(deviceId: string, packageName: string, durationMs: number, intervalMs: number): Promise<ProfilerResult<string>> {
    const samples: any[] = [];
    const end = Date.now() + durationMs;
    while (Date.now() < end) {
      const [cpu, mem, gfx] = await Promise.all([
        this.captureCpu(deviceId, packageName),
        this.captureMemory(deviceId, packageName),
        this.captureGraphics(deviceId, packageName),
      ]);
      samples.push({
        ts: Date.now(),
        cpu: cpu.success ? cpu.data : null,
        mem: mem.success ? mem.data : null,
        gfx: gfx.success ? gfx.data : null,
      });
      await new Promise(r => setTimeout(r, intervalMs));
    }
    const outPath = path.join(os.tmpdir(), `android-tools-profile-${Date.now()}.json`);
    fs.writeFileSync(outPath, JSON.stringify(samples, null, 2), 'utf-8');
    return { success: true, message: 'Recorded samples', data: outPath };
  }
}
