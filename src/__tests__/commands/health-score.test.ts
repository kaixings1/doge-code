vi.spyOn(console, 'log').mockImplementation(() => {})

vi.spyOn(console, 'error').mockImplementation(() => {})

vi.spyOn(console, 'warn').mockImplementation(() => {})
import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/health-score/index'

describe('health-score', () => {
  describe('healthScore', () => {
      it('should be defined', () => { expect(mod.healthScore).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.healthScore).not.toBe(void 0) })
  })
})
