import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/rate-limit-options/index'

describe('rate-limit-options', () => {
  describe('rateLimitOptions', () => {
      it('should be defined', () => { expect(mod.rateLimitOptions).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.rateLimitOptions).not.toBe(void 0) })
  })
})
