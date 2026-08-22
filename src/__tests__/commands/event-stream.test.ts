import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/event-stream/index'

describe('event-stream', () => {
  describe('eventStream', () => {
      it('should be defined', () => { expect(mod.eventStream).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.eventStream).not.toBe(void 0) })
  })
})
