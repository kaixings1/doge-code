vi.spyOn(console, 'log').mockImplementation(() => {})

vi.spyOn(console, 'error').mockImplementation(() => {})

vi.spyOn(console, 'warn').mockImplementation(() => {})
import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/health-score/index'

describe('health-score', () => {
  describe('healthScore', () => {
      it('should be defined', () => { expect(mod.default).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.default).not.toBe(void 0) })
  })
})
