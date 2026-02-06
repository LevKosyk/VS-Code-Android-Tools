/**
 * Android Debug Types
 * Type definitions for debug adapter and JDWP communication
 */

/**
 * Debug session state
 */
export type DebugState = 'disconnected' | 'connecting' | 'attached' | 'running' | 'paused' | 'error';

/**
 * Debuggable process info from adb
 */
export interface DebuggableProcess {
  /** Process ID */
  pid: number;
  /** Package name */
  packageName: string;
  /** Process name (may differ from package) */
  processName: string;
  /** JDWP port if available */
  jdwpPort?: number;
}

/**
 * Breakpoint definition
 */
export interface Breakpoint {
  /** Unique ID */
  id: number;
  /** Source file path */
  file: string;
  /** Line number (1-indexed) */
  line: number;
  /** Whether breakpoint is verified by debugger */
  verified: boolean;
  /** Optional condition expression */
  condition?: string;
  /** Class name for JDWP (resolved at runtime) */
  className?: string;
}

/**
 * Stack frame from debugger
 */
export interface StackFrame {
  /** Frame ID */
  id: number;
  /** Method name */
  name: string;
  /** Source file */
  file?: string;
  /** Line number */
  line?: number;
  /** Class name */
  className: string;
  /** Method signature */
  signature?: string;
}

/**
 * Variable info from debugger
 */
export interface Variable {
  /** Variable name */
  name: string;
  /** Display value */
  value: string;
  /** Variable type */
  type: string;
  /** Reference ID for complex objects */
  variablesReference: number;
  /** Memory address (optional) */
  memoryReference?: string;
}

/**
 * Thread info
 */
export interface ThreadInfo {
  /** Thread ID */
  id: number;
  /** Thread name */
  name: string;
  /** Thread status */
  status: 'running' | 'sleeping' | 'waiting' | 'suspended' | 'zombie';
}

/**
 * Debug session configuration
 */
export interface DebugConfig {
  /** Target device ID */
  deviceId: string;
  /** Package name to debug */
  packageName: string;
  /** JDWP port */
  port: number;
  /** Source paths for mapping */
  sourcePaths: string[];
}

/**
 * Debug event types
 */
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

/**
 * Debug event
 */
export interface DebugEvent {
  type: DebugEventType;
  body?: unknown;
}

/**
 * Stop reasons
 */
export type StopReason = 'breakpoint' | 'step' | 'exception' | 'pause' | 'entry';
