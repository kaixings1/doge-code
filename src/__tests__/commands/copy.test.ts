import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/copy/index'

describe('copy', () => {
  describe('copy', () => {
      it('should be defined', () => { expect(mod.copy).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.copy).not.toBe(void 0) })
  })
})
