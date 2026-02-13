export type LogLevel = 'V' | 'D' | 'I' | 'W' | 'E' | 'F' | 'S';
export const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  'V': 0, 
  'D': 1, 
  'I': 2, 
  'W': 3, 
  'E': 4, 
  'F': 5, 
  'S': 6, 
};
export const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  'V': 'Verbose',
  'D': 'Debug',
  'I': 'Info',
  'W': 'Warning',
  'E': 'Error',
  'F': 'Fatal',
  'S': 'Silent',
};
export const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  'V': '#888888',
  'D': '#4FC3F7',
  'I': '#81C784',
  'W': '#FFB74D',
  'E': '#E57373',
  'F': '#F44336',
  'S': '#9E9E9E',
};
export interface LogEntry {
  id: number;
  timestamp: string;
  pid: number;
  tid: number;
  level: LogLevel;
  tag: string;
  message: string;
  raw: string;
}
export interface LogFilter {
  minLevel: LogLevel;
  packageName?: string;
  pid?: number;
  tag?: string;
  search?: string;
}
export type StreamState = 'stopped' | 'starting' | 'running' | 'error';
export interface LogcatSession {
  deviceId: string;
  state: StreamState;
  filter: LogFilter;
  entryCount: number;
  errorMessage?: string;
}
export const DEFAULT_FILTER: LogFilter = {
  minLevel: 'V',
};
export function parseLogLine(line: string, id: number): LogEntry | null {
  const regex = /^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEFS])\s+([^:]+):\s*(.*)$/;
  const match = line.match(regex);
  if (!match) {
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
export function matchesFilter(entry: LogEntry, filter: LogFilter): boolean {
  if (LOG_LEVEL_PRIORITY[entry.level] < LOG_LEVEL_PRIORITY[filter.minLevel]) {
    return false;
  }
  if (typeof filter.pid === 'number' && entry.pid !== filter.pid) {
    return false;
  }
  if (filter.tag && !entry.tag.toLowerCase().includes(filter.tag.toLowerCase())) {
    return false;
  }
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
