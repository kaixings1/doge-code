import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/snapshot/index'

describe('snapshot', () => {
  describe('snapshot', () => {
      it('should be defined', () => { expect(mod.snapshot).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.snapshot).not.toBe(void 0) })
  })
})
