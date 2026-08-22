import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/session/index'

describe('session', () => {
  describe('session', () => {
      it('should be defined', () => { expect(mod.session).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.session).not.toBe(void 0) })
  })
})
