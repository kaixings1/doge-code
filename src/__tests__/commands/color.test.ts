import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/color/index'

describe('color', () => {
  describe('color', () => {
      it('should be defined', () => { expect(mod.color).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.color).not.toBe(void 0) })
  })
})
