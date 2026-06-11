/**
 * 工具调用协议处理器（增强版）
 * 负责处理工具调用与服务器通信的完整协议，确保正确的 [DONE] 结束标记。
 *
 * 主要增强：
 * - 完整的日志系统与事件通知
 * - 超时、重试、并发控制
 * - 流式分块消息缓存
 * - 工具调用 ID 关联
 * - 丰富的统计与生命周期管理
 */

import { handleToolCalls } from './tool-call-executor.js'

// ==================== 日志接口 ====================

/** 可自定义的日志记录器 */
export interface Logger {
  debug(message: string, ...args: any[]): void
  info(message: string, ...args: any[]): void
  warn(message: string, ...args: any[]): void
  error(message: string, ...args: any[]): void
}

/** 默认控制台日志 */
const defaultLogger: Logger = {
  debug: (...args) => console.debug('[ToolHandler]', ...args),
  info: (...args) => console.info('[ToolHandler]', ...args),
  warn: (...args) => console.warn('[ToolHandler]', ...args),
  error: (...args) => console.error('[ToolHandler]', ...args),
}

// ==================== 事件系统 ====================

type EventHandler = (...args: any[]) => void

class EventEmitter {
  private handlers: Record<string, EventHandler[]> = {}

  on(event: string, handler: EventHandler): void {
    if (!this.handlers[event]) this.handlers[event] = []
    this.handlers[event].push(handler)
  }

  off(event: string, handler: EventHandler): void {
    if (!this.handlers[event]) return
    this.handlers[event] = this.handlers[event].filter(h => h !== handler)
  }

  emit(event: string, ...args: any[]): void {
    const handlers = this.handlers[event]
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(...args)
        } catch (e) {
          console.error(`事件 ${event} 处理器异常:`, e)
        }
      }
    }
  }

  removeAllListeners(event?: string): void {
    if (event) {
      delete this.handlers[event]
    } else {
      this.handlers = {}
    }
  }
}

// ==================== 配置选项 ====================

export interface MessageHandlerOptions {
  /** 单个工具调用超时时间（毫秒），0 表示不超时 */
  timeout: number
  /** 失败后最大重试次数 */
  maxRetries: number
  /** 重试间隔基数（毫秒），实际为 base * 2^retry */
  retryBaseDelay: number
  /** 并发执行工具调用的最大数量，0 表示无限制 */
  maxConcurrency: number
  /** 多条结果发送之间的延迟（毫秒） */
  sendDelayMs: number
  /** 自定义日志器 */
  logger: Logger
  /** 是否启用流式消息缓存（处理分块到达的消息） */
  enableStreamingBuffer: boolean
}

const DEFAULT_OPTIONS: MessageHandlerOptions = {
  timeout: 30000,
  maxRetries: 2,
  retryBaseDelay: 500,
  maxConcurrency: 5,
  sendDelayMs: 100,
  logger: defaultLogger,
  enableStreamingBuffer: false,
}

// ==================== 接口定义（完全保留原类型） ====================

export interface ServerProtocol {
  send(message: string): Promise<void>
  done(): Promise<void>
  hasMoreToolCalls(): boolean
}

export interface ToolCallResult {
  success: boolean
  tool: string
  parameters: Record<string, unknown>
  result: unknown
  error?: string
  timestamp: string
}

