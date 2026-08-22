import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/voice/index'

describe('voice', () => {
  describe('voice', () => {
      it('should be defined', () => { expect(mod.voice).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.voice).not.toBe(void 0) })
  })
})
