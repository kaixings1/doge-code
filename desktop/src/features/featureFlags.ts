/**
 * Feature Flags & Settings — 更新日志中新增的配置项
 *
 * 来源: Claude Code 2.1.128 → 2.1.220
 * 集中管理所有新设置的默认值和验证逻辑
 */

// ─── 设置接口 ───

export interface NewFeatureSettings {
  // 2.1.214 — 文件系统沙箱禁用
  /** 跳过文件系统隔离，保留网络出口控制 */
  sandboxFilesystemDisabled: boolean

  // 2.1.217 — Emoji 自动补全
  /** 启用 emoji 短代码自动补全 (:heart: → ) */
  emojiCompletionEnabled: boolean

  // 2.1.219 — 工作流大小指南
  /** 动态工作流大小限制 */
  workflowSizeGuideline: number

  // 2.1.219 — 网络沙箱严格白名单
  /** 网络沙箱严格白名单（仅允许指定主机） */
  sandboxNetworkStrictAllowlist: string[]

  // 2.1.217 — 并发子代理上限
  /** 最大并发子代理数量 */
  maxConcurrentSubAgents: number

  // 2.1.217 — 子代理嵌套深度
  /** 子代理嵌套最大深度 */
  maxSubAgentSpawnDepth: number

  // 2.1.212 — 每会话 WebSearch 限制
  /** 每会话最大 WebSearch 调用次数 */
  maxWebSearchesPerSession: number

  // 2.1.212 — MCP 自动后台化
  /** MCP 工具调用超时自动后台化时间（毫秒） */
  mcpAutoBackgroundMs: number

  // 2.1.219 — 子代理文本转发
  /** 转发子代理文本到 stream-json */
  forwardSubagentText: boolean

  // 2.1.133 — worktree 基础引用
  /** worktree 基础引用模式 */
  worktreeBaseRef: 'fresh' | 'head'

  // 2.1.133 — 沙箱路径（仅 Linux/WSL）
  /** bubblewrap 路径 */
  sandboxBwrapPath: string
  /** socat 路径（仅 Linux/WSL） */
  sandboxSocPath: string

  // 2.1.133 — 父设置行为
  /** 管理层级密钥继承行为 */
  parentSettingsBehavior: 'inherit' | 'override' | 'merge'

  // 2.1.219 — OTEL 内容最大长度
  /** OpenTelemetry 内容属性最大长度 */
  otelContentMaxLength: number

  // 2.1.217 — FORCE_HYPERLINK
  /** 强制终端超链接 */
  forceHyperlink: boolean

  // 2.1.210 — 折叠工具摘要行实时计时
  /** 显示实时经过时间 */
  liveElapsedTime: boolean
}

// ─── 默认值 ───

export const DEFAULT_SETTINGS: NewFeatureSettings = {
  sandboxFilesystemDisabled: false,
  emojiCompletionEnabled: true,
  workflowSizeGuideline: 15,
  sandboxNetworkStrictAllowlist: [],
  maxConcurrentSubAgents: 20,
  maxSubAgentSpawnDepth: 3,
  maxWebSearchesPerSession: 200,
  mcpAutoBackgroundMs: 120000,
  forwardSubagentText: false,
  worktreeBaseRef: 'fresh',
  sandboxBwrapPath: '',
  sandboxSocPath: '',
  parentSettingsBehavior: 'inherit',
  otelContentMaxLength: 60000,
  forceHyperlink: true,
  liveElapsedTime: true,
}

// ─── 设置验证 ───

export function validateSettings(settings: Partial<NewFeatureSettings>): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (settings.workflowSizeGuideline !== undefined) {
    if (settings.workflowSizeGuideline < 1 || settings.workflowSizeGuideline > 100) {
      errors.push('workflowSizeGuideline 必须在 1-100 之间')
    }
  }

  if (settings.maxConcurrentSubAgents !== undefined) {
    if (settings.maxConcurrentSubAgents < 1 || settings.maxConcurrentSubAgents > 100) {
      errors.push('maxConcurrentSubAgents 必须在 1-100 之间')
    }
  }

  if (settings.maxSubAgentSpawnDepth !== undefined) {
    if (settings.maxSubAgentSpawnDepth < 0 || settings.maxSubAgentSpawnDepth > 10) {
      errors.push('maxSubAgentSpawnDepth 必须在 0-10 之间')
    }
  }

  if (settings.maxWebSearchesPerSession !== undefined) {
    if (settings.maxWebSearchesPerSession < 1 || settings.maxWebSearchesPerSession > 10000) {
      errors.push('maxWebSearchesPerSession 必须在 1-10000 之间')
    }
  }

  if (settings.mcpAutoBackgroundMs !== undefined) {
    if (settings.mcpAutoBackgroundMs < 1000 || settings.mcpAutoBackgroundMs > 600000) {
      errors.push('mcpAutoBackgroundMs 必须在 1000-600000 之间')
    }
  }

  return { valid: errors.length === 0, errors }
}

