import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/stats/index'

describe('stats', () => {
  describe('stats', () => {
      it('should be defined', () => { expect(mod.stats).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.stats).not.toBe(void 0) })
  })
})
