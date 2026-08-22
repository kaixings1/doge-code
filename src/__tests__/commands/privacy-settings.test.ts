import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/privacy-settings/index'

describe('privacy-settings', () => {
  describe('privacySettings', () => {
      it('should be defined', () => { expect(mod.privacySettings).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.privacySettings).not.toBe(void 0) })
  })
})
