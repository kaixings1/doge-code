import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/contributors/index'

describe('contributors', () => {
  describe('contributors', () => {
      it('should be defined', () => { expect(mod.contributors).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.contributors).not.toBe(void 0) })
  })
})
