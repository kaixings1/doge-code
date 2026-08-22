import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/skills-i18n/index'

describe('skills-i18n', () => {
  describe('skillsI18n', () => {
      it('should be defined', () => { expect(mod.default).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.default).not.toBe(void 0) })
  })
})
