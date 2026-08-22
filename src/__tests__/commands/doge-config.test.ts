import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/doge-config/index'

describe('doge-config', () => {
  describe('dogeConfig', () => {
      it('should be defined', () => { expect(mod.dogeConfig).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.dogeConfig).not.toBe(void 0) })
  })
})
