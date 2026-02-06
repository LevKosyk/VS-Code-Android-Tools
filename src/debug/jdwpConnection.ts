/**
 * JDWP Connection Manager
 * Handles connection to Android debuggable processes via adb
 */

import * as net from 'net';
import { execCommand, execCommandLines } from '../core/cli';
import { detectSdk } from '../core/sdkDetector';
import { DebuggableProcess, DebugConfig } from './types';

/**
 * Default local port for JDWP forwarding
 */
const DEFAULT_JDWP_PORT = 8700;

/**
 * List debuggable processes on a device
 */
export async function listDebuggableProcesses(deviceId: string): Promise<DebuggableProcess[]> {
  const sdk = detectSdk();

  try {
    // Get JDWP-enabled processes
    const result = await execCommand(sdk.adb, ['-s', deviceId, 'jdwp']);
    const pids = result.stdout.split('\n').filter(p => p.trim()).map(p => parseInt(p.trim(), 10));

    if (pids.length === 0) {
      return [];
    }

    // Get process info for each PID
    const processes: DebuggableProcess[] = [];
    
    for (const pid of pids) {
      const psResult = await execCommand(sdk.adb, [
        '-s', deviceId, 'shell', 
        `cat /proc/${pid}/cmdline 2>/dev/null | tr '\\0' ' '`
      ]);

      if (psResult.exitCode === 0 && psResult.stdout.trim()) {
        const cmdline = psResult.stdout.trim();
        // First part is usually the package name
        const packageName = cmdline.split(' ')[0] || `pid:${pid}`;
        
        processes.push({
          pid,
          packageName,
          processName: packageName,
        });
      }
    }

    return processes;
  } catch {
    return [];
  }
}

/**
 * Forward JDWP port for a process
 */
export async function forwardJdwpPort(
  deviceId: string,
  pid: number,
  localPort: number = DEFAULT_JDWP_PORT
): Promise<number> {
  const sdk = detectSdk();

  // Remove any existing forward on this port
  await execCommand(sdk.adb, ['-s', deviceId, 'forward', '--remove', `tcp:${localPort}`]).catch(() => {});

  // Create new forward
  const result = await execCommand(sdk.adb, [
    '-s', deviceId, 'forward', `tcp:${localPort}`, `jdwp:${pid}`
  ]);

  if (result.exitCode !== 0) {
    throw new Error(`Failed to forward JDWP port: ${result.stderr}`);
  }

  return localPort;
}

/**
 * Remove JDWP port forward
 */
export async function removeJdwpForward(deviceId: string, localPort: number): Promise<void> {
  const sdk = detectSdk();
  await execCommand(sdk.adb, ['-s', deviceId, 'forward', '--remove', `tcp:${localPort}`]).catch(() => {});
}

/**
 * Simple JDWP handshake to verify connection
 */
export async function verifyJdwpConnection(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let connected = false;

    socket.setTimeout(3000);

    socket.on('connect', () => {
      // Send JDWP handshake
      const handshake = Buffer.from('JDWP-Handshake');
      socket.write(handshake);
    });

    socket.on('data', (data) => {
      // Check for handshake response
      if (data.toString() === 'JDWP-Handshake') {
        connected = true;
        socket.destroy();
        resolve(true);
      }
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('close', () => {
      if (!connected) {
        resolve(false);
      }
    });

    socket.connect(port, '127.0.0.1');
  });
}

/**
 * Find an available port for JDWP forwarding
 */
export async function findAvailablePort(startPort: number = DEFAULT_JDWP_PORT): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    
    server.on('error', () => {
      // Port in use, try next
      findAvailablePort(startPort + 1).then(resolve).catch(reject);
    });

    server.listen(startPort, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
  });
}

/**
 * Get package name for a running app by PID
 */
export async function getPackageForPid(deviceId: string, pid: number): Promise<string | undefined> {
  const sdk = detectSdk();
  
  try {
    const result = await execCommand(sdk.adb, [
      '-s', deviceId, 'shell',
      `cat /proc/${pid}/cmdline | tr '\\0' '\\n' | head -1`
    ]);
    
    if (result.exitCode === 0) {
      return result.stdout.trim() || undefined;
    }
  } catch {
    // Ignore
  }
  
  return undefined;
}

/**
 * Check if an app is debuggable
 */
export async function isAppDebuggable(deviceId: string, packageName: string): Promise<boolean> {
  const sdk = detectSdk();
  
  try {
    const result = await execCommand(sdk.adb, [
      '-s', deviceId, 'shell',
      `run-as ${packageName} id 2>/dev/null && echo DEBUGGABLE`
    ]);
    
    return result.stdout.includes('DEBUGGABLE');
  } catch {
    return false;
  }
}
