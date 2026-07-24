/**
 * 上下文压缩器
 * 文件：src/performance/ContextCompactor.ts
 * 文档 17 §9.1
 */

export interface CompactConfig {
  maxTokens: number;
  threshold: number; // 压缩触发阈值（0-1）
  strategy: 'summarize' | 'truncate' | 'selective';
  preserveRecent: number; // 保留最近的消息数
  preserveSystem: boolean;
}

export interface Message {
  role: string;
  content: string;
  tokens?: number;
  metadata?: Record<string, any>;
}

export class ContextCompactor {
  private config: CompactConfig;

  constructor(config: Partial<CompactConfig> = {}) {
    this.config = {
      maxTokens: 128000,
      threshold: 0.8,
      strategy: 'summarize',
      preserveRecent: 10,
      preserveSystem: true,
      ...config,
    };
  }

  /**
   * 估算 Token 数
   */
  estimateTokens(text: string): number {
    // 粗略估算：英文约 4 字符/token，中文约 2 字符/token
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 2 + otherChars / 4);
  }

  /**
   * 计算消息总 Token
   */
  getTotalTokens(messages: Message[]): number {
    return messages.reduce(
      (sum, msg) => sum + (msg.tokens || this.estimateTokens(msg.content)),
      0
    );
  }

  /**
   * 检查是否需要压缩
   */
  needsCompaction(messages: Message[]): boolean {
    const totalTokens = this.getTotalTokens(messages);
    return totalTokens >= this.config.maxTokens * this.config.threshold;
  }

  /**
   * 压缩上下文
   */
  compact(messages: Message[]): Message[] {
    if (!this.needsCompaction(messages)) {
      return messages;
    }

    switch (this.config.strategy) {
      case 'summarize':
        return this.summarizeCompact(messages);
      case 'truncate':
        return this.truncateCompact(messages);
      case 'selective':
        return this.selectiveCompact(messages);
      default:
        return messages;
    }
  }

  /**
   * 摘要压缩
   */
  private summarizeCompact(messages: Message[]): Message[] {
    const recentMessages = messages.slice(-this.config.preserveRecent);
    const oldMessages = messages.slice(0, -this.config.preserveRecent);

    // 过滤系统消息
    const systemMessages = this.config.preserveSystem
      ? oldMessages.filter((msg) => msg.role === 'system')
      : [];

    // 生成摘要
    const summary = this.generateSummary(oldMessages);

    const summaryMessage: Message = {
      role: 'system',
      content: `[上下文摘要]\n${summary}`,
      metadata: {
        type: 'summary',
        originalMessageCount: oldMessages.length,
        compactedAt: new Date().toISOString(),
      },
    };

    return [...systemMessages, summaryMessage, ...recentMessages];
  }

  /**
   * 截断压缩
   */
  private truncateCompact(messages: Message[]): Message[] {
    const recentMessages = messages.slice(-this.config.preserveRecent);
    const systemMessages = this.config.preserveSystem
      ? messages.filter((msg) => msg.role === 'system')
      : [];

    // 截断每条消息
    const truncated = recentMessages.map((msg) => ({
      ...msg,
      content:
        msg.content.length > 1000
          ? msg.content.slice(0, 1000) + '... [truncated]'
          : msg.content,
    }));

    return [...systemMessages, ...truncated];
  }

  /**
   * 选择性压缩
   */
  private selectiveCompact(messages: Message[]): Message[] {
    const result: Message[] = [];

    for (const msg of messages) {
      // 保留系统消息
      if (this.config.preserveSystem && msg.role === 'system') {
        result.push(msg);
        continue;
      }

      // 保留最近的消息
      if (messages.indexOf(msg) >= messages.length - this.config.preserveRecent) {
        result.push(msg);
        continue;
      }

      // 跳过长消息
      const tokens = msg.tokens || this.estimateTokens(msg.content);
      if (tokens > 500) {
        continue;
      }

      result.push(msg);
    }

    return result;
  }

  /**
   * 生成摘要
   */
  private generateSummary(messages: Message[]): string {
    const summaries: string[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') continue;

      const content = msg.content.slice(0, 200);
      summaries.push(`[${msg.role}] ${content}...`);
    }

    return summaries.join('\n');
  }

  /**
   * 更新配置
   */
  updateConfig(updates: Partial<CompactConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * 获取配置
   */
  getConfig(): CompactConfig {
    return { ...this.config };
  }
} 
