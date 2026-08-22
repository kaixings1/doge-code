import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/compact/index'

describe('compact', () => {
  describe('compact', () => {
      it('should be defined', () => { expect(mod.compact).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.compact).not.toBe(void 0) })
  })
})
