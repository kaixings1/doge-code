import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/context/index'

describe('context', () => {
  it('module should load', async () => {
    const m = await import('./../../commands/context/index')
    expect(m).toBeDefined()
  })
})
