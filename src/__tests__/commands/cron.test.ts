import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/cron/index'

describe('cron', () => {
  describe('cron', () => {
      it('should be defined', () => { expect(mod.cron).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.cron).not.toBe(void 0) })
  })
})
