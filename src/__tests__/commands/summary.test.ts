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
    const result = await m.call('')
    expect(result.type).toBe('text')
    expect(result.value).toContain('会话摘要')
  })
})
