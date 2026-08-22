import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/remote-setup/index'

describe('remote-setup', () => {
  describe('web', () => {
      it('should be defined', () => { expect(mod.web).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.web).not.toBe(void 0) })
  })
})
