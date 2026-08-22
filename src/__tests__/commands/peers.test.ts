import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/peers/index'

describe('peers', () => {
  describe('peers', () => {
      it('should be defined', () => { expect(mod.peers).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.peers).not.toBe(void 0) })
  })
})
