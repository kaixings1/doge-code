import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/mcp/index'

describe('mcp', () => {
  describe('mcp', () => {
      it('should be defined', () => { expect(mod.mcp).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.mcp).not.toBe(void 0) })
  })
})
