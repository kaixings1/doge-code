import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/block-mode/index'

describe('block-mode', () => {
  describe('blockMode', () => {
      it('should be defined', () => { expect(mod.blockMode).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.blockMode).not.toBe(void 0) })
  })
})
