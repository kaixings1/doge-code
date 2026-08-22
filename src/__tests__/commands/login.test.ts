import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/login/index'

describe('login', () => {
  it('module should load', async () => {
    const m = await import('./../../commands/login/index')
    expect(m).toBeDefined()
  })
})
