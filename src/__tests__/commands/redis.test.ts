import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/redis/index'

describe('redis', () => {
  describe('cmd', () => {
      it('should be defined', () => { expect(mod.cmd).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.cmd).not.toBe(void 0) })
  })
})
