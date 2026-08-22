import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/ports/index'

describe('ports', () => {
  describe('ports', () => {
      it('should be defined', () => { expect(mod.ports).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.ports).not.toBe(void 0) })
  })
})
