import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/team-onboarding/index'

describe('team-onboarding', () => {
  describe('teamOnboarding', () => {
      it('should be defined', () => { expect(mod.teamOnboarding).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.teamOnboarding).not.toBe(void 0) })
  })
})
