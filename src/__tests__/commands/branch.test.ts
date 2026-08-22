import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/branch/index'

describe('branch', () => {
  describe('branch', () => {
      it('should be defined', () => { expect(mod.branch).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.branch).not.toBe(void 0) })
  })
})
