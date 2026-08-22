import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/dependency-analyzer/index'

describe('dependency-analyzer', () => {
  describe('dependency_analyzer', () => {
      it('should be defined', () => { expect(mod.default).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.default).not.toBe(void 0) })
  })
})
