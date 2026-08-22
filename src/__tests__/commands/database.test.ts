import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/database/index'

describe('database', () => {
  describe('database', () => {
      it('should be defined', () => { expect(mod.database).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.database).not.toBe(void 0) })
  })
})
