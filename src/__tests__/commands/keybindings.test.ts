import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/keybindings/index'

describe('keybindings', () => {
  describe('keybindings', () => {
      it('should be defined', () => { expect(mod.keybindings).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.keybindings).not.toBe(void 0) })
  })
})
