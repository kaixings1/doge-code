import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/skills/index'

describe('skills', () => {
  describe('skills', () => {
      it('should be defined', () => { expect(mod.skills).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.skills).not.toBe(void 0) })
  })
})
