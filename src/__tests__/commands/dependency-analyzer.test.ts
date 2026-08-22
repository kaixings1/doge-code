import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/dependency-analyzer/index'

describe('dependency-analyzer', () => {
  describe('dependency_analyzer', () => {
      it('should be defined', () => { expect(mod.dependency_analyzer).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.dependency_analyzer).not.toBe(void 0) })
  })
})
