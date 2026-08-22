import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/desktop/index'

describe('desktop', () => {
  describe('desktop', () => {
      it('should be defined', () => { expect(mod.desktop).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.desktop).not.toBe(void 0) })
  })
})
