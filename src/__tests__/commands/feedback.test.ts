import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/feedback/index'

describe('feedback', () => {
  describe('feedback', () => {
      it('should be defined', () => { expect(mod.feedback).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.feedback).not.toBe(void 0) })
  })
})
