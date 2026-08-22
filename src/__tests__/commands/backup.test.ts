import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/backup/index'

describe('backup', () => {
  describe('backup', () => {
      it('should be defined', () => { expect(mod.backup).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.backup).not.toBe(void 0) })
  })
})
