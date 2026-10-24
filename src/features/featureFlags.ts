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
  /** 启用 emoji 短代码自动补全 (:heart: → ❤️) */
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

/**
 * 解析正整数环境变量，非法值（未设置 / NaN / 小于 1）回落到默认值。
 * 用于计数上限类配置：NaN 会让比较恒为 false 而令上限失效。
 */
function parsePositiveInt(raw: string | null, fallback: number): number {
  const parsed = parseInt(raw ?? '', 10)
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : fallback
}

export class SubAgentManager {
  private activeCount = 0
  /** 本会话累计启动过的子代理数（只增不减，用于会话级上限） */
  private totalSpawned = 0
  private maxConcurrent: number
  private maxDepth: number
  private searchCount = 0
  private maxSearches: number
  private maxTotalSpawns: number
  private waitingQueue: Array<() => void> = []

  constructor(
    maxConcurrent = 20,
    maxDepth = 3,
    maxSearches = 200,
    maxTotalSpawns = 200,
  ) {
    this.maxConcurrent = maxConcurrent
    this.maxDepth = maxDepth
    this.maxSearches = maxSearches
    this.maxTotalSpawns = maxTotalSpawns
  }

  /**
   * 检查是否可以启动新子代理。
   *
   * 三个独立维度：
   * - depth：嵌套深度（超过 maxDepth 拒绝）
   * - maxConcurrent：同时运行数（更新日志 2.1.217）
   * - maxTotalSpawns：本会话累计启动数（对齐官方 CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION，2.1.212）
   *
   * 累计上限与并发上限是不同维度：并发 20、累计 200 允许 20 个并行跑 10 轮，
   * 但总量封顶，防止单个会话无限委派。只做预检，不占用名额——
   * 真正的累计递增发生在 spawn() 拿到名额之后，避免预检失败也被计数。
   */
  canSpawn(depth = 0): boolean {
    if (depth >= this.maxDepth) return false
    if (this.totalSpawned >= this.maxTotalSpawns) return false
    return this.activeCount < this.maxConcurrent
  }

  /** 启动子代理 */
  async spawn<T>(fn: () => Promise<T>): Promise<T> {
    // 必须用循环复查：唤醒者与新的调用者可能在同一个 tick 内竞争名额。
    // 旧实现里等待者被唤醒后直接 activeCount++，若此刻刚有新任务拿到名额，
    // 就会瞬时超过 maxConcurrent。循环保证「拿到名额」与「计数递增」原子化
    // （单线程事件循环下，检查与自增之间没有 await，因此不会被打断）。
    while (this.activeCount >= this.maxConcurrent) {
      await new Promise<void>(resolve => this.waitingQueue.push(resolve))
    }
    this.activeCount++
    // 拿到名额后才计入会话累计：预检失败或排队中被放弃的调用不应消耗配额。
    this.totalSpawned++
    try {
      return await fn()
    } finally {
      this.activeCount--
      // 只唤醒一个等待者；被唤醒者会重新检查计数。
      // 用 try 包裹，避免某个 resolve 抛错导致名额永久泄漏。
      try {
        const next = this.waitingQueue.shift()
        next?.()
      } catch {
        /* 唤醒失败不影响名额释放 */
      }
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
      totalSpawned: this.totalSpawned,
      maxTotalSpawns: this.maxTotalSpawns,
    }
  }
}

// ─── 全局实例 ───

let globalSubAgentManager: SubAgentManager | null = null

export function getSubAgentManager(): SubAgentManager {
  if (!globalSubAgentManager) {
    // 读取环境变量配置（更新日志 2.1.217 / 2.1.212）
    const maxConcurrent = parseInt(process.env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS || '20', 10)
    const maxDepth = parseInt(process.env.CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH || '3', 10)
    const maxSearches = parseInt(process.env.CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION || '200', 10)
    // 会话级累计上限（对齐官方 CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION，默认 200）。
    // 非法值（NaN / 负数 / 0）回落到默认：NaN 会让 `total >= max` 恒为 false，
    // 使上限形同虚设；0 会直接禁掉全部子代理，都不应静默接受。
    const maxTotalSpawns = parsePositiveInt(
      process.env.CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION,
      200,
    )
    globalSubAgentManager = new SubAgentManager(maxConcurrent, maxDepth, maxSearches, maxTotalSpawns)
  }
  return globalSubAgentManager
}
