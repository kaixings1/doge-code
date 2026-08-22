import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/fork/index'

describe('fork', () => {
  describe('fork', () => {
      it('should be defined', () => { expect(mod.fork).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.fork).not.toBe(void 0) })
  })
})
