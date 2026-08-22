import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/documentation-index/index'

describe('documentation-index', () => {
  describe('documentationIndex', () => {
      it('should be defined', () => { expect(mod.documentationIndex).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.documentationIndex).not.toBe(void 0) })
  })
})
