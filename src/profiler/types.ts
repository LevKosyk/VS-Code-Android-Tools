export interface CpuSnapshot {
  timestamp: number;
  totalCpu: number;
  processCpu: number;
  threads: number;
}
export interface MemorySnapshot {
  timestamp: number;
  javaHeap: {
    used: number;
    max: number;
  };
  nativeHeap: {
    used: number;
    max: number;
  };
  totalPss: number;
}
export interface GraphicsStats {
  timestamp: number;
  totalFrames: number;
  jankyFrames: number;
  percentile90: number;
  percentile95: number;
  percentile99: number;
}
export interface StartupStats {
  timestamp: number;
  type: 'cold' | 'warm' | 'hot';
  totalTime: number;
  waitTime: number;
}
export interface ProfilerResult<T> {
  success: boolean;
  message: string;
  data?: T;
}
