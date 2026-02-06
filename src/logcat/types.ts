/**
 * Logcat Types
 * Type definitions for log entries and filtering
 */

/**
 * Log level priorities (matching Android's Log class)
 */
export type LogLevel = 'V' | 'D' | 'I' | 'W' | 'E' | 'F' | 'S';

/**
 * Log level priority order (higher = more severe)
 */
export const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  'V': 0, // Verbose
  'D': 1, // Debug
  'I': 2, // Info
  'W': 3, // Warning
  'E': 4, // Error
  'F': 5, // Fatal
  'S': 6, // Silent
};

/**
 * Log level display names
 */
export const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  'V': 'Verbose',
  'D': 'Debug',
  'I': 'Info',
  'W': 'Warning',
  'E': 'Error',
  'F': 'Fatal',
  'S': 'Silent',
};

/**
 * Log level colors for display
 */
export const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  'V': '#888888',
  'D': '#4FC3F7',
  'I': '#81C784',
  'W': '#FFB74D',
  'E': '#E57373',
  'F': '#F44336',
  'S': '#9E9E9E',
};

/**
 * Parsed log entry from adb logcat
 */
export interface LogEntry {
  /** Unique ID for this entry */
  id: number;
  /** Timestamp from device */
  timestamp: string;
  /** Process ID */
  pid: number;
  /** Thread ID */
  tid: number;
  /** Log level */
  level: LogLevel;
  /** Log tag */
  tag: string;
  /** Log message */
  message: string;
  /** Raw line from logcat */
  raw: string;
}

/**
 * Filter options for logcat
 */
export interface LogFilter {
  /** Minimum log level to show */
  minLevel: LogLevel;
  /** Filter by package name (process) */
  packageName?: string;
  /** Filter by tag */
  tag?: string;
  /** Search text in message */
  search?: string;
}

/**
 * Logcat stream state
 */
export type StreamState = 'stopped' | 'starting' | 'running' | 'error';

/**
 * Logcat session info
 */
export interface LogcatSession {
  deviceId: string;
  state: StreamState;
  filter: LogFilter;
  entryCount: number;
  errorMessage?: string;
}

/**
 * Default filter settings
 */
export const DEFAULT_FILTER: LogFilter = {
  minLevel: 'V',
};

/**
 * Parse a logcat line into a LogEntry
 * Format: "MM-DD HH:MM:SS.mmm  PID  TID LEVEL TAG: MESSAGE"
 */
export function parseLogLine(line: string, id: number): LogEntry | null {
  // Match format: "01-15 12:34:56.789  1234  5678 D TagName: Message here"
  const regex = /^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEFS])\s+([^:]+):\s*(.*)$/;
  const match = line.match(regex);

  if (!match) {
    // Fallback for continuation lines or malformed entries
    return null;
  }

  const [, timestamp, pid, tid, level, tag, message] = match;

  return {
    id,
    timestamp,
    pid: parseInt(pid, 10),
    tid: parseInt(tid, 10),
    level: level as LogLevel,
    tag: tag.trim(),
    message,
    raw: line,
  };
}

/**
 * Check if a log entry matches the filter
 */
export function matchesFilter(entry: LogEntry, filter: LogFilter): boolean {
  // Check minimum log level
  if (LOG_LEVEL_PRIORITY[entry.level] < LOG_LEVEL_PRIORITY[filter.minLevel]) {
    return false;
  }

  // Check tag filter
  if (filter.tag && !entry.tag.toLowerCase().includes(filter.tag.toLowerCase())) {
    return false;
  }

  // Check search text
  if (filter.search) {
    const searchLower = filter.search.toLowerCase();
    const matchesTag = entry.tag.toLowerCase().includes(searchLower);
    const matchesMessage = entry.message.toLowerCase().includes(searchLower);
    if (!matchesTag && !matchesMessage) {
      return false;
    }
  }

  return true;
}
