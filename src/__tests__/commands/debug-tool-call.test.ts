import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/debug-tool-call/index'

describe('debug-tool-call', () => {
  describe('debugToolCall', () => {
      it('should be defined', () => { expect(mod.debugToolCall).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.debugToolCall).not.toBe(void 0) })
  })
})
