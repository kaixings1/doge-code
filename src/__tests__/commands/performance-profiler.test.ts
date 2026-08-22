import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/performance-profiler/index'

describe('performance-profiler', () => {
  describe('performance_profiler', () => {
      it('should be defined', () => { expect(mod.performance_profiler).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.performance_profiler).not.toBe(void 0) })
  })
})
