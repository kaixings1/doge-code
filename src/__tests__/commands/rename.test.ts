import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/rename/index'

describe('rename', () => {
  describe('rename', () => {
      it('should be defined', () => { expect(mod.rename).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.rename).not.toBe(void 0) })
  })
})
