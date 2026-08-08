/**
 * feishuStreamingCard.ts — 飞书流式卡片生命周期状态机
 *
 * 负责把 LLM 的流式文本增量渲染成一张随着内容生长的飞书 CardKit 卡片。
 *
 * 功能:
 * - CardKit API 的 5 步调用（create → send → stream × N → settings → update）
 * - 节流 + 并发保护（FlushController）
 * - Markdown 预处理（optimizeMarkdownForFeishu + sanitizeTextForCard）
 * - 错误降级：CardKit 挂了自动切到 im.message.patch + Schema 2.0 卡
 * - 速率限制：230020 跳帧，下次重试；230099 表格超限禁用 CardKit 流式
 *
 * 参考实现: cc-haha adapters/feishu/streaming-card.ts
 */

import type * as Lark from '@larksuiteoapi/node-sdk'
import { randomUUID } from 'node:crypto'
import { FlushController, THROTTLE } from './feishuFlushController.js'
import {
  createCardEntity,
  sendCardAsMessage,
  streamCardContent,
  setCardStreamingMode,
  updateCardKitCard,
  STREAMING_ELEMENT_ID,
  withImCardRequestTimeout,
} from './feishuCardkit.js'
import {
  isCardRateLimitError,
  isCardTableLimitError,
} from './feishuCardErrors.js'
import { optimizeMarkdownForFeishu, sanitizeTextForCard, FEISHU_CARD_TABLE_LIMIT } from './feishuMarkdownStyle.js'

// ---------------------------------------------------------------------------
// Card JSON builders
// ---------------------------------------------------------------------------

/** 初始流式卡片：Schema 2.0 + streaming_mode + element_id。 */
export function buildInitialStreamingCard(): Record<string, unknown> {
  return {
    schema: '2.0',
    config: {
      streaming_mode: true,
      update_multi: true,
    },
    body: {
      elements: [
        {
          tag: 'markdown',
          content: '☁️ *正在思考中...*',
          text_align: 'left',
          element_id: STREAMING_ELEMENT_ID,
        },
      ],
    },
  }
}

/** 已渲染完成的卡片：Schema 2.0，无 streaming_mode，单 markdown 元素。 */
export function buildRenderedCard(renderedMarkdown: string): Record<string, unknown> {
  return {
    schema: '2.0',
    config: {
      update_multi: true,
    },
    body: {
      elements: [
        {
          tag: 'markdown',
          content: renderedMarkdown || ' ',
          text_align: 'left',
        },
      ],
    },
  }
}

