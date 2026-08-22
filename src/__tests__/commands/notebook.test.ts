import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/notebook/index'

describe('notebook', () => {
  describe('notebook', () => {
      it('should be defined', () => { expect(mod.notebook).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.notebook).not.toBe(void 0) })
  })
})
