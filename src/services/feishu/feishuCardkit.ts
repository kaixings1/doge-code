/**
 * feishuCardkit.ts — 飞书 CardKit 五步 API 封装
 *
 * 五步流程:
 *   1. createCardEntity()    — 创建卡片实体，返回 card_id
 *   2. sendCardAsMessage()   — 通过 IM 消息把卡片挂到聊天窗，返回 message_id
 *   3. streamCardContent()   — 按 element_id 增量追加文本（传完整累计文本）
 *   4. setCardStreamingMode() — 关闭流式模式（收尾前必须做）
 *   5. updateCardKitCard()   — 全量替换卡片为最终态
 *
 * 参考实现: cc-haha adapters/feishu/cardkit.ts
 */

import type * as Lark from '@larksuiteoapi/node-sdk'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** 流式 markdown 元素的固定 element_id。 */
export const STREAMING_ELEMENT_ID = 'streaming_content'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CardKitResponse = {
  code?: number
  msg?: string
  data?: Record<string, unknown>
  [key: string]: unknown
}

export class CardKitApiError extends Error {
  readonly code: number
  readonly msg: string

  constructor(params: { api: string; code: number; msg: string; context: string }) {
    super(`cardkit ${params.api} FAILED: code=${params.code}, msg=${params.msg}, ${params.context}`)
    this.name = 'CardKitApiError'
    this.code = params.code
    this.msg = params.msg
  }
}

type LarkClient = Lark.Client

const DEFAULT_IM_CARD_REQUEST_TIMEOUT_MS = 15_000

function getImCardRequestTimeoutMs(): number {
  const raw = process.env.CC_HAHA_IM_CARD_REQUEST_TIMEOUT_MS
  const parsed = raw ? Number(raw) : DEFAULT_IM_CARD_REQUEST_TIMEOUT_MS
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_IM_CARD_REQUEST_TIMEOUT_MS
}

export async function withImCardRequestTimeout<T>(
  api: string,
  request: () => Promise<T>,
): Promise<T> {
  const timeoutMs = getImCardRequestTimeoutMs()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve().then(request),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${api} timed out after ${timeoutMs}ms`))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Response check
// ---------------------------------------------------------------------------

function assertCardKitOk(params: { resp: CardKitResponse; api: string; context: string }): void {
  const { resp, api, context } = params
  const code = resp.code
  if (code !== undefined && code !== 0) {
    throw new CardKitApiError({
      api,
      code,
      msg: typeof resp.msg === 'string' ? resp.msg : '',
      context,
    })
  }
}

// ---------------------------------------------------------------------------
// Step 1 — createCardEntity
// ---------------------------------------------------------------------------

export async function createCardEntity(
  client: LarkClient,
  card: Record<string, unknown>,
): Promise<string> {
  const resp = (await withImCardRequestTimeout('card.create', () =>
    client.cardkit.v1.card.create({
      data: {
        type: 'card_json',
        data: JSON.stringify(card),
      },
    }),
  )) as unknown as CardKitResponse

  assertCardKitOk({
    resp,
    api: 'card.create',
    context: `cardLen=${JSON.stringify(card).length}`,
  })

  const cardId = (resp.data?.card_id as string | undefined) ?? (resp.card_id as string | undefined)
  if (!cardId) {
    throw new CardKitApiError({
      api: 'card.create',
      code: resp.code ?? -1,
      msg: 'response missing card_id',
      context: `resp=${JSON.stringify(resp).slice(0, 200)}`,
    })
  }
  return cardId
}

// ---------------------------------------------------------------------------
// Step 2 — sendCardAsMessage
// ---------------------------------------------------------------------------

export async function sendCardAsMessage(
  client: LarkClient,
  chatId: string,
  cardId: string,
  replyToMessageId?: string,
  uuid?: string,
): Promise<string> {
  const content = JSON.stringify({
    type: 'card',
    data: { card_id: cardId },
  })

  if (replyToMessageId) {
    const resp = await withImCardRequestTimeout('im.message.reply', () =>
      client.im.message.reply({
        path: { message_id: replyToMessageId },
        data: { content, msg_type: 'interactive', uuid },
      }),
    )
    const messageId = resp.data?.message_id
    if (!messageId) {
      throw new CardKitApiError({
        api: 'im.message.reply',
        code: -1,
        msg: 'response missing message_id',
        context: `cardId=${cardId}`,
      })
    }
    return messageId
  }

  const resp = await withImCardRequestTimeout('im.message.create', () =>
    client.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        msg_type: 'interactive',
        content,
        uuid,
      },
    }),
  )
  const messageId = resp.data?.message_id
  if (!messageId) {
    throw new CardKitApiError({
      api: 'im.message.create',
      code: -1,
      msg: 'response missing message_id',
      context: `chatId=${chatId} cardId=${cardId}`,
    })
  }
  return messageId
}

// ---------------------------------------------------------------------------
// Step 3 — streamCardContent
// ---------------------------------------------------------------------------

export async function streamCardContent(
  client: LarkClient,
  cardId: string,
  elementId: string,
  content: string,
  sequence: number,
): Promise<void> {
  const resp = (await withImCardRequestTimeout('cardElement.content', () =>
    client.cardkit.v1.cardElement.content({
      data: { content, sequence },
      path: { card_id: cardId, element_id: elementId },
    }),
  )) as unknown as CardKitResponse

  assertCardKitOk({
    resp,
    api: 'cardElement.content',
    context: `seq=${sequence} len=${content.length}`,
  })
}

// ---------------------------------------------------------------------------
// Step 4 — setCardStreamingMode
// ---------------------------------------------------------------------------

export async function setCardStreamingMode(
  client: LarkClient,
  cardId: string,
  streamingMode: boolean,
  sequence: number,
): Promise<void> {
  const resp = (await withImCardRequestTimeout('card.settings', () =>
    client.cardkit.v1.card.settings({
      data: {
        settings: JSON.stringify({ streaming_mode: streamingMode }),
        sequence,
      },
      path: { card_id: cardId },
    }),
  )) as unknown as CardKitResponse

  assertCardKitOk({
    resp,
    api: 'card.settings',
    context: `seq=${sequence} streaming_mode=${streamingMode}`,
  })
}

// ---------------------------------------------------------------------------
// Step 5 — updateCardKitCard
// ---------------------------------------------------------------------------

export async function updateCardKitCard(
  client: LarkClient,
  cardId: string,
  card: Record<string, unknown>,
  sequence: number,
): Promise<void> {
  const resp = (await withImCardRequestTimeout('card.update', () =>
    client.cardkit.v1.card.update({
      data: {
        card: { type: 'card_json', data: JSON.stringify(card) },
        sequence,
      },
      path: { card_id: cardId },
    }),
  )) as unknown as CardKitResponse

  assertCardKitOk({
    resp,
    api: 'card.update',
    context: `seq=${sequence} cardId=${cardId}`,
  })
}
