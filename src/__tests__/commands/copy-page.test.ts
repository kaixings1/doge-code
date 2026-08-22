import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/copy-page/index'

describe('copy-page', () => {
  describe('copyPage', () => {
      it('should be defined', () => { expect(mod.copyPage).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.copyPage).not.toBe(void 0) })
  })
})