// ==================== 工具函数（增强但保持导出签名） ====================
export function extractToolCalls(message: string): string[] {
  const calls: string[] = [];
  if (!message || typeof message !== 'string') return calls;

  let pos = 0;
  const prefix = 'tool_json';

  while (true) {
    const start = message.indexOf(prefix, pos);
    if (start === -1) break;

    const jsonStart = message.indexOf('{', start);
    if (jsonStart === -1) break;

    let depth = 0;
    let jsonEnd = -1;
    let inString = false;
    let escape = false;

    // 1. 通过括号深度定位 JSON 结束位置
    for (let i = jsonStart; i < message.length; i++) {
      const char = message[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (char === '\\') {
        escape = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === '{') depth++;
      else if (char === '}') {
        depth--;
        if (depth === 0) {
          jsonEnd = i;
          break;
        }
      }
    }

    let jsonStr: string | null = null;
    let extractionSucceeded = false;

    // 2. 尝试提取并解析 JSON
    if (jsonEnd !== -1) {
      jsonStr = message.substring(jsonStart, jsonEnd + 1);
      // 首先尝试直接解析（无换行等特殊情况）
      try {
        JSON.parse(jsonStr);
        calls.push(`${prefix} ${jsonStr}`);
        extractionSucceeded = true;
      } catch {
        // 直接解析失败，使用增强的清理函数处理后重试
        const cleaned = cleanJsonString(jsonStr);
        try {
          JSON.parse(cleaned);
          calls.push(`${prefix} ${cleaned}`);
          extractionSucceeded = true;
        } catch {
          // 仍然失败，保留错误状态，后续可能进入补齐括号分支
        }
      }
      pos = jsonEnd + 1;
    }

    // 3. 如果正常闭合分支未成功提取，尝试补齐缺失的括号（无论原来是否闭合）
    //    此举可以应对 jsonEnd === -1 的情况，也能作为 jsonEnd 虽存在但解析失败的兜底策略
    if (!extractionSucceeded) {
      const tailPart = message.substring(jsonStart);
      const repaired = tailPart + '}'.repeat(Math.max(depth, 0)); // 保证深度非负
      const cleaned = cleanJsonString(repaired);
      try {
        JSON.parse(cleaned);
        calls.push(`${prefix} ${cleaned}`);
        pos = message.length;
        continue;
      } catch {
        // 修复失败，移动指针防止死循环
      }
      pos = start + prefix.length;
      continue;
    }

    // 4. 死循环保护：理论上不应走到这里，但以防万一
    if (!extractionSucceeded) {
      pos = start + prefix.length;
    }
  }

  return calls;
}

/**
 * 清理 JSON 字符串内部的非法字符，使其符合 JSON 规范
 * 主要处理字符串值中未转义的控制字符（换行、回车、制表等）
 * 同时正确跟踪字符串的边界，避免破坏结构
 */
function cleanJsonString(raw: string): string {
  let result = '';
  let inString = false;
  let escape = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

    if (escape) {
      // 上一个字符是反斜杠，当前字符作为转义序列的一部分原样保留
      result += ch;
      escape = false;
      continue;
    }

    if (ch === '\\') {
      result += ch;
      escape = true;
      continue;
    }

    if (ch === '"') {
      // 遇到非转义的双引号，切换字符串状态
      inString = !inString;
      result += ch;
      continue;
    }

    if (inString) {
      // 处于字符串内部，将非法控制字符转义
      switch (ch) {
        case '\n':
          result += '\\n';
          break;
        case '\r':
          result += '\\r';
          break;
        case '\t':
          result += '\\t';
          break;
        // 可根据需要增加其他控制字符的转义
        default:
          result += ch;
          break;
      }
    } else {
      // 不在字符串内，原样保留
      result += ch;
    }
  }

  return result;
} 
/**
 * 检查消息是否需要工具调用处理（保持原名）
 */
export function needsToolCallProcessing(message: string): boolean {
  return message.includes('tool_json')
}

/**
 * 从响应中提取工具调用（公共别名，向后兼容）
 */
export function extractToolCallsFromResponse(message: string): string[] {
  return extractToolCalls(message)
}

// ==================== 辅助类型 ====================

interface ToolCallItem {
  raw: string               // 原始文本 "tool_json {...}"
  json: Record<string, any> // 解析后的 JSON 对象
  id?: string               // 工具调用唯一标识（如果有）
}

interface PendingExecution {
  call: ToolCallItem
  resolve: (result: ToolCallResult) => void
  reject: (error: any) => void
}

// ==================== 消息处理器（极大增强） ====================

export class MessageHandler extends EventEmitter {
  // 原有私有属性保留
  private pendingToolCalls: string[] = []
  private isProcessing = false

  // 新增属性
  private options: MessageHandlerOptions
  private logger: Logger
  private concurrencySemaphore: { current: number; queue: (() => void)[] }
  private streamingBuffer: string = ''
  private destroyRequested = false
  private stats = { totalProcessed: 0, successCount: 0, failureCount: 0 }

  constructor(private protocol: ServerProtocol, options?: Partial<MessageHandlerOptions>) {
    super()
    this.options = { ...DEFAULT_OPTIONS, ...options }
    this.logger = this.options.logger
    this.concurrencySemaphore = { current: 0, queue: [] }
  }

  /** 原有公共方法保持不变 */
  handleMessage(message: string): Promise<void> {
    // 如果已销毁，拒绝新消息
    if (this.destroyRequested) {
      this.logger.warn('处理器已销毁，忽略消息')
      return Promise.resolve()
    }
    return this._handleMessage(message)
  }

  /** 原有公共方法 processToolCalls 必须保留 */
  processToolCalls(message: string): Promise<void> {
    return this._processToolCalls(message)
  }

  /** 原有公共方法 containsToolCall */
  containsToolCall(message: string): boolean {
    return needsToolCallProcessing(message)
  }

  /** 原有公共方法 extractToolCalls */
  extractToolCalls(message: string): string[] {
    return extractToolCalls(message)
  }

  // ============ 私有增强实现 ============

