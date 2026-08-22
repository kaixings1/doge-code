import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/plugin/index'

describe('plugin', () => {
  describe('plugin', () => {
      it('should be defined', () => { expect(mod.plugin).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.plugin).not.toBe(void 0) })
  })
})
