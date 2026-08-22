import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/code-review-assistant/index'

describe('code-review-assistant', () => {
  describe('code_review_assistant', () => {
      it('should be defined', () => { expect(mod.code_review_assistant).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.code_review_assistant).not.toBe(void 0) })
  })
})
