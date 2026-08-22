import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/hooks/index'

describe('hooks', () => {
  describe('hooks', () => {
      it('should be defined', () => { expect(mod.hooks).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.hooks).not.toBe(void 0) })
  })
})
