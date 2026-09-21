import { describe, it, expect, vi } from 'vitest'
import moduleDef from './../../commands/summary/index'

describe('summary', () => {
  it('command should be defined', () => {
    expect(moduleDef).toBeDefined()
    expect(moduleDef.name).toBe('summary')
  })

  it('load returns call function', () => {
    expect(typeof moduleDef.load).toBe('function')
  })

  it('empty args shows summary help', async () => {
    const m = await moduleDef.load()
    const result = await m.call('', null as any)
    const text = result.type === 'text' ? result.value : ''
    expect(text).toContain('会话摘要')
  })
})
