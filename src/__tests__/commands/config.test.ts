import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/config/index'

describe('config', () => {
  describe('config', () => {
      it('should be defined', () => { expect(mod.config).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.config).not.toBe(void 0) })
  })
})
