/** 连接器文本块 */
export type ConnectorTextBlock = {
  type: 'connector_text'  // 连接器类型标识（真实块类型，见 services/api/claude.ts 流式累加处）
  connector_text: string  // 主要文本内容
  [key: string]: unknown
}

/** 连接器文本增量（流式 content_block_delta） */
export type ConnectorTextDelta = {
  type: 'connector_text_delta'
  connector_text: string
  [key: string]: unknown
}

/**
 * 判断是否为连接器文本块
 * @param value - 待检查的值
 * @returns 是否为连接器文本块
 */
export function isConnectorTextBlock(value: unknown): value is ConnectorTextBlock {
  // 必须精确匹配块类型。此前用 `'text' in value` 判定，会把普通文本块
  // （{type:'text', text:'...'}）误判为连接器文本块，导致后续取不存在的
  // connector_text 字段得到 undefined，正文被 AssistantTextMessage 当作
  // 空文本 return null —— 表现为「只有思考内容、没有正文」。
  return !!value && typeof value === 'object' && (value as Record<string, unknown>).type === 'connector_text'
}
