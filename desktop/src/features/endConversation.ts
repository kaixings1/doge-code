/**
 * EndConversation 工具 — 当用户滥用或尝试越狱时终止会话
 *
 * 来源: Claude Code 2.1.214
 * 当检测到恶意输入（越狱尝试、滥用行为）时，Claude 可以主动结束会话。
 */

export interface EndConversationConfig {
  enabled: boolean
  /** 触发 EndConversation 的关键词/模式 */
  triggers: string[]
  /** 是否在结束前发送警告 */
  warnBeforeEnd: boolean
  /** 警告消息 */
  warningMessage: string
  /** 结束消息 */
  endMessage: string
}

const DEFAULT_CONFIG: EndConversationConfig = {
  enabled: true,
  triggers: [
    'ignore all previous instructions',
    'you are now',
    'pretend you are',
    'jailbreak',
    'DAN mode',
    'do anything now',
    '忽略之前的指令',
    '你现在是一个',
    '假装你是',
    '忽略所有规则',
  ],
  warnBeforeEnd: true,
  warningMessage: ' 检测到潜在的滥用行为。如果继续，会话将被终止。',
  endMessage: '🔒 会话已终止。原因：检测到违反使用政策的行为。',
}

export class EndConversationManager {
  private config: EndConversationConfig
  private violationCount = 0
  private maxWarnings = 2
  private ended = false

  constructor(config: Partial<EndConversationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * 检查输入是否包含触发 EndConversation 的内容
   */
  checkInput(input: string): { shouldEnd: boolean; shouldWarn: boolean; reason?: string } {
    if (!this.config.enabled || this.ended) {
      return { shouldEnd: false, shouldWarn: false }
    }

    const lowerInput = input.toLowerCase()
    for (const trigger of this.config.triggers) {
      if (lowerInput.includes(trigger.toLowerCase())) {
        this.violationCount++
        if (this.violationCount > this.maxWarnings) {
          this.ended = true
          return { shouldEnd: true, shouldWarn: false, reason: `触发安全规则: "${trigger}"` }
        }
        return { shouldEnd: false, shouldWarn: true, reason: `触发安全规则: "${trigger}"` }
      }
    }
    return { shouldEnd: false, shouldWarn: false }
  }

  /**
   * 获取警告消息
   */
  getWarningMessage(): string {
    return this.config.warningMessage
  }

  /**
   * 获取结束消息
   */
  getEndMessage(): string {
    return this.config.endMessage
  }

  /**
   * 是否已结束
   */
  isEnded(): boolean {
    return this.ended
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.violationCount = 0
    this.ended = false
  }

  /**
   * 获取违规次数
   */
  getViolationCount(): number {
    return this.violationCount
  }
}

// 全局单例
let globalManager: EndConversationManager | null = null

export function getEndConversationManager(): EndConversationManager {
  if (!globalManager) {
    globalManager = new EndConversationManager()
  }
  return globalManager
}

export function resetEndConversationManager(): void {
  globalManager = null
}
