/** 连接器文本块 */
export type ConnectorTextBlock = {
  type?: string  // 连接器类型标识
  text?: string  // 主要文本内容
  [key: string]: unknown
}

/** 连接器文本增量（流式 content_block_delta） */
export type ConnectorTextDelta = {
  type?: string
  text?: string
  [key: string]: unknown
}

/**
 * 判断是否为连接器文本块
 * @param value - 待检查的值
 * @returns 是否为连接器文本块
 */
export function isConnectorTextBlock(value: unknown): value is ConnectorTextBlock {
  // 判断是否为连接器文本块
  return !!value && typeof value === 'object' && 'text' in (value as Record<string, unknown>)
}
