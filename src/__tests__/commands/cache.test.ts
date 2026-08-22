import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/cache/index'

describe('cache', () => {
  describe('cache', () => {
      it('should be defined', () => { expect(mod.cache).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.cache).not.toBe(void 0) })
  })
})