/** 错误卡片：红色 header + 错误文本。 */
export function buildErrorCard(message: string): Record<string, unknown> {
  return {
    schema: '2.0',
    config: { update_multi: true },
    header: {
      title: { tag: 'plain_text', content: '❌ 出错了' },
      template: 'red',
    },
    body: {
      elements: [
        {
          tag: 'markdown',
          content: message || '未知错误',
        },
      ],
    },
  }
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

export type StreamingCardPhase =
  | 'idle'
  | 'creating'
  | 'streaming'
  | 'finalizing'
  | 'completed'
  | 'aborted'

export type StreamingCardDeps = {
  larkClient: Lark.Client
  chatId: string
  replyToMessageId?: string
}

/** One entry in the tool-use trace displayed above the answer text. */
type ToolStep = {
  id: string
  name: string
  status: 'running' | 'done'
}

/** 最多保留的 reasoning 预览字符数。 */
const REASONING_PREVIEW_CHARS = 600

/** 连续 streamCardContent 失败多少次后才放弃 CardKit 流式。 */
const STREAM_FAIL_DISABLE_THRESHOLD = 3

export class StreamingCard {
  // ---- lifecycle state ----
  private phase: StreamingCardPhase = 'idle'

  // ---- CardKit state ----
  /** CardKit card_id。null = CardKit 创建失败，已退到 patch fallback 模式。 */
  private cardId: string | null = null
  /** IM message_id。始终应该有值（否则连 patch 也做不了）。 */
  private messageId: string | null = null
  private readonly outboundMessageUuid = randomUUID()
  /** CardKit cardElement.content() 单调递增序列号。 */
  private sequence = 0
  /** CardKit 流式还在工作。 */
  private cardKitStreamActive = false
  /** 连续 streamCardContent 未知错误计数。 */
  private consecutiveStreamFailures = 0

  // ---- text state ----
  private accumulatedText = ''
  private lastFlushedText = ''
  /** 累积 thinking_delta，渲染为卡片顶部的推理预览。 */
  private accumulatedReasoningText = ''
  /** 工具调用轨迹。 */
  private toolSteps: ToolStep[] = []

  // ---- flush ----
  private flushController: FlushController

  constructor(private readonly deps: StreamingCardDeps) {
    this.flushController = new FlushController(() => this.performFlush())
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  /**
   * 首次创建卡片（CardKit 主路径；失败则降级到直发 Schema 2.0 卡 + patch）。
   */
  async ensureCreated(): Promise<void> {
    if (this.phase !== 'idle') return
    this.phase = 'creating'

    try {
      const cardId = await createCardEntity(
        this.deps.larkClient,
        buildInitialStreamingCard(),
      )
      const messageId = await sendCardAsMessage(
        this.deps.larkClient,
        this.deps.chatId,
        cardId,
        this.deps.replyToMessageId,
        this.outboundMessageUuid,
      )
      this.cardId = cardId
      this.messageId = messageId
      this.cardKitStreamActive = true
      this.sequence = 1
      this.phase = 'streaming'
      this.flushController.setCardMessageReady(true)
    } catch (createErr) {
      // CardKit 不可用 → 降级到直发卡片 + patch
      try {
        const fallbackResp = await withImCardRequestTimeout('im.message.create', () =>
          this.deps.larkClient.im.message.create({
            params: { receive_id_type: 'chat_id' },
            data: {
              receive_id: this.deps.chatId,
              msg_type: 'interactive',
              content: JSON.stringify(buildRenderedCard(' ')),
              uuid: this.outboundMessageUuid,
            },
          }),
        )
        const mid = fallbackResp.data?.message_id
        if (!mid) {
          throw new Error('fallback im.message.create returned no message_id')
        }
        this.cardId = null
        this.messageId = mid
        this.cardKitStreamActive = false
        this.phase = 'streaming'
        this.flushController.setCardMessageReady(true)
      } catch (fallbackErr) {
        this.phase = 'aborted'
        throw fallbackErr
      }
    }

    if (this.hasAnyContent()) {
      void this.flushController.throttledUpdate(this.currentThrottle())
    }
  }

  /** 追加文本增量。不等待，只安排一次节流 flush。 */
  appendText(delta: string): void {
    if (!delta) return
    if (this.phase === 'completed' || this.phase === 'aborted') return
    this.accumulatedText += delta
    void this.flushController.throttledUpdate(this.currentThrottle())
  }

  /** 追加 reasoning/thinking delta。 */
  appendReasoning(delta: string): void {
    if (!delta) return
    if (this.phase === 'completed' || this.phase === 'aborted') return
    this.accumulatedReasoningText += delta
    void this.flushController.throttledUpdate(this.currentThrottle())
  }

  /** 记录一次 tool_use 开始。 */
  startTool(toolUseId: string | undefined, toolName: string | undefined): void {
    if (this.phase === 'completed' || this.phase === 'aborted') return
    if (!toolName) return
    const id = toolUseId || `${toolName}#${this.toolSteps.length}`
    if (this.toolSteps.some((s) => s.id === id)) return
    this.toolSteps.push({ id, name: toolName, status: 'running' })
    void this.flushController.throttledUpdate(this.currentThrottle())
  }

  /** 把指定 tool 的状态从 running 切到 done。 */
  completeTool(toolUseId: string | undefined, toolName: string | undefined): void {
    if (this.phase === 'completed' || this.phase === 'aborted') return
    let step: ToolStep | undefined
    if (toolUseId) {
      step = this.toolSteps.find((s) => s.id === toolUseId)
    }
    if (!step && toolName) {
      for (let i = this.toolSteps.length - 1; i >= 0; i--) {
        const s = this.toolSteps[i]!
        if (s.name === toolName && s.status === 'running') {
          step = s
          break
        }
      }
    }
    if (!step) return
    if (step.status === 'done') return
    step.status = 'done'
    void this.flushController.throttledUpdate(this.currentThrottle())
  }

  /**
   * 流式结束，切到最终态。
   */
  async finalize(): Promise<void> {
    if (this.phase === 'completed' || this.phase === 'aborted') return
    if (this.phase === 'idle') {
      this.phase = 'completed'
      this.flushController.complete()
      return
    }
    this.phase = 'finalizing'
    this.flushController.cancelPendingFlush()
    await this.flushController.waitForFlush()

    const finalText = this.terminalText()
    try {
      if (this.cardId) {
        this.sequence += 1
        await setCardStreamingMode(this.deps.larkClient, this.cardId, false, this.sequence)
        this.sequence += 1
        await updateCardKitCard(this.deps.larkClient, this.cardId, buildRenderedCard(finalText), this.sequence)
      } else if (this.messageId) {
        await withImCardRequestTimeout('im.message.patch', () =>
          this.deps.larkClient.im.message.patch({
            path: { message_id: this.messageId! },
            data: { content: JSON.stringify(buildRenderedCard(finalText)) },
          }),
        )
      }
    } catch (err) {
      // finalize 失败不阻塞 — 用户已看到某种版本的内容
      if (this.messageId) {
        try {
          await withImCardRequestTimeout('im.message.patch', () =>
            this.deps.larkClient.im.message.patch({
              path: { message_id: this.messageId! },
              data: { content: JSON.stringify(buildRenderedCard(finalText)) },
            }),
          )
        } catch { /* ignore */ }
      }
    } finally {
      this.phase = 'completed'
      this.lastFlushedText = finalText
      this.flushController.complete()
    }
  }

  /** 错误中止 — 尝试把错误信息渲染到卡片上。 */
  async abort(err: Error): Promise<void> {
    if (this.phase === 'completed' || this.phase === 'aborted') return
    const wasIdle = this.phase === 'idle'
    this.phase = 'aborted'
    this.flushController.cancelPendingFlush()
    await this.flushController.waitForFlush().catch(() => {})

    if (wasIdle || !this.messageId) {
      this.flushController.complete()
      return
    }

    const errCard = buildErrorCard(
      `${err.message}${this.accumulatedText ? '\n\n——\n\n' + this.accumulatedText : ''}`,
    )
    try {
      if (this.cardId) {
        this.sequence += 1
        await setCardStreamingMode(this.deps.larkClient, this.cardId, false, this.sequence).catch(() => {})
        this.sequence += 1
        await updateCardKitCard(this.deps.larkClient, this.cardId, errCard, this.sequence)
      } else {
        await withImCardRequestTimeout('im.message.patch', () =>
          this.deps.larkClient.im.message.patch({
            path: { message_id: this.messageId! },
            data: { content: JSON.stringify(errCard) },
          }),
        )
      }
    } catch { /* ignore */ }
    this.flushController.complete()
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private currentThrottle(): number {
    return this.cardKitStreamActive ? THROTTLE.CARDKIT_MS : THROTTLE.PATCH_MS
  }

  private hasAnyContent(): boolean {
    return (
      this.accumulatedText.length > 0 ||
      this.accumulatedReasoningText.length > 0 ||
      this.toolSteps.length > 0
    )
  }

  /** 组合 reasoning + toolSteps + answerText，经 sanitize + optimize 管道。 */
  private renderedText(): string {
    const sections: string[] = []

    if (this.toolSteps.length > 0) {
      const inline = this.toolSteps
        .map((s) => `${s.status === 'done' ? '✅' : '⚙️'} ${s.name}`)
        .join(' · ')
      sections.push(`🛠️ ${inline}`)
    }

    if (this.accumulatedReasoningText) {
      const preview =
        this.accumulatedReasoningText.length > REASONING_PREVIEW_CHARS
          ? '...' + this.accumulatedReasoningText.slice(this.accumulatedReasoningText.length - REASONING_PREVIEW_CHARS + 3)
          : this.accumulatedReasoningText
      sections.push(`💭 **思考中**\n\n${preview}`)
    }

    if (this.accumulatedText) {
      sections.push(this.accumulatedText)
    }

    if (sections.length === 0) return '☁️ *正在思考中...*'

    const composed = sections.join('\n\n---\n\n')
    const limited = sanitizeTextForCard(composed, FEISHU_CARD_TABLE_LIMIT)
    return optimizeMarkdownForFeishu(limited, 2)
  }

  /** 终态文本: 只渲染最终答复正文，丢弃 reasoning 和 toolSteps。 */
  private terminalText(): string {
    if (this.accumulatedText) {
      const limited = sanitizeTextForCard(this.accumulatedText, FEISHU_CARD_TABLE_LIMIT)
      return optimizeMarkdownForFeishu(limited, 2)
    }
    return this.renderedText()
  }

  /** FlushController 调用的 doFlush。 */
  private async performFlush(): Promise<void> {
    if (this.phase !== 'streaming') return
    if (!this.messageId) return

    // CardKit 中间帧被禁用但 cardId 仍有效 — 跳过中间 flush
    if (this.cardId && !this.cardKitStreamActive) return

    const finalText = this.renderedText()
    if (finalText === this.lastFlushedText) return

    if (this.cardKitStreamActive && this.cardId) {
      // CardKit 主路径
      this.sequence += 1
      try {
        await streamCardContent(
          this.deps.larkClient,
          this.cardId,
          STREAMING_ELEMENT_ID,
          finalText,
          this.sequence,
        )
        this.lastFlushedText = finalText
        this.consecutiveStreamFailures = 0
      } catch (err) {
        if (isCardRateLimitError(err)) {
          return // 跳帧 — 下次 throttledUpdate 会重试
        }
        if (isCardTableLimitError(err)) {
          this.cardKitStreamActive = false
          return
        }
        // 其他错误 — 跳帧重试
        this.consecutiveStreamFailures += 1
        if (this.consecutiveStreamFailures >= STREAM_FAIL_DISABLE_THRESHOLD) {
          this.cardKitStreamActive = false
        }
        return
      }
    } else {
      // Patch fallback 路径
      try {
        await withImCardRequestTimeout('im.message.patch', () =>
          this.deps.larkClient.im.message.patch({
            path: { message_id: this.messageId! },
            data: { content: JSON.stringify(buildRenderedCard(finalText)) },
          }),
        )
        this.lastFlushedText = finalText
      } catch (err) {
        if (isCardRateLimitError(err)) return
        // ignore
      }
    }
  }
}
