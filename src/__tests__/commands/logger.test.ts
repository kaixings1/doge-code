import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/logger/index'

describe('logger', () => {
  describe('logger', () => {
      it('should be defined', () => { expect(mod.logger).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.logger).not.toBe(void 0) })
  })
})
