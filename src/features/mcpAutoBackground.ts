/**
 * MCP 自动后台化 — MCP 工具调用超过 2 分钟自动移到后台
 *
 * 来源: Claude Code 2.1.212
 * 环境变量: CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS
 */

const DEFAULT_TIMEOUT_MS = 120000 // 2 minutes

export interface MCPAutoBackgroundConfig {
  enabled: boolean
  timeoutMs: number
}

export class MCPAutoBackgroundManager {
  private config: MCPAutoBackgroundConfig
  private activeCalls = new Map<string, {
    startTime: number
    toolName: string
    sessionId: string
    timer: ReturnType<typeof setTimeout>
  }>()

  constructor(config: Partial<MCPAutoBackgroundConfig> = {}) {
    this.config = {
      enabled: true,
      timeoutMs: parseInt(process.env.CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS || String(DEFAULT_TIMEOUT_MS), 10),
      ...config,
    }
  }

  /**
   * 开始跟踪一个 MCP 工具调用
   */
  trackCall(callId: string, toolName: string, sessionId: string): void {
    if (!this.config.enabled) return

    const timer = setTimeout(() => {
      this.backgroundCall(callId)
    }, this.config.timeoutMs)

    this.activeCalls.set(callId, {
      startTime: Date.now(),
      toolName,
      sessionId,
      timer,
    })
  }

  /**
   * 完成一个 MCP 工具调用
   */
  completeCall(callId: string): void {
    const call = this.activeCalls.get(callId)
    if (call) {
      clearTimeout(call.timer)
      this.activeCalls.delete(callId)
    }
  }

  /**
   * 将调用移到后台
   */
  private backgroundCall(callId: string): void {
    const call = this.activeCalls.get(callId)
    if (!call) return

    console.log(`[MCP Background] Tool "${call.toolName}" moved to background after ${this.config.timeoutMs}ms`)
    this.activeCalls.delete(callId)
  }

  /**
   * 获取活跃调用数
   */
  getActiveCallCount(): number {
    return this.activeCalls.size
  }

  getConfig(): MCPAutoBackgroundConfig {
    return { ...this.config }
  }
}

// 全局单例
let globalManager: MCPAutoBackgroundManager | null = null

export function getMCPAutoBackgroundManager(): MCPAutoBackgroundManager {
  if (!globalManager) {
    globalManager = new MCPAutoBackgroundManager()
  }
  return globalManager
}
