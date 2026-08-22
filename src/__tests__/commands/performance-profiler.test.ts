import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/performance-profiler/index'

describe('performance-profiler', () => {
  describe('performance_profiler', () => {
      it('should be defined', () => { expect(mod.default).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.default).not.toBe(void 0) })
  })
})
