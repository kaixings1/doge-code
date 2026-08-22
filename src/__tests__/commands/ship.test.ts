import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/ship/index'

describe('ship', () => {
  describe('ship', () => {
      it('should be defined', () => { expect(mod.ship).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.ship).not.toBe(void 0) })
  })
})
