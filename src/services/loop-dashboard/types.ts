// ============================================================================
// Loop Dashboard Types
// ============================================================================

export interface LoopMetricsData {
  totalLoops: number
  successCount: number
  failureCount: number
  successRate: number
  avgDurationMs: number
  totalTokens: number
  totalCost: number
  patterns: Record<string, number>
}

export interface ActiveLoop {
  loopId: string
  pattern: string
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'dead-letter'
  currentIteration: number
  maxIterations: number
  startTime: string
  durationMs: number
  tokensUsed: number
  successCount: number
  failureCount: number
}

export interface DeadLetterEntry {
  taskId: string
  loopId: string
  pattern: string
  error: string
  retries: number
  createdAt: string
  status: 'pending' | 'reviewed' | 'retried' | 'discarded'
}

export interface LoopDashboardData {
  generatedAt: string
  activeLoops: ActiveLoop[]
  recentLoops: LoopHistoryEntry[]
  deadLetterQueue: DeadLetterEntry[]
  metrics: LoopMetricsData
  systemHealth: SystemHealth
}

export interface LoopHistoryEntry {
  loopId: string
  pattern: string
  status: string
  startTime: string
  endTime: string
  durationMs: number
  tokensUsed: number
  successCount: number
  failureCount: number
}

export interface SystemHealth {
  cpu: number
  memory: number
  diskFreeGB: number
  checkpointCount: number
  deadLetterCount: number
  lockStatus: 'ok' | 'locked' | 'unknown'
}
