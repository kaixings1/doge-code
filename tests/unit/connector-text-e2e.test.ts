import { describe, it, expect } from 'vitest'
import { isConnectorTextBlock } from '../../src/types/connectorText.js'
import { isEmptyMessageText } from '../../src/utils/messages.js'

/**
 * 端到端复现 Message.tsx 的 AssistantMessageBlock 分支逻辑：
 *   if (feature('CONNECTOR_TEXT')) {
 *     if (isConnectorTextBlock(param)) { text = param.connector_text }
 *   }
 * 断言普通文本块（用户 hi 的回复）最终得到非空文本、可渲染。
 */
describe('端到端：普通文本块绕过 connector 分支后仍可渲染正文', () => {
  function resolveRenderedText(param: any): string | undefined {
    // 复刻 Message.tsx:454-462 的分支决策（feature 恒真时的最坏情形）
    if (isConnectorTextBlock(param)) {
      return (param as any).connector_text
    }
    return (param as any).text
  }

  it('用户 hi 的回复（type=text）不得走进 connector 分支，正文非空', () => {
    const param = { type: 'text', text: '你好！有什么需要我帮忙的？' }
    const rendered = resolveRenderedText(param)
    expect(rendered).toBe('你好！有什么需要我帮忙的？')
    // AssistantTextMessage 第 60 行：空文本会 return null（正文消失）
    expect(isEmptyMessageText(rendered!)).toBe(false)
  })

  it('纯英文单行回复同样不被误吞', () => {
    const param = { type: 'text', text: 'Hello, how can I help you?' }
    expect(isEmptyMessageText(resolveRenderedText(param)!)).toBe(false)
  })

  it('真正的 connector_text 块仍走 connector 分支', () => {
    const param = { type: 'connector_text', connector_text: '连接器内容' }
    const rendered = resolveRenderedText(param)
    expect(rendered).toBe('连接器内容')
    expect(isEmptyMessageText(rendered!)).toBe(false)
  })
})
