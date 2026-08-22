import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/memory-monitor/index'

describe('memory-monitor', () => {
  describe('memory_monitor', () => {
      it('should be defined', () => { expect(mod.memory_monitor).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.memory_monitor).not.toBe(void 0) })
  })
})
