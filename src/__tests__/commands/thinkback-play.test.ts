import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/thinkback-play/index'

describe('thinkback-play', () => {
  describe('thinkbackPlay', () => {
      it('should be defined', () => { expect(mod.thinkbackPlay).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.thinkbackPlay).not.toBe(void 0) })
  })
})
