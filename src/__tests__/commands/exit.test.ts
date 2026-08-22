import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/exit/index'

describe('exit', () => {
  describe('exit', () => {
      it('should be defined', () => { expect(mod.exit).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.exit).not.toBe(void 0) })
  })
})
