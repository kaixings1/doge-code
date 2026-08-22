import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/prompt-diff/index'

describe('prompt-diff', () => {
  describe('promptDiff', () => {
      it('should be defined', () => { expect(mod.promptDiff).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.promptDiff).not.toBe(void 0) })
  })
})
