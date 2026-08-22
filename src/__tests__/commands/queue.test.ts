import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/queue/index'

describe('queue', () => {
  describe('queue', () => {
      it('should be defined', () => { expect(mod.queue).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.queue).not.toBe(void 0) })
  })
})
