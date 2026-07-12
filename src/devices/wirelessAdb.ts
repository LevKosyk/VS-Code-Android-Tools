import { execCommand } from '../core/cli';
import { detectSdk } from '../core/sdkDetector';

export interface WirelessEndpoint {
  host: string;
  port: number;
  address: string;
}

export function parseWirelessEndpoint(value: string): WirelessEndpoint | undefined {
  const trimmed = value.trim();
  const match = /^(\[[0-9a-f:]+\]|[^:\s]+):(\d{1,5})$/i.exec(trimmed);
  if (!match) return undefined;
  const port = Number(match[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return undefined;
  return { host: match[1], port, address: `${match[1]}:${port}` };
}

export async function pairWirelessDevice(address: string, pairingCode: string) {
  const endpoint = parseWirelessEndpoint(address);
  if (!endpoint) return { success: false, message: 'Enter a valid host:port pairing address.' };
  if (!/^\d{6}$/.test(pairingCode.trim())) return { success: false, message: 'Pairing code must contain 6 digits.' };
  const sdk = detectSdk();
  const result = await execCommand(sdk.adb, ['pair', endpoint.address, pairingCode.trim()], { timeout: 30_000 });
  return {
    success: result.exitCode === 0 && /successfully paired|already paired/i.test(`${result.stdout}\n${result.stderr}`),
    message: result.stdout || result.stderr || 'ADB pair returned no output.',
  };
}

export async function connectWirelessDevice(address: string) {
  const endpoint = parseWirelessEndpoint(address);
  if (!endpoint) return { success: false, message: 'Enter a valid host:port connection address.' };
  const sdk = detectSdk();
  const result = await execCommand(sdk.adb, ['connect', endpoint.address], { timeout: 30_000 });
  return {
    success: result.exitCode === 0 && /connected to|already connected/i.test(`${result.stdout}\n${result.stderr}`),
    message: result.stdout || result.stderr || 'ADB connect returned no output.',
  };
}

export async function disconnectWirelessDevice(address: string) {
  const endpoint = parseWirelessEndpoint(address);
  if (!endpoint) return { success: false, message: 'Enter a valid host:port connection address.' };
  const sdk = detectSdk();
  const result = await execCommand(sdk.adb, ['disconnect', endpoint.address], { timeout: 15_000 });
  return { success: result.exitCode === 0, message: result.stdout || result.stderr || 'Wireless device disconnected.' };
}
