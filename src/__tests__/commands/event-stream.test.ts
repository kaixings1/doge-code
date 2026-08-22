import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/event-stream/index'

describe('event-stream', () => {
  describe('eventStream', () => {
      it('should be defined', () => { expect(mod.default).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.default).not.toBe(void 0) })
  })
})
