import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/glossary/index'

describe('glossary', () => {
  describe('glossary', () => {
      it('should be defined', () => { expect(mod.glossary).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.glossary).not.toBe(void 0) })
  })
})