  private async _handleMessage(message: string): Promise<void> {
    this.logger.debug(`收到消息 (长度${message.length}): ${message.substring(0, 120)}...`)

    // 流式缓存：如果未完整，暂存并等待后续片段
    if (this.options.enableStreamingBuffer) {
      this.streamingBuffer += message
      if (!this.isMessageComplete(this.streamingBuffer)) {
        this.logger.debug('消息不完整，进入缓存等待')
        return
      }
      message = this.streamingBuffer
      this.streamingBuffer = ''
    }

    if (this.containsToolCall(message)) {
      this.logger.info('检测到工具调用')
      await this._processToolCalls(message)
    } else {
      this.logger.info('普通消息，直接转发')
      await this.protocol.send(message)
      await this.finalizeSession()
    }
  }

  /**
   * 判断消息是否完整（用于流式分块场景）
   * 简单策略：最后一个字符是换行或 }，且 JSON 可解析则认为完整
   */
  /*private isMessageComplete(text: string): boolean {
    const trimmed = text.trim()
    if (trimmed.endsWith('}') || trimmed.endsWith('\n')) {
      try {
        // 若包含 tool_json 尝试提取全部，否则视为普通完整消息
        if (this.containsToolCall(trimmed)) {
          const calls = this.extractToolCalls(trimmed)
          return calls.length > 0
        }
        return true
      } catch {
        return false
      }
    }
    return false
  }*/
	private isMessageComplete(text: string): boolean {
	  const trimmed = text.trim();
	  // 如果包含 tool_json，必须能成功提取出完整调用才认为完整
	  if (this.containsToolCall(trimmed)) {
		const calls = this.extractToolCalls(trimmed);
		return calls.length > 0;
	  }
	  // 否则只要以 } 或换行结尾就认为完整
	  return trimmed.endsWith('}') || trimmed.endsWith('\n');
	}
  private async _processToolCalls(message: string): Promise<void> {
    if (this.isProcessing) {
      this.logger.info('处理器正忙，加入队列')
      this.pendingToolCalls.push(message)
      return
    }

    this.isProcessing = true
    try {
      let currentMessage: string | undefined = message
      while (currentMessage) {
        await this.executeToolCallsFromMessage(currentMessage)
        currentMessage = this.pendingToolCalls.shift()
      }
      this.emit('queue-empty')
    } finally {
      this.isProcessing = false
    }
  }

  private async executeToolCallsFromMessage(message: string): Promise<void> {
    const rawCalls = this.extractToolCalls(message)
    if (rawCalls.length === 0) {
      await this.protocol.send(message)
      await this.finalizeSession()
      return
    }

    // 解析并提取 ID
    const items: ToolCallItem[] = []
    for (const raw of rawCalls) {
      const jsonStart = raw.indexOf('{')
      const jsonStr = raw.substring(jsonStart)
      try {
        const obj = JSON.parse(jsonStr)
        items.push({ raw, json: obj, id: obj.id ?? obj.tool_call_id })
      } catch {
        this.logger.warn(`解析工具调用失败: ${raw.substring(0, 100)}`)
      }
    }

    if (items.length === 0) {
      await this.protocol.send(message)
      await this.finalizeSession()
      return
    }

    // 并发执行工具调用
    const results = await this.executeWithConcurrency(items)

    // 按顺序发送结果
    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      const resultStr = JSON.stringify(result, null, 2)
      this.logger.info(`发送工具结果 ${i + 1}/${results.length} (${result.tool})`)
      await this.protocol.send(resultStr)
      if (i < results.length - 1 && this.options.sendDelayMs > 0) {
        await delay(this.options.sendDelayMs)
      }
    }

