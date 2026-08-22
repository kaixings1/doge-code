import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/benchmark/index'

describe('benchmark', () => {
  describe('benchmark', () => {
      it('should be defined', () => { expect(mod.benchmark).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.benchmark).not.toBe(void 0) })
  })
})
