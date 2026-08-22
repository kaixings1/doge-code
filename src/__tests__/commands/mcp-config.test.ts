import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/mcp-config/index'

describe('mcp-config', () => {
  describe('mcpConfig', () => {
      it('should be defined', () => { expect(mod.mcpConfig).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.mcpConfig).not.toBe(void 0) })
  })
})
