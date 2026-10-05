import { describe, it, expect } from 'vitest'
import { isConnectorTextBlock } from '../../src/types/connectorText.js'

describe('isConnectorTextBlock 判据精确性（connector-text-guard）', () => {
  it('普通文本块（type=text）不得被误判为连接器文本块', () => {
    // 回归：此前判据是 `'text' in value`，普通文本块含 text 字段 →
    // 被误判 → 取不存在的 connector_text → 正文渲染为 null（正文消失）。
    expect(isConnectorTextBlock({ type: 'text', text: '你好！有什么需要我帮忙的？' })).toBe(false)
  })

  it('空字符串文本块也不得被误判', () => {
    expect(isConnectorTextBlock({ type: 'text', text: '' })).toBe(false)
  })

  it('真正的连接器文本块（type=connector_text）必须被识别', () => {
    expect(isConnectorTextBlock({ type: 'connector_text', connector_text: '连接器内容' })).toBe(true)
  })

  it('其它类型块与非法值一律为 false', () => {
    expect(isConnectorTextBlock({ type: 'thinking', thinking: 'x' })).toBe(false)
    expect(isConnectorTextBlock({ type: 'tool_use', id: 'x' })).toBe(false)
    expect(isConnectorTextBlock(null)).toBe(false)
    expect(isConnectorTextBlock(undefined)).toBe(false)
    expect(isConnectorTextBlock('text')).toBe(false)
  })
})
