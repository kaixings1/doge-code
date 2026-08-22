import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/schedule/index'

describe('schedule', () => {
  describe('schedule', () => {
      it('should be defined', () => { expect(mod.schedule).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.schedule).not.toBe(void 0) })
  })
})
