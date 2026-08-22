import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/rag/index'

describe('rag', () => {
  describe('ragCommand', () => {
      it('should be defined', () => { expect(mod.ragCommand).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.ragCommand).not.toBe(void 0) })
  })
})
