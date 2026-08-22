import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/compare/index'

describe('compare', () => {
  describe('compare', () => {
      it('should be defined', () => { expect(mod.compare).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.compare).not.toBe(void 0) })
  })
})
