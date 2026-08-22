import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/output-style/index'

describe('output-style', () => {
  describe('outputStyle', () => {
      it('should be defined', () => { expect(mod.outputStyle).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.outputStyle).not.toBe(void 0) })
  })
})
