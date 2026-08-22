import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/help/index'

describe('help', () => {
  describe('help', () => {
      it('should be defined', () => { expect(mod.help).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.help).not.toBe(void 0) })
  })
})
