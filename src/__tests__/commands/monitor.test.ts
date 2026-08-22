import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/monitor/index'

describe('monitor', () => {
  describe('monitor', () => {
      it('should be defined', () => { expect(mod.monitor).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.monitor).not.toBe(void 0) })
  })
})
