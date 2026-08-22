import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/mobile/index'

describe('mobile', () => {
  describe('mobile', () => {
      it('should be defined', () => { expect(mod.mobile).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.mobile).not.toBe(void 0) })
  })
})
