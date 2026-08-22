import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/buddy/index'

describe('buddy', () => {
  describe('buddy', () => {
      it('should be defined', () => { expect(mod.buddy).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.buddy).not.toBe(void 0) })
  })
})