    await this.finalizeSession()
  }

  /**
   * 控制并发执行多个工具调用
   */
  private async executeWithConcurrency(items: ToolCallItem[]): Promise<ToolCallResult[]> {
    const results: ToolCallResult[] = new Array(items.length)
    const executing: Promise<void>[] = []

    const executeOne = async (index: number): Promise<void> => {
      await this.acquireConcurrencySlot()
      try {
        results[index] = await this.executeSingleWithRetry(items[index])
      } finally {
        this.releaseConcurrencySlot()
      }
    }

    for (let i = 0; i < items.length; i++) {
      executing.push(executeOne(i))
    }
    await Promise.all(executing)
    return results
  }

  /**
   * 带重试与超时的单次工具调用执行
   */
  private async executeSingleWithRetry(item: ToolCallItem, attempt = 0): Promise<ToolCallResult> {
    const startTime = Date.now()
    this.logger.debug(`开始执行工具: ${item.json.tool || item.json.name} (ID: ${item.id || '无'})`)
    this.emit('tool-start', item)

    try {
      const result = await this.executeWithTimeout(item)
      this.stats.totalProcessed++
      this.stats.successCount++
      this.logger.debug(`工具执行成功: ${item.id || item.json.tool}`)
      this.emit('tool-result', result)
      return result
    } catch (error: any) {
      this.logger.warn(`工具执行失败 (尝试 ${attempt + 1}/${this.options.maxRetries + 1}): ${error.message}`)
      if (attempt < this.options.maxRetries) {
        const delayMs = this.options.retryBaseDelay * Math.pow(2, attempt)
        this.logger.info(`将在 ${delayMs}ms 后重试`)
        await delay(delayMs)
        return this.executeSingleWithRetry(item, attempt + 1)
      }
      // 最终失败
      this.stats.totalProcessed++
      this.stats.failureCount++
      const failResult: ToolCallResult = {
        success: false,
        tool: item.json.tool || item.json.name || 'unknown',
        parameters: item.json.parameters || item.json,
        result: null,
        error: error.message,
        timestamp: new Date().toISOString()
      }
      this.emit('tool-error', failResult, item)
      return failResult
    }
  }

  /**
   * 带超时控制的执行包装
   */
	private executeWithTimeout(item: ToolCallItem): Promise<ToolCallResult> {
	  return new Promise(async (resolve, reject) => {
		const timer = this.options.timeout > 0
		  ? setTimeout(() => reject(new Error(`工具调用超时 (${this.options.timeout}ms)`)), this.options.timeout)
		  : null;
		try {
		  const [jsonStr] = await handleToolCalls([item.raw]);
		  const result = JSON.parse(jsonStr) as ToolCallResult; // 新增
		  if (timer) clearTimeout(timer);
		  resolve(result);
		} catch (e) {
		  if (timer) clearTimeout(timer);
		  reject(e);
		}
	  });
	}

  private async finalizeSession(): Promise<void> {
    this.logger.info('发送会话结束标记 [DONE]')
    this.emit('done')
    await this.protocol.done()
  }

  // 简单的并发控制（信号量）
  private acquireConcurrencySlot(): Promise<void> {
    if (this.options.maxConcurrency <= 0) return Promise.resolve()
    if (this.concurrencySemaphore.current < this.options.maxConcurrency) {
      this.concurrencySemaphore.current++
      return Promise.resolve()
    }
    return new Promise(resolve => {
      this.concurrencySemaphore.queue.push(() => {
        this.concurrencySemaphore.current++
        resolve()
      })
    })
  }

  private releaseConcurrencySlot(): void {
    if (this.options.maxConcurrency <= 0) return
    this.concurrencySemaphore.current--
    const next = this.concurrencySemaphore.queue.shift()
    if (next) next()
  }

  // ============ 新增公共方法（不影响原有 API） ============

  /** 获取处理统计信息 */
  getStats() {
    return { ...this.stats, pendingQueue: this.pendingToolCalls.length, isProcessing: this.isProcessing }
  }

  /** 等待队列全部处理完成（包括当前正在执行的任务） */
  async drain(): Promise<void> {
    if (!this.isProcessing && this.pendingToolCalls.length === 0) return
    return new Promise(resolve => {
      const check = () => {
        if (!this.isProcessing && this.pendingToolCalls.length === 0) {
          this.off('queue-empty', check)
          resolve()
        }
      }
      this.on('queue-empty', check)
    })
  }

  /** 销毁处理器，清空队列，拒绝新消息 */
  destroy(): void {
    this.destroyRequested = true
    this.pendingToolCalls = []
    this.removeAllListeners()
    this.logger.info('MessageHandler 已销毁')
  }
}

// ==================== 简单服务器协议实现（增强） ====================

export class SimpleServerProtocol implements ServerProtocol {
  private sendCount = 0
  private simulateLatency: number
  private failureProbability: number

  constructor(latencyMs = 0, failureProb = 0) {
    this.simulateLatency = latencyMs
    this.failureProbability = Math.min(1, Math.max(0, failureProb))
  }

  async send(message: string): Promise<void> {
    if (this.simulateLatency > 0) await delay(this.simulateLatency)
    if (Math.random() < this.failureProbability) {
      throw new Error('模拟发送失败')
    }
    this.sendCount++
    console.log(`[ServerProtocol] 发送 #${this.sendCount}:`)
    console.log(message)
  }

  async done(): Promise<void> {
    if (this.simulateLatency > 0) await delay(this.simulateLatency)
    console.log('[ServerProtocol] 会话结束 [DONE]')
  }

  hasMoreToolCalls(): boolean {
    return false
  }
}

// ==================== 入口函数（完全兼容） ====================

export async function handleServerResponse(
  message: string,
  protocol: ServerProtocol
): Promise<void> {
  const handler = new MessageHandler(protocol)
  await handler.handleMessage(message)
}

export async function handleServerResponses(
  messages: string[],
  protocol: ServerProtocol
): Promise<void> {
  const handler = new MessageHandler(protocol)
  for (const msg of messages) {
    try {
      await handler.handleMessage(msg)
    } catch (error) {
      console.error('批量处理单条消息失败:', error)
      // 单条失败不影响后续
    }
  }
}

// 工具
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}