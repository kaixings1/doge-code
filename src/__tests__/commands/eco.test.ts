import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/eco/index'

describe('eco', () => {
  describe('eco', () => {
      it('should be defined', () => { expect(mod.eco).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.eco).not.toBe(void 0) })
  })
})
