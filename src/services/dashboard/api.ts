// ============================================================================
// Dashboard API - 仪表盘 API 端点
// ============================================================================

import { getTotalCostUSD, getTotalInputTokens, getTotalOutputTokens, getTotalCacheReadInputTokens, getTotalCacheCreationInputTokens, getTotalDuration, getTotalLinesAdded, getTotalLinesRemoved, getTotalWebSearchRequests, getModelUsage, getSessionId } from '../../bootstrap/state.js'
import { getCostDatabase } from '../../utils/cost-database.js'
import type { UsageStats, ModelUsage, DailyUsage, SessionInfo, DashboardData } from './types.js'

// ============================================================================
// Usage Stats
// ============================================================================

export function getUsageStats(): UsageStats {
  return {
    totalRequests: 0, // TODO: Track request count
    totalTokens: {
      input: getTotalInputTokens(),
      output: getTotalOutputTokens(),
      cacheRead: getTotalCacheReadInputTokens(),
      cacheCreation: getTotalCacheCreationInputTokens(),
    },
    totalCostUSD: getTotalCostUSD(),
    totalDuration: getTotalDuration(),
    totalLinesAdded: getTotalLinesAdded(),
    totalLinesRemoved: getTotalLinesRemoved(),
    totalWebSearchRequests: getTotalWebSearchRequests(),
  }
}

// ============================================================================
// Model Usage
// ============================================================================

export function getModelUsageStats(): ModelUsage[] {
  const modelUsageMap = getModelUsage()
  const result: ModelUsage[] = []

  for (const [model, usage] of Object.entries(modelUsageMap)) {
    result.push({
      model,
      requests: 0, // TODO: Track per-model request count
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadInputTokens,
      cacheCreationTokens: usage.cacheCreationInputTokens,
      costUSD: usage.costUSD,
      duration: 0, // TODO: Track per-model duration
    })
  }

  return result
}

// ============================================================================
// Daily Usage
// ============================================================================

export function getDailyUsage(): DailyUsage[] {
  const costDb = getCostDatabase()
  // Aggregate usage by day from cost database
  const dailyMap = new Map<string, DailyUsage>()

  // Get all records from cost database
  const records = costDb?.getRecentEntries?.(1000) ?? []

  for (const record of records) {
    const date = new Date(record.timestamp).toISOString().split('T')[0]
    const existing = dailyMap.get(date)
    if (existing) {
      existing.requests++
      existing.tokens += record.inputTokens + record.outputTokens
      existing.costUSD += record.costUSD
    } else {
      dailyMap.set(date, {
        date,
        requests: 1,
        tokens: record.inputTokens + record.outputTokens,
        costUSD: record.costUSD,
      })
    }
  }

  return Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date))
}

// ============================================================================
// Session Info
// ============================================================================

export function getSessionInfo(): SessionInfo[] {
  const costDb = getCostDatabase()
  const sessionId = getSessionId()
  const stats = getUsageStats()

  // Current session
  const sessions: SessionInfo[] = [{
    id: sessionId,
    title: 'Current Session',
    model: 'default',
    startedAt: Date.now() - stats.totalDuration,
    duration: stats.totalDuration,
    costUSD: stats.totalCostUSD,
    tokenCount: stats.totalTokens.input + stats.totalTokens.output,
  }]

  return sessions
}

// ============================================================================
// Dashboard Data
// ============================================================================

export function getDashboardData(): DashboardData {
  return {
    stats: getUsageStats(),
    modelUsage: getModelUsageStats(),
    dailyUsage: getDailyUsage(),
    sessions: getSessionInfo(),
    generatedAt: Date.now(),
  }
}
