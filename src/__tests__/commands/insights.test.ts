import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/insights/index'

describe('insights', () => {
  describe('insights', () => {
      it('should be defined', () => { expect(mod.insights).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.insights).not.toBe(void 0) })
  })
})
