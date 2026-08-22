import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/ide/index'

describe('ide', () => {
  describe('ide', () => {
      it('should be defined', () => { expect(mod.ide).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.ide).not.toBe(void 0) })
  })
})
