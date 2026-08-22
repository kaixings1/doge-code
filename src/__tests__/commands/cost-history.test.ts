import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/cost-history/index'

describe('cost-history', () => {
  describe('costHistory', () => {
      it('should be defined', () => { expect(mod.costHistory).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.costHistory).not.toBe(void 0) })
  })
})
