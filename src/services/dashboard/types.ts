// ============================================================================
// Dashboard Types - 团队/企业仪表盘数据类型
// ============================================================================

export interface UsageStats {
  totalRequests: number
  totalTokens: {
    input: number
    output: number
    cacheRead: number
    cacheCreation: number
  }
  totalCostUSD: number
  totalDuration: number
  totalLinesAdded: number
  totalLinesRemoved: number
  totalWebSearchRequests: number
}

export interface ModelUsage {
  model: string
  requests: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  costUSD: number
  duration: number
}

export interface DailyUsage {
  date: string
  requests: number
  tokens: number
  costUSD: number
}

export interface SessionInfo {
  id: string
  title: string
  model: string
  startedAt: number
  duration: number
  costUSD: number
  tokenCount: number
}

export interface DashboardData {
  stats: UsageStats
  modelUsage: ModelUsage[]
  dailyUsage: DailyUsage[]
  sessions: SessionInfo[]
  generatedAt: number
}
