import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/permissions/index'

describe('permissions', () => {
  describe('permissions', () => {
      it('should be defined', () => { expect(mod.permissions).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.permissions).not.toBe(void 0) })
  })
})
