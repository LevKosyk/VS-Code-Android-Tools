export type DebugState = 'disconnected' | 'connecting' | 'attached' | 'running' | 'paused' | 'error';
export interface DebuggableProcess {
  pid: number;
  packageName: string;
  processName: string;
  jdwpPort?: number;
}
export interface Breakpoint {
  id: number;
  file: string;
  line: number;
  verified: boolean;
  condition?: string;
  className?: string;
}
export interface StackFrame {
  id: number;
  name: string;
  file?: string;
  line?: number;
  className: string;
  signature?: string;
}
export interface Variable {
  name: string;
  value: string;
  type: string;
  variablesReference: number;
  memoryReference?: string;
}
export interface ThreadInfo {
  id: number;
  name: string;
  status: 'running' | 'sleeping' | 'waiting' | 'suspended' | 'zombie';
}
export interface DebugConfig {
  deviceId: string;
  packageName: string;
  port: number;
  sourcePaths: string[];
}
export type DebugEventType = 
  | 'initialized'
  | 'stopped'
  | 'continued'
  | 'exited'
  | 'terminated'
  | 'thread'
  | 'output'
  | 'breakpoint'
  | 'module'
  | 'process';
export interface DebugEvent {
  type: DebugEventType;
  body?: unknown;
}
export type StopReason = 'breakpoint' | 'step' | 'exception' | 'pause' | 'entry';
