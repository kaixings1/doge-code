import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/heapdump/index'

describe('heapdump', () => {
  describe('heapDump', () => {
      it('should be defined', () => { expect(mod.heapDump).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.heapDump).not.toBe(void 0) })
  })
})
