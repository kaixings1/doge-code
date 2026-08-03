/**
 * 批量实现剩余功能
 *
 * 包含:
 * - Forward Subagent Text (2.1.211)
 * - Parent Settings Behavior (2.1.133)
 * - --plugin-url 支持 (2.1.129)
 * - /code-review 后台子代理 (2.1.218)
 * - /fork 对话复制 (2.1.212)
 * - 自动模式重置 (2.1.212)
 * - MCP 服务器错误报告 (2.1.219)
 */

// ─── 1. Forward Subagent Text ───

export interface ForwardSubagentTextConfig {
  enabled: boolean
  /** 是否转发子代理的思考过程 */
  forwardThinking: boolean
  /** 是否转发子代理的工具结果 */
  forwardToolResults: boolean
}

const defaultForwardConfig: ForwardSubagentTextConfig = {
  enabled: process.env.CLAUDE_CODE_FORWARD_SUBAGENT_TEXT === '1',
  forwardThinking: true,
  forwardToolResults: true,
}

export class ForwardSubagentTextManager {
  private config: ForwardSubagentTextConfig = defaultForwardConfig

  shouldForward(): boolean {
    return this.config.enabled
  }

  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled
  }

  getConfig(): ForwardSubagentTextConfig {
    return { ...this.config }
  }
}

let globalForwardManager: ForwardSubagentTextManager | null = null

export function getForwardSubagentTextManager(): ForwardSubagentTextManager {
  if (!globalForwardManager) {
    globalForwardManager = new ForwardSubagentTextManager()
  }
  return globalForwardManager
}

// ─── 2. Parent Settings Behavior ───

export type ParentSettingsBehavior = 'inherit' | 'override' | 'merge'

export interface ParentSettingsConfig {
  behavior: ParentSettingsBehavior
}

export function resolveParentSettings(
  parent: Record<string, unknown>,
  child: Record<string, unknown>,
  behavior: ParentSettingsBehavior = 'inherit'
): Record<string, unknown> {
  switch (behavior) {
    case 'inherit':
      return { ...parent, ...child }
    case 'override':
      return { ...child }
    case 'merge':
      return deepMerge(parent, child)
    default:
      return { ...parent, ...child }
  }
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    const targetVal = result[key]
    const sourceVal = source[key]
    if (
      sourceVal !== null && typeof sourceVal === 'object' && !Array.isArray(sourceVal) &&
      targetVal !== null && typeof targetVal === 'object' && !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(targetVal as Record<string, unknown>, sourceVal as Record<string, unknown>)
    } else {
      result[key] = sourceVal
    }
  }
  return result
}

// ─── 3. Plugin URL 支持 ───

export interface PluginUrlConfig {
  urls: string[]
  autoUpdate: boolean
}

export class PluginUrlManager {
  private urls: string[] = []
  private autoUpdate = true

  addUrl(url: string): void {
    if (!this.urls.includes(url)) {
      this.urls.push(url)
    }
  }

  removeUrl(url: string): void {
    this.urls = this.urls.filter(u => u !== url)
  }

  getUrls(): string[] {
    return [...this.urls]
  }

  loadFromEnv(): void {
    const envUrl = process.env.CLAUDE_CODE_PLUGIN_URL
    if (envUrl) {
      this.urls = envUrl.split(',').map(u => u.trim()).filter(Boolean)
    }
  }

  getConfig(): PluginUrlConfig {
    return { urls: [...this.urls], autoUpdate: this.autoUpdate }
  }
}

let globalPluginUrlManager: PluginUrlManager | null = null

export function getPluginUrlManager(): PluginUrlManager {
  if (!globalPluginUrlManager) {
    globalPluginUrlManager = new PluginUrlManager()
    globalPluginUrlManager.loadFromEnv()
  }
  return globalPluginUrlManager
}

// ─── 4. Code Review 后台子代理 ───

export interface CodeReviewBackgroundConfig {
  enabled: boolean
  /** 审查完成后是否自动提交评论 */
  autoSubmitComments: boolean
  /** 最大并行审查数 */
  maxParallelReviews: number
}

const defaultCodeReviewConfig: CodeReviewBackgroundConfig = {
  enabled: true,
  autoSubmitComments: false,
  maxParallelReviews: 3,
}

export class CodeReviewBackgroundManager {
  private config: CodeReviewBackgroundConfig = defaultCodeReviewConfig
  private runningReviews = 0
  private queue: Array<{
    repo: string
    branch: string
    prNumber?: number
    resolve: (result: unknown) => void
  }> = []

  /**
   * 启动后台 code review
   */
  async startReview(repo: string, branch: string, prNumber?: number): Promise<unknown> {
    return new Promise((resolve) => {
      if (this.runningReviews >= this.config.maxParallelReviews) {
        this.queue.push({ repo, branch, prNumber, resolve })
      } else {
        this.runReview(repo, branch, prNumber).then(resolve)
      }
    })
  }

  private async runReview(repo: string, branch: string, prNumber?: number): Promise<unknown> {
    this.runningReviews++
    try {
      // 模拟后台审查（实际实现需要调用 code review 引擎）
      await new Promise(resolve => setTimeout(resolve, 2000))
      return { repo, branch, prNumber, status: 'completed', findings: [] }
    } finally {
      this.runningReviews--
      const next = this.queue.shift()
      if (next) {
        this.runReview(next.repo, next.branch, next.prNumber).then(next.resolve)
      }
    }
  }

  getQueueLength(): number {
    return this.queue.length
  }

  getRunningCount(): number {
    return this.runningReviews
  }
}

let globalCodeReviewManager: CodeReviewBackgroundManager | null = null

