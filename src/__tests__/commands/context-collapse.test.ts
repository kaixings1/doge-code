import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/context-collapse/index'

describe('context-collapse', () => {
  describe('contextCollapse', () => {
      it('should be defined', () => { expect(mod.contextCollapse).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.contextCollapse).not.toBe(void 0) })
  })
})
