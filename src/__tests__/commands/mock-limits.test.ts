import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/mock-limits/index'

describe('mock-limits', () => {
  describe('mockLimits', () => {
      it('should be defined', () => { expect(mod.mockLimits).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.mockLimits).not.toBe(void 0) })
  })
})
