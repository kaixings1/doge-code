/**
 * cost-database.ts — SQLite 成本持久化层（bun:sqlite）
 *
 * 功能：
 *   - 持久化每次 API 调用的 token 用量与费用
 *   - 按会话/项目/模型维度聚合统计
 *   - 支持成本趋势查询与历史记录
 *
 * 设计对齐项目既有 CodeVectorStore 的 SQLite 使用模式（bun:sqlite + 内存数据库 + 定期 flush）。
 * 数据库文件存储在项目 .claudeskills/ 目录下，按项目隔离。
 */

import { getProjectPathForConfig } from './config.js'
import type { BetaUsage as Usage } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

// ============================================================================
// Types
// ============================================================================

export interface CostEntry {
  id?: number
  sessionId: string
  projectDir: string
  model: string
  timestamp: number
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
  webSearchRequests: number
  costUSD: number
  provider?: string // 'anthropic' | 'openai' | 'google' | 'groq' | 'xai' | 'deepseek'
}

export interface SessionCostSummary {
  sessionId: string
  totalCostUSD: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheReadTokens: number
  totalCacheWriteTokens: number
  totalWebSearchRequests: number
  requestCount: number
  firstTimestamp: number
  lastTimestamp: number
}

export interface ModelCostBreakdown {
  model: string
  totalCostUSD: number
  totalInputTokens: number
  totalOutputTokens: number
  requestCount: number
  avgCostPerRequest: number
}

export interface ProjectCostSummary {
  projectDir: string
  totalCostUSD: number
  totalSessions: number
  totalRequests: number
  modelBreakdown: ModelCostBreakdown[]
  sessionSummaries: SessionCostSummary[]
}

// ============================================================================
// CostDatabase
// ============================================================================

export class CostDatabase {
  private db: any | null = null
  private dbPath: string
  private initialized = false

