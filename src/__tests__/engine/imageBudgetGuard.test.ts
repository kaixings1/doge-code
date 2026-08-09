import { describe, it, expect } from 'vitest'
import type { InternalMessage } from '../../engine/messageNormalizer.js'
import {
  cleanupHistoryBase64,
  applyPhase2Degradation,
  checkImageBudget,
  degradeImageIfNeeded,
  DEFAULT_IMAGE_BUDGET_CONFIG,
} from '../../engine/imageBudgetGuard.js'

// ─── 测试辅助：构造结构化图片块消息 ───

function imageBlock(data: string): { type: 'image'; source: { type: 'base64'; data: string } } {
  return { type: 'image', source: { type: 'base64', data } }
}

function msgWithBlocks(blocks: unknown[]): InternalMessage {
  return { role: 'user', content: blocks as InternalMessage['content'] }
}

function msgWithString(content: string): InternalMessage {
  return { role: 'user', content }
}

const BIG_B64 = 'A'.repeat(60_000) // 60KB base64 → 超过 50KB 阈值
const SMALL_B64 = 'B'.repeat(1_000) // 1KB base64

describe('cleanupHistoryBase64', () => {
  it('结构化图片块：超过阈值时替换为文本占位', () => {
    const messages = [msgWithBlocks([{ type: 'text', text: 'hi' }, imageBlock(BIG_B64)])]
    const { messages: cleaned, clearedCount } = cleanupHistoryBase64(messages)

    expect(clearedCount).toBe(1)
    const blocks = cleaned[0]!.content as Array<Record<string, unknown>>
    expect(blocks[0]!.type).toBe('text')
    expect(blocks[1]!.type).toBe('text')
    expect((blocks[1]!.text as string)).toContain('图片已外部化')
  })

  it('结构化图片块：低于阈值时保留不动', () => {
    const messages = [msgWithBlocks([imageBlock(SMALL_B64)])]
    const { messages: cleaned, clearedCount } = cleanupHistoryBase64(messages)

    expect(clearedCount).toBe(0)
    const blocks = cleaned[0]!.content as Array<Record<string, unknown>>
    expect(blocks[0]!.type).toBe('image')
  })

  it('内联字符串：超过阈值时替换为引用标记', () => {
    const content = `看这张图 data:image/png;base64,${BIG_B64} 很清晰`
    const { messages: cleaned, clearedCount } = cleanupHistoryBase64([msgWithString(content)])

    expect(clearedCount).toBe(1)
    const cleanedStr = cleaned[0]!.content as string
    expect(cleanedStr).toContain('图片已外部化')
    expect(cleanedStr).not.toContain('data:image/png')
  })

  it('内联字符串：低于阈值时保留', () => {
    const content = `data:image/png;base64,${SMALL_B64}`
    const { messages: cleaned, clearedCount } = cleanupHistoryBase64([msgWithString(content)])

    expect(clearedCount).toBe(0)
    expect(cleaned[0]!.content as string).toBe(content)
  })

  it('无图片消息原样返回', () => {
    const messages: InternalMessage[] = [{ role: 'user', content: '纯文本' }]
    const { messages: cleaned, clearedCount } = cleanupHistoryBase64(messages)

    expect(clearedCount).toBe(0)
    expect(cleaned).toEqual(messages)
  })
})

describe('applyPhase2Degradation', () => {
  // 两张 8KB 图解码后各 6KB，总 12KB > 10KB 预算 → 触发降级
  const tightConfig = { ...DEFAULT_IMAGE_BUDGET_CONFIG, maxTotalImageBytes: 10_000 }

  it('总预算内不降级', () => {
    const messages = [msgWithBlocks([imageBlock(SMALL_B64)])]
    const { messages: out, degraded } = applyPhase2Degradation(messages, tightConfig)

    expect(degraded).toHaveLength(0)
    expect((out[0]!.content as Array<Record<string, unknown>>)[0]!.type).toBe('image')
  })

  it('超预算时从最新图片开始降级为文本占位', () => {
    const oldMsg = msgWithBlocks([imageBlock('C'.repeat(8_000))])
    const newMsg = msgWithBlocks([imageBlock('D'.repeat(8_000))])
    const { messages: out, degraded } = applyPhase2Degradation([oldMsg, newMsg], tightConfig)

    expect(degraded.length).toBeGreaterThan(0)
    // 最新消息的图片应被降级
    const newBlocks = out[1]!.content as Array<Record<string, unknown>>
    expect(newBlocks[0]!.type).toBe('text')
    expect((newBlocks[0]!.text as string)).toContain('图片预算保护')
  })

  it('内联字符串超预算时降级为占位', () => {
    const content = `图一 data:image/png;base64,${'E'.repeat(8_000)} 图二 data:image/jpeg;base64,${'F'.repeat(8_000)}`
    const { messages: out, degraded } = applyPhase2Degradation([msgWithString(content)], tightConfig)

    expect(degraded.length).toBeGreaterThan(0)
    const cleanedStr = out[0]!.content as string
    // 最新图片（图二）被降级为占位；预算降至 80% 后停止，图一保留
    expect(cleanedStr).toContain('图片预算保护')
    expect(cleanedStr).toContain('图一 data:image/png')
  })
})

describe('degradeImageIfNeeded', () => {
  it('预算内返回 none', () => {
    const d = degradeImageIfNeeded(1_000, 0, { ...DEFAULT_IMAGE_BUDGET_CONFIG, maxTotalImageBytes: 10_000 })
    expect(d.action).toBe('none')
  })

  it('超过单张上限建议缩放', () => {
    const cfg = { ...DEFAULT_IMAGE_BUDGET_CONFIG, maxSingleImageBytes: 1_000 }
    const d = degradeImageIfNeeded(2_000, 0, cfg)
    expect(d.action).toBe('resize')
  })

  it('严重超预算时移除', () => {
    const cfg = { ...DEFAULT_IMAGE_BUDGET_CONFIG, maxTotalImageBytes: 500 }
    const d = degradeImageIfNeeded(10_000, 0, cfg)
    expect(d.action).toBe('remove')
  })
})

describe('checkImageBudget', () => {
  it('多图超并发限制时 withinBudget=false', () => {
    const messages = [
      msgWithBlocks([imageBlock(SMALL_B64)]),
      msgWithBlocks([imageBlock(SMALL_B64)]),
      msgWithBlocks([imageBlock(SMALL_B64)]),
      msgWithBlocks([imageBlock(SMALL_B64)]),
      msgWithBlocks([imageBlock(SMALL_B64)]),
      msgWithBlocks([imageBlock(SMALL_B64)]),
    ]
    const result = checkImageBudget(messages)

    expect(result.imageCount).toBe(6)
    expect(result.withinBudget).toBe(false)
    expect(result.action).not.toBe('none')
  })

  it('干净消息 withinBudget=true action=none', () => {
    const result = checkImageBudget([{ role: 'user', content: 'hello' }])
    expect(result.withinBudget).toBe(true)
    expect(result.action).toBe('none')
  })
})
