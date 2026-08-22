import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/extra-usage/index'

describe('extra-usage', () => {
  describe('extraUsage', () => {
      it('should be defined', () => { expect(mod.extraUsage).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.extraUsage).not.toBe(void 0) })
  })

  describe('extraUsageNonInteractive', () => {
      it('should be defined', () => { expect(mod.extraUsageNonInteractive).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.extraUsageNonInteractive).not.toBe(void 0) })
  })
})
