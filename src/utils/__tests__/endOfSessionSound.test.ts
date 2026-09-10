import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

// 模拟 debug 模块避免副作用
vi.mock('../debug.js', () => ({
  logForDebugging: vi.fn(),
}))

// 测试环境变量驱动的声音配置逻辑
function getSoundConfig() {
  const raw = (process.env.CLAUDE_CODE_SESSION_END_SOUND ?? '').trim()
  if (!raw || raw === 'beep') return { mode: 'beep' }
  if (raw === 'none') return { mode: 'none' }
  if (raw.startsWith('mp3:')) return { mode: 'mp3', path: raw.slice(4) }
  if (raw.startsWith('wav:')) return { mode: 'wav', path: raw.slice(4) }
  return { mode: 'beep' }
}

describe('CLAUDE_CODE_SESSION_END_SOUND 配置', () => {
  const original = process.env.CLAUDE_CODE_SESSION_END_SOUND

  afterAll(() => {
    if (original === undefined) delete process.env.CLAUDE_CODE_SESSION_END_SOUND
    else process.env.CLAUDE_CODE_SESSION_END_SOUND = original
  })

  it('未设置时默认使用 beep', () => {
    delete process.env.CLAUDE_CODE_SESSION_END_SOUND
    expect(getSoundConfig()).toEqual({ mode: 'beep' })
  })

  it('beep 显式指定', () => {
    process.env.CLAUDE_CODE_SESSION_END_SOUND = 'beep'
    expect(getSoundConfig()).toEqual({ mode: 'beep' })
  })

  it('none 关闭声音', () => {
    process.env.CLAUDE_CODE_SESSION_END_SOUND = 'none'
    expect(getSoundConfig()).toEqual({ mode: 'none' })
  })

  it('mp3:<path> 解析路径', () => {
    process.env.CLAUDE_CODE_SESSION_END_SOUND = 'mp3:/tmp/sound.mp3'
    expect(getSoundConfig()).toEqual({ mode: 'mp3', path: '/tmp/sound.mp3' })
  })

  it('wav:<path> 解析路径', () => {
    process.env.CLAUDE_CODE_SESSION_END_SOUND = 'wav:/tmp/sound.wav'
    expect(getSoundConfig()).toEqual({ mode: 'wav', path: '/tmp/sound.wav' })
  })

  it('未知值回退到 beep', () => {
    process.env.CLAUDE_CODE_SESSION_END_SOUND = 'unknown'
    expect(getSoundConfig()).toEqual({ mode: 'beep' })
  })
})