import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/changelog/index'

describe('changelog', () => {
  describe('changelog', () => {
      it('should be defined', () => { expect(mod.changelog).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.changelog).not.toBe(void 0) })
  })
})
