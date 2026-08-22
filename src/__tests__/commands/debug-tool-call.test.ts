import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/debug-tool-call/index'

describe('debug-tool-call', () => {
  describe('debugToolCall', () => {
      it('should be defined', () => { expect(mod.default).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.default).not.toBe(void 0) })
  })
})
