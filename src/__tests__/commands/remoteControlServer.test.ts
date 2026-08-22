import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/remoteControlServer/index'

describe('remoteControlServer', () => {
  it('module should load', async () => {
    const m = await import('./../../commands/remoteControlServer/index')
    expect(m).toBeDefined()
  })
})