// ─── 环境变量映射 ───

export function getSettingsFromEnv(): Partial<NewFeatureSettings> {
  const settings: Partial<NewFeatureSettings> = {}

  if (process.env.CLAUDE_CODE_SANDBOX_FILESYSTEM_DISABLED) {
    settings.sandboxFilesystemDisabled = process.env.CLAUDE_CODE_SANDBOX_FILESYSTEM_DISABLED === '1'
  }

  if (process.env.EMOJI_COMPLETION_ENABLED) {
    settings.emojiCompletionEnabled = process.env.EMOJI_COMPLETION_ENABLED !== '0'
  }

  if (process.env.CLAUDE_CODE_WORKFLOW_SIZE) {
    settings.workflowSizeGuideline = parseInt(process.env.CLAUDE_CODE_WORKFLOW_SIZE, 10)
  }

  if (process.env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS) {
    settings.maxConcurrentSubAgents = parseInt(process.env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS, 10)
  }

  if (process.env.CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH) {
    settings.maxSubAgentSpawnDepth = parseInt(process.env.CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH, 10)
  }

  if (process.env.CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION) {
    settings.maxWebSearchesPerSession = parseInt(process.env.CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION, 10)
  }

  if (process.env.CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS) {
    settings.mcpAutoBackgroundMs = parseInt(process.env.CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS, 10)
  }

  if (process.env.CLAUDE_CODE_FORWARD_SUBAGENT_TEXT) {
    settings.forwardSubagentText = process.env.CLAUDE_CODE_FORWARD_SUBAGENT_TEXT === '1'
  }

  if (process.env.CLAUDE_CODE_OTEL_CONTENT_MAX_LENGTH) {
    settings.otelContentMaxLength = parseInt(process.env.CLAUDE_CODE_OTEL_CONTENT_MAX_LENGTH, 10)
  }

  if (process.env.FORCE_HYPERLINK) {
    settings.forceHyperlink = process.env.FORCE_HYPERLINK !== '0'
  }

  return settings
}

// ─── 子代理管理器 ───

export class SubAgentManager {
  private activeCount = 0
  private maxConcurrent: number
  private maxDepth: number
  private searchCount = 0
  private maxSearches: number
  private waitingQueue: Array<() => void> = []

  constructor(maxConcurrent = 20, maxDepth = 3, maxSearches = 200) {
    this.maxConcurrent = maxConcurrent
    this.maxDepth = maxDepth
    this.maxSearches = maxSearches
  }

  /** 检查是否可以启动新子代理 */
  canSpawn(depth = 0): boolean {
    if (depth >= this.maxDepth) return false
    return this.activeCount < this.maxConcurrent
  }

  /** 启动子代理 */
  async spawn<T>(fn: () => Promise<T>): Promise<T> {
    if (this.activeCount >= this.maxConcurrent) {
      await new Promise<void>(resolve => this.waitingQueue.push(resolve))
    }
    this.activeCount++
    try {
      return await fn()
    } finally {
      this.activeCount--
      const next = this.waitingQueue.shift()
      next?.()
    }
  }

  /** 检查是否可以进行 WebSearch */
  canSearch(): boolean {
    return this.searchCount < this.maxSearches
  }

  /** 记录一次搜索 */
  recordSearch(): void {
    this.searchCount++
  }

  getStats() {
    return {
      activeSubAgents: this.activeCount,
      maxConcurrent: this.maxConcurrent,
      waitingQueue: this.waitingQueue.length,
      searchesUsed: this.searchCount,
      maxSearches: this.maxSearches,
    }
  }
}

// ─── 全局实例 ───

let globalSubAgentManager: SubAgentManager | null = null

export function getSubAgentManager(): SubAgentManager {
  if (!globalSubAgentManager) {
    // 读取环境变量配置（更新日志 2.1.217）
    const maxConcurrent = parseInt(process.env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS || '20', 10)
    const maxDepth = parseInt(process.env.CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH || '3', 10)
    const maxSearches = parseInt(process.env.CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION || '200', 10)
    globalSubAgentManager = new SubAgentManager(maxConcurrent, maxDepth, maxSearches)
  }
  return globalSubAgentManager
}
