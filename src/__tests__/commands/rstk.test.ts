import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/rstk/index'

describe('rstk', () => {
  describe('rstk', () => {
      it('should be defined', () => { expect(mod.rstk).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.rstk).not.toBe(void 0) })
  })
})
