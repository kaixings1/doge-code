import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/stickers/index'

describe('stickers', () => {
  describe('stickers', () => {
      it('should be defined', () => { expect(mod.stickers).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.stickers).not.toBe(void 0) })
  })
})
