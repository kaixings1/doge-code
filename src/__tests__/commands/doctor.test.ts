import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/doctor/index'

describe('doctor', () => {
  describe('doctor', () => {
      it('should be defined', () => { expect(mod.doctor).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.doctor).not.toBe(void 0) })
  })
})
