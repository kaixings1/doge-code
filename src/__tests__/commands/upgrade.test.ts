import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/upgrade/index'

describe('upgrade', () => {
  describe('upgrade', () => {
      it('should be defined', () => { expect(mod.upgrade).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.upgrade).not.toBe(void 0) })
  })
})
