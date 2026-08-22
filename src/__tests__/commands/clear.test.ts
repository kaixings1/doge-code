import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/clear/index'

describe('clear', () => {
  describe('clear', () => {
      it('should be defined', () => { expect(mod.clear).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.clear).not.toBe(void 0) })
  })
})