  constructor(dbPath?: string) {
    const projectDir = getProjectPathForConfig()
    const dir = dbPath ?? `${projectDir}/.claudeskills`
    this.dbPath = `${dir}/cost-tracker.db`
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  private ensureDb(): void {
    if (this.db) return

    try {
      const { Database } = require('bun:sqlite')
      this.db = new Database(this.dbPath)

      // Main cost entries table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS cost_entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          project_dir TEXT NOT NULL,
          model TEXT NOT NULL,
          timestamp REAL NOT NULL,
          input_tokens INTEGER NOT NULL DEFAULT 0,
          output_tokens INTEGER NOT NULL DEFAULT 0,
          cache_read_input_tokens INTEGER NOT NULL DEFAULT 0,
          cache_creation_input_tokens INTEGER NOT NULL DEFAULT 0,
          web_search_requests INTEGER NOT NULL DEFAULT 0,
          cost_usd REAL NOT NULL DEFAULT 0,
          provider TEXT
        )
      `)

      // Indexes for common queries
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_cost_session ON cost_entries(session_id)
      `)
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_cost_project ON cost_entries(project_dir)
      `)
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_cost_model ON cost_entries(model)
      `)
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_cost_timestamp ON cost_entries(timestamp)
      `)

      this.initialized = true
    } catch {
      // SQLite not available — silently degrade to in-memory mode
      this.db = null
      this.initialized = false
    }
  }

  // ==========================================================================
  // Write Operations
  // ==========================================================================

  /**
   * 记录一次 API 调用的成本条目。
   */
  recordCostEntry(entry: CostEntry): void {
    this.ensureDb()
    if (!this.db) return

    const projectDir = entry.projectDir ?? getProjectPathForConfig()
    this.db.run(
      `INSERT INTO cost_entries
        (session_id, project_dir, model, timestamp, input_tokens, output_tokens,
         cache_read_input_tokens, cache_creation_input_tokens, web_search_requests,
         cost_usd, provider)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.sessionId,
        projectDir,
        entry.model,
        entry.timestamp,
        entry.inputTokens,
        entry.outputTokens,
        entry.cacheReadInputTokens,
        entry.cacheCreationInputTokens,
        entry.webSearchRequests,
        entry.costUSD,
        entry.provider ?? this.detectProvider(entry.model),
      ],
    )
  }

  /**
   * 便捷方法：从 Usage 对象记录成本。
   */
  recordUsage(
    sessionId: string,
    model: string,
    usage: Usage,
    costUSD: number,
    provider?: string,
  ): void {
    this.recordCostEntry({
      sessionId,
      projectDir: getProjectPathForConfig(),
      model,
      timestamp: Date.now(),
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
      cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
      webSearchRequests: usage.server_tool_use?.web_search_requests ?? 0,
      costUSD,
      provider,
    })
  }

  // ==========================================================================
  // Read Operations — Session
  // ==========================================================================

  /**
   * 获取指定会话的成本汇总。
   */
  getSessionCosts(sessionId: string): SessionCostSummary | null {
    this.ensureDb()
    if (!this.db) return null

    const row = this.db.query(
      `SELECT
         session_id,
         SUM(cost_usd) as total_cost,
         SUM(input_tokens) as total_input,
         SUM(output_tokens) as total_output,
         SUM(cache_read_input_tokens) as total_cache_read,
         SUM(cache_creation_input_tokens) as total_cache_write,
         SUM(web_search_requests) as total_web_search,
         COUNT(*) as request_count,
         MIN(timestamp) as first_ts,
         MAX(timestamp) as last_ts
       FROM cost_entries
       WHERE session_id = ?
       GROUP BY session_id`,
    ).get(sessionId) as Record<string, unknown> | undefined

    if (!row) return null

    return {
      sessionId: row.session_id as string,
      totalCostUSD: row.total_cost as number,
      totalInputTokens: row.total_input as number,
      totalOutputTokens: row.total_output as number,
      totalCacheReadTokens: row.total_cache_read as number,
      totalCacheWriteTokens: row.total_cache_write as number,
      totalWebSearchRequests: row.total_web_search as number,
      requestCount: row.request_count as number,
      firstTimestamp: row.first_ts as number,
      lastTimestamp: row.last_ts as number,
    }
  }

  /**
   * 获取会话内所有模型维度的成本明细。
   */
  getSessionModelBreakdown(sessionId: string): ModelCostBreakdown[] {
    this.ensureDb()
    if (!this.db) return []

    const rows = this.db.query(
      `SELECT
         model,
         SUM(cost_usd) as total_cost,
         SUM(input_tokens) as total_input,
         SUM(output_tokens) as total_output,
         COUNT(*) as request_count
       FROM cost_entries
       WHERE session_id = ?
       GROUP BY model
       ORDER BY total_cost DESC`,
    ).all() as Record<string, unknown>[]

    return rows.map(row => ({
      model: row.model as string,
      totalCostUSD: row.total_cost as number,
      totalInputTokens: row.total_input as number,
      totalOutputTokens: row.total_output as number,
      requestCount: row.request_count as number,
      avgCostPerRequest: (row.total_cost as number) / (row.request_count as number),
    }))
  }

  // ==========================================================================
  // Read Operations — Project
  // ==========================================================================

  /**
   * 获取项目维度的成本汇总（跨所有会话）。
   */
  getProjectCosts(projectDir?: string): ProjectCostSummary | null {
    this.ensureDb()
    if (!this.db) return null

    const dir = projectDir ?? getProjectPathForConfig()

    const summaryRow = this.db.query(
      `SELECT
         SUM(cost_usd) as total_cost,
         COUNT(DISTINCT session_id) as total_sessions,
         COUNT(*) as total_requests
       FROM cost_entries
       WHERE project_dir = ?`,
    ).get(dir) as Record<string, unknown> | undefined

    if (!summaryRow) return null

    const modelRows = this.db.query(
      `SELECT
         model,
         SUM(cost_usd) as total_cost,
         SUM(input_tokens) as total_input,
         SUM(output_tokens) as total_output,
         COUNT(*) as request_count
       FROM cost_entries
       WHERE project_dir = ?
       GROUP BY model
       ORDER BY total_cost DESC`,
    ).all() as Record<string, unknown>[]

    const sessionRows = this.db.query(
      `SELECT
         session_id,
         SUM(cost_usd) as total_cost,
         SUM(input_tokens) as total_input,
         SUM(output_tokens) as total_output,
         SUM(cache_read_input_tokens) as total_cache_read,
         SUM(cache_creation_input_tokens) as total_cache_write,
         SUM(web_search_requests) as total_web_search,
         COUNT(*) as request_count,
         MIN(timestamp) as first_ts,
         MAX(timestamp) as last_ts
       FROM cost_entries
       WHERE project_dir = ?
       GROUP BY session_id
       ORDER BY last_ts DESC`,
    ).all() as Record<string, unknown>[]

    return {
      projectDir: dir,
      totalCostUSD: summaryRow.total_cost as number,
      totalSessions: summaryRow.total_sessions as number,
      totalRequests: summaryRow.total_requests as number,
      modelBreakdown: modelRows.map(row => ({
        model: row.model as string,
        totalCostUSD: row.total_cost as number,
        totalInputTokens: row.total_input as number,
        totalOutputTokens: row.total_output as number,
        requestCount: row.request_count as number,
        avgCostPerRequest: (row.total_cost as number) / (row.request_count as number),
      })),
      sessionSummaries: sessionRows.map(row => ({
        sessionId: row.session_id as string,
        totalCostUSD: row.total_cost as number,
        totalInputTokens: row.total_input as number,
        totalOutputTokens: row.total_output as number,
        totalCacheReadTokens: row.total_cache_read as number,
        totalCacheWriteTokens: row.total_cache_write as number,
        totalWebSearchRequests: row.total_web_search as number,
        requestCount: row.request_count as number,
        firstTimestamp: row.first_ts as number,
        lastTimestamp: row.last_ts as number,
      })),
    }
  }

  // ==========================================================================
  // Read Operations — Trends & History
  // ==========================================================================

  /**
   * 获取指定时间范围内的成本趋势（按天聚合）。
   * @param days 回溯天数，默认 30 天
   */
  getCostTrend(days = 30): Array<{ date: string; costUSD: number; requests: number }> {
    this.ensureDb()
    if (!this.db) return []

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
    const rows = this.db.query(
      `SELECT
         DATE(timestamp / 1000, 'unixepoch') as date,
         SUM(cost_usd) as daily_cost,
         COUNT(*) as daily_requests
       FROM cost_entries
       WHERE timestamp >= ?
       GROUP BY DATE(timestamp / 1000, 'unixepoch')
       ORDER BY date ASC`,
    ).all(cutoff) as Record<string, unknown>[]

    return rows.map(row => ({
      date: row.date as string,
      costUSD: row.daily_cost as number,
      requests: row.daily_requests as number,
    }))
  }

  /**
   * 获取最近 N 条成本记录。
   */
  getRecentEntries(limit = 50): CostEntry[] {
    this.ensureDb()
    if (!this.db) return []

    const rows = this.db.query(
      `SELECT
         id, session_id, project_dir, model, timestamp,
         input_tokens, output_tokens, cache_read_input_tokens,
         cache_creation_input_tokens, web_search_requests, cost_usd, provider
       FROM cost_entries
       ORDER BY timestamp DESC
       LIMIT ?`,
    ).all(limit) as Record<string, unknown>[]

    return rows.map(row => ({
      id: row.id as number,
      sessionId: row.session_id as string,
      projectDir: row.project_dir as string,
      model: row.model as string,
      timestamp: row.timestamp as number,
      inputTokens: row.input_tokens as number,
      outputTokens: row.output_tokens as number,
      cacheReadInputTokens: row.cache_read_input_tokens as number,
      cacheCreationInputTokens: row.cache_creation_input_tokens as number,
      webSearchRequests: row.web_search_requests as number,
      costUSD: row.cost_usd as number,
      provider: row.provider as string | undefined,
    }))
  }

  // ==========================================================================
  // Utility
  // ==========================================================================

  /**
   * 清空所有成本记录（用于测试或重置）。
   */
  clearAll(): void {
    this.ensureDb()
    if (!this.db) return
    this.db.exec(`DELETE FROM cost_entries`)
  }

  /**
   * 获取数据库文件路径（用于备份或迁移）。
   */
  getDbPath(): string {
    return this.dbPath
  }

  /**
   * 从模型名称推断 API 提供方。
   */
  private detectProvider(model: string): string {
    const lower = model.toLowerCase()
    if (lower.startsWith('gpt-') || lower.startsWith('o3') || lower.startsWith('o4-') || lower.startsWith('o1-')) {
      return 'openai'
    }
    if (lower.startsWith('gemini-')) {
      return 'google'
    }
    if (lower.includes('llama') || lower.includes('mixtral') || lower.includes('gemma')) {
      return 'groq'
    }
    if (lower.startsWith('grok')) {
      return 'xai'
    }
    if (lower.startsWith('deepseek')) {
      return 'deepseek'
    }
    if (lower.startsWith('claude-')) {
      return 'anthropic'
    }
    return 'unknown'
  }
}

// ============================================================================
// Singleton
// ============================================================================

let instance: CostDatabase | null = null

export function getCostDatabase(): CostDatabase {
  if (!instance) {
    instance = new CostDatabase()
  }
  return instance
}

export function resetCostDatabase(): void {
  instance = null
}
