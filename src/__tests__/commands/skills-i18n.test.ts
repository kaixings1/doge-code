import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/skills-i18n/index'

describe('skills-i18n', () => {
  describe('skillsI18n', () => {
      it('should be defined', () => { expect(mod.skillsI18n).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.skillsI18n).not.toBe(void 0) })
  })
})
