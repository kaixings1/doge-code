import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/shell/index'

describe('shell', () => {
  describe('shell', () => {
      it('should be defined', () => { expect(mod.shell).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.shell).not.toBe(void 0) })
  })
})
