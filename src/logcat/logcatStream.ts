import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { detectSdk } from '../core/sdkDetector';
import { LogEntry, LogFilter, StreamState, parseLogLine, matchesFilter } from './types';
export interface LogcatStreamEvents {
  'entry': (entry: LogEntry) => void;
  'state': (state: StreamState) => void;
  'error': (message: string) => void;
  'cleared': () => void;
}
export class LogcatStream extends EventEmitter {
  private process: ChildProcess | null = null;
  private buffer: string = '';
  private entryId: number = 0;
  private _state: StreamState = 'stopped';
  private _entries: LogEntry[] = [];
  private _filter: LogFilter;
  constructor(
    public readonly deviceId: string,
    filter: LogFilter = { minLevel: 'V' }
  ) {
    super();
    this._filter = filter;
  }
  get state(): StreamState {
    return this._state;
  }
  get entries(): LogEntry[] {
    return this._entries;
  }
  get filter(): LogFilter {
    return this._filter;
  }
  start(): void {
    if (this.process) {
      return; 
    }
    this.setState('starting');
    try {
      const sdk = detectSdk();
      const args = ['-s', this.deviceId, 'logcat', '-v', 'threadtime'];
      this.process = spawn(sdk.adb, args);
      this.process.stdout?.on('data', (data: Buffer) => {
        this.handleData(data.toString());
      });
      this.process.stderr?.on('data', (data: Buffer) => {
        const error = data.toString().trim();
        if (error) {
          this.emitError(error);
        }
      });
      this.process.on('error', (err) => {
        this.emitError(err.message);
        this.setState('error');
      });
      this.process.on('close', (code) => {
        if (this._state === 'running') {
          this.emitError(`Logcat stream closed unexpectedly (code: ${code})`);
          this.setState('error');
        } else {
          this.setState('stopped');
        }
        this.process = null;
      });
      this.setState('running');
    } catch (error) {
      this.emitError(error instanceof Error ? error.message : 'Failed to start logcat');
      this.setState('error');
    }
  }
  stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.setState('stopped');
  }
  clear(): void {
    this._entries = [];
    this.emit('cleared');
  }
  setFilter(filter: LogFilter): void {
    this._filter = filter;
  }
  getFilteredEntries(): LogEntry[] {
    return this._entries.filter(entry => matchesFilter(entry, this._filter));
  }
  private handleData(data: string): void {
    this.buffer += data;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      const entry = parseLogLine(line, ++this.entryId);
      if (entry) {
        this._entries.push(entry);
        if (this._entries.length > 10000) {
          this._entries.shift();
        }
        if (matchesFilter(entry, this._filter)) {
          this.emit('entry', entry);
        }
      }
    }
  }
  private setState(state: StreamState): void {
    this._state = state;
    this.emit('state', state);
  }
  private emitError(message: string): void {
    this.emit('error', message);
  }
}
export class LogcatManager {
  private streams: Map<string, LogcatStream> = new Map();
  getStream(deviceId: string): LogcatStream {
    let stream = this.streams.get(deviceId);
    if (!stream) {
      stream = new LogcatStream(deviceId);
      this.streams.set(deviceId, stream);
    }
    return stream;
  }
  removeStream(deviceId: string): void {
    const stream = this.streams.get(deviceId);
    if (stream) {
      stream.stop();
      this.streams.delete(deviceId);
    }
  }
  stopAll(): void {
    for (const stream of this.streams.values()) {
      stream.stop();
    }
    this.streams.clear();
  }
  getActiveStreams(): LogcatStream[] {
    return Array.from(this.streams.values()).filter(s => s.state === 'running');
  }
}
export const logcatManager = new LogcatManager();
