import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/terminalSetup/index'

describe('terminalSetup', () => {
  describe('terminalSetup', () => {
      it('should be defined', () => { expect(mod.terminalSetup).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.terminalSetup).not.toBe(void 0) })
  })
})
