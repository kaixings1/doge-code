import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/loop-dashboard/index'

describe('loop-dashboard', () => {
  describe('loopDashboard', () => {
      it('should be defined', () => { expect(mod.loopDashboard).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.loopDashboard).not.toBe(void 0) })
  })
})
