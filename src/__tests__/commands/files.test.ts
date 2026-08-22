import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/files/index'

describe('files', () => {
  describe('files', () => {
      it('should be defined', () => { expect(mod.files).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.files).not.toBe(void 0) })
  })
})
