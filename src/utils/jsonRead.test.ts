import { describe, it, expect } from 'vitest'
import { stripBOM } from './jsonRead.ts'

describe('stripBOM', () => {
  it('带 BOM 的 JSON 去除后可解析（真实崩溃场景：PowerShell 写入的 api.json/ten.json）', () => {
    const withBom = '\uFEFF{"activePreset":"ten","presets":{"ten":{"provider":"openai"}}}'
    expect(() => JSON.parse(stripBOM(withBom))).not.toThrow()
    expect(JSON.parse(stripBOM(withBom)).activePreset).toBe('ten')
  })

  it('无 BOM 内容保持不变', () => {
    expect(stripBOM('{"a":1}')).toBe('{"a":1}')
  })

  it('只移除开头一个 BOM，保留下文', () => {
    expect(stripBOM('\uFEFF{"a":1}')).toBe('{"a":1}')
    expect(stripBOM('{"a":"\uFEFF"}')).toBe('{"a":"\uFEFF"}')
  })

  it('空字符串安全', () => {
    expect(stripBOM('')).toBe('')
  })
})
