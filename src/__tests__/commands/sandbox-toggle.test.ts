import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/sandbox-toggle/index'

describe('sandbox-toggle', () => {
  describe('command', () => {
      it('should be defined', () => { expect(mod.command).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.command).not.toBe(void 0) })
  })
})
