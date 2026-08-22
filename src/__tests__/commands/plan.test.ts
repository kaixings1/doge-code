import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/plan/index'

describe('plan', () => {
  describe('plan', () => {
      it('should be defined', () => { expect(mod.plan).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.plan).not.toBe(void 0) })
  })
})
