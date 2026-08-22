import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/tag/index'

describe('tag', () => {
  describe('tag', () => {
      it('should be defined', () => { expect(mod.tag).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.tag).not.toBe(void 0) })
  })
})