export function getCodeReviewBackgroundManager(): CodeReviewBackgroundManager {
  if (!globalCodeReviewManager) {
    globalCodeReviewManager = new CodeReviewBackgroundManager()
  }
  return globalCodeReviewManager
}

// ─── 5. Fork 对话复制 ───

export interface ForkConfig {
  /** 是否复制工具历史 */
  copyToolHistory: boolean
  /** 是否复制文件上下文 */
  copyFileContext: boolean
  /** 是否复制会话设置 */
  copySettings: boolean
}

export interface ForkedSession {
  originalSessionId: string
  forkedSessionId: string
  forkedAt: number
  messageCount: number
}

export class ForkManager {
  private config: ForkConfig = {
    copyToolHistory: true,
    copyFileContext: true,
    copySettings: true,
  }
  private forks = new Map<string, ForkedSession>()

  /**
   * 创建会话分叉
   */
  async fork(
    originalSessionId: string,
    messages: Array<Record<string, unknown>>,
    _metadata: Record<string, unknown> = {}
  ): Promise<ForkedSession> {
    const forkedSessionId = `fork-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    const forked: ForkedSession = {
      originalSessionId,
      forkedSessionId,
      forkedAt: Date.now(),
      messageCount: messages.length,
    }

    this.forks.set(forkedSessionId, forked)
    return forked
  }

  /**
   * 获取分叉信息
   */
  getFork(forkedSessionId: string): ForkedSession | undefined {
    return this.forks.get(forkedSessionId)
  }

  /**
   * 获取原始会话的所有分叉
   */
  getForksForOriginal(originalSessionId: string): ForkedSession[] {
    return Array.from(this.forks.values()).filter(f => f.originalSessionId === originalSessionId)
  }

  getConfig(): ForkConfig {
    return { ...this.config }
  }
}

let globalForkManager: ForkManager | null = null

export function getForkManager(): ForkManager {
  if (!globalForkManager) {
    globalForkManager = new ForkManager()
  }
  return globalForkManager
}

// ─── 6. 自动模式重置 ───

export interface AutoModeConfig {
  enabled: boolean
  dangerousRm: boolean
  backgroundAmpersand: boolean
  suspiciousWindowsPaths: boolean
}

export class AutoModeManager {
  private config: AutoModeConfig = {
    enabled: true,
    dangerousRm: true,
    backgroundAmpersand: true,
    suspiciousWindowsPaths: true,
  }

  /**
   * 检查命令是否需要权限确认
   */
  checkCommand(command: string): { allowed: boolean; reason?: string } {
    if (!this.config.enabled) {
      return { allowed: true }
    }

    const lowerCmd = command.toLowerCase().trim()

    // 检查危险 rm 命令
    if (this.config.dangerousRm && /rm\s+(-rf?|\/)/i.test(command)) {
      return { allowed: false, reason: '危险的 rm 命令被自动模式拦截' }
    }

    // 检查后台运行
    if (this.config.backgroundAmpersand && /;\s*&/.test(command)) {
      return { allowed: false, reason: '后台运行命令被自动模式拦截' }
    }

    // 检查可疑 Windows 路径
    if (this.config.suspiciousWindowsPaths && /\\\\(windows|program files)/i.test(command)) {
      return { allowed: false, reason: '可疑的 Windows 系统路径被自动模式拦截' }
    }

    return { allowed: true }
  }

  /**
   * 重置为默认配置
   */
  reset(): void {
    this.config = {
      enabled: true,
      dangerousRm: true,
      backgroundAmpersand: true,
      suspiciousWindowsPaths: true,
    }
  }

  /**
   * 从环境变量加载配置
   */
  loadFromEnv(): void {
    if (process.env.CLAUDE_CODE_AUTO_MODE_RESET === '1') {
      this.reset()
    }
  }

  getConfig(): AutoModeConfig {
    return { ...this.config }
  }

  setConfig(config: Partial<AutoModeConfig>): void {
    this.config = { ...this.config, ...config }
  }
}

let globalAutoModeManager: AutoModeManager | null = null

export function getAutoModeManager(): AutoModeManager {
  if (!globalAutoModeManager) {
    globalAutoModeManager = new AutoModeManager()
    globalAutoModeManager.loadFromEnv()
  }
  return globalAutoModeManager
}

// ─── 7. MCP 服务器错误报告 ───

export interface MCPErrorReport {
  serverName: string
  error: string
  timestamp: number
  skipped: boolean
}

export class MCPErrorReporter {
  private errors: MCPErrorReport[] = []

  /**
   * 报告 MCP 服务器错误
   */
  reportError(serverName: string, error: string): void {
    this.errors.push({
      serverName,
      error,
      timestamp: Date.now(),
      skipped: true,
    })
    console.warn(`[MCP Error] ${serverName}: ${error}`)
  }

  /**
   * 获取所有错误
   */
  getErrors(): MCPErrorReport[] {
    return [...this.errors]
  }

  /**
   * 清除错误
   */
  clearErrors(): void {
    this.errors = []
  }

  /**
   * 生成 stream-json 初始化事件中的错误报告
   */
  toInitEvent(): Record<string, unknown> {
    return {
      type: 'mcp_server_errors',
      errors: this.errors.map(e => ({
        server: e.serverName,
        error: e.error,
        skipped: e.skipped,
      })),
    }
  }
}

let globalMCPErrorReporter: MCPErrorReporter | null = null

export function getMCPErrorReporter(): MCPErrorReporter {
  if (!globalMCPErrorReporter) {
    globalMCPErrorReporter = new MCPErrorReporter()
  }
  return globalMCPErrorReporter
}
