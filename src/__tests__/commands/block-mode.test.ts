import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/block-mode/index'

describe('block-mode', () => {
  describe('blockMode', () => {
      it('should be defined', () => { expect(mod.default).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.default).not.toBe(void 0) })
  })
})
