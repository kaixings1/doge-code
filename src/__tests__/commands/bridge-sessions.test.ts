vi.spyOn(console, 'log').mockImplementation(() => {})

vi.spyOn(console, 'error').mockImplementation(() => {})

vi.spyOn(console, 'warn').mockImplementation(() => {})
import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/bridge-sessions/index'

describe('bridge-sessions', () => {
  describe('bridgeSessions', () => {
      it('should be defined', () => { expect(mod.bridgeSessions).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.bridgeSessions).not.toBe(void 0) })
  })
})
