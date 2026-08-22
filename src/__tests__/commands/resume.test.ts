import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/resume/index'

describe('resume', () => {
  describe('resume', () => {
      it('should be defined', () => { expect(mod.resume).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.resume).not.toBe(void 0) })
  })
})
