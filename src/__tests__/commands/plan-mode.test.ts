import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/plan-mode/index'

describe('plan-mode', () => {
  describe('planMode', () => {
      it('should be defined', () => { expect(mod.planMode).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.planMode).not.toBe(void 0) })
  })
})
