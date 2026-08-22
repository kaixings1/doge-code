import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/share/index'

describe('share', () => {
  describe('share', () => {
      it('should be defined', () => { expect(mod.share).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.share).not.toBe(void 0) })
  })
})
