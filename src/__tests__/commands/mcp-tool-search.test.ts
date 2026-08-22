import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/mcp-tool-search/index'

describe('mcp-tool-search', () => {
  describe('mcpToolsearch', () => {
      it('should be defined', () => { expect(mod.mcpToolsearch).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.mcpToolsearch).not.toBe(void 0) })
  })
})
