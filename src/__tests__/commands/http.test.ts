import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/http/index'

describe('http', () => {
  describe('http', () => {
      it('should be defined', () => { expect(mod.http).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.http).not.toBe(void 0) })
  })
})
