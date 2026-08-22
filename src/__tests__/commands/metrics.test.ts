import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/metrics/index'

describe('metrics', () => {
  describe('metrics', () => {
      it('should be defined', () => { expect(mod.metrics).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.metrics).not.toBe(void 0) })
  })
})
