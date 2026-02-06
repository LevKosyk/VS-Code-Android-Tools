/**
 * Logcat Stream Manager
 * Manages live logcat streams from Android devices
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { detectSdk } from '../core/sdkDetector';
import { LogEntry, LogFilter, StreamState, parseLogLine, matchesFilter } from './types';

/**
 * Events emitted by LogcatStream
 */
export interface LogcatStreamEvents {
  'entry': (entry: LogEntry) => void;
  'state': (state: StreamState) => void;
  'error': (message: string) => void;
  'cleared': () => void;
}

/**
 * Logcat stream for a single device
 */
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

  /**
   * Start the logcat stream
   */
  start(): void {
    if (this.process) {
      return; // Already running
    }

    this.setState('starting');

    try {
      const sdk = detectSdk();
      
      // Build logcat command with threadtime format
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
          // Unexpected close
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

  /**
   * Stop the logcat stream
   */
  stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.setState('stopped');
  }

  /**
   * Clear all log entries
   */
  clear(): void {
    this._entries = [];
    this.emit('cleared');
  }

  /**
   * Update filter settings
   */
  setFilter(filter: LogFilter): void {
    this._filter = filter;
  }

  /**
   * Get filtered entries
   */
  getFilteredEntries(): LogEntry[] {
    return this._entries.filter(entry => matchesFilter(entry, this._filter));
  }

  /**
   * Handle incoming data from logcat
   */
  private handleData(data: string): void {
    this.buffer += data;
    const lines = this.buffer.split('\n');
    
    // Keep incomplete last line in buffer
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      const entry = parseLogLine(line, ++this.entryId);
      if (entry) {
        this._entries.push(entry);
        
        // Limit memory usage - keep last 10000 entries
        if (this._entries.length > 10000) {
          this._entries.shift();
        }

        // Emit if matches current filter
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

/**
 * Manager for multiple logcat streams
 */
export class LogcatManager {
  private streams: Map<string, LogcatStream> = new Map();

  /**
   * Get or create a stream for a device
   */
  getStream(deviceId: string): LogcatStream {
    let stream = this.streams.get(deviceId);
    if (!stream) {
      stream = new LogcatStream(deviceId);
      this.streams.set(deviceId, stream);
    }
    return stream;
  }

  /**
   * Stop and remove a stream
   */
  removeStream(deviceId: string): void {
    const stream = this.streams.get(deviceId);
    if (stream) {
      stream.stop();
      this.streams.delete(deviceId);
    }
  }

  /**
   * Stop all streams
   */
  stopAll(): void {
    for (const stream of this.streams.values()) {
      stream.stop();
    }
    this.streams.clear();
  }

  /**
   * Get all active streams
   */
  getActiveStreams(): LogcatStream[] {
    return Array.from(this.streams.values()).filter(s => s.state === 'running');
  }
}

// Global logcat manager instance
export const logcatManager = new LogcatManager();
