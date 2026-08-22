import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/diff-review/index'

describe('diff-review', () => {
  describe('diffReview', () => {
      it('should be defined', () => { expect(mod.diffReview).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.diffReview).not.toBe(void 0) })
  })
})
