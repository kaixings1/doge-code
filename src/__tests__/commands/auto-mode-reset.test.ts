import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/auto-mode-reset/index'

describe('auto-mode-reset', () => {
  describe('autoModeReset', () => {
      it('should be defined', () => { expect(mod.autoModeReset).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.autoModeReset).not.toBe(void 0) })
  })
})
