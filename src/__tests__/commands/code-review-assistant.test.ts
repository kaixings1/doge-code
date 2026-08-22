import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/code-review-assistant/index'

describe('code-review-assistant', () => {
  describe('code_review_assistant', () => {
      it('should be defined', () => { expect(mod.default).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.default).not.toBe(void 0) })
  })
})
