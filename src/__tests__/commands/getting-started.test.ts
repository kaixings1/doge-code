import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/getting-started/index'

describe('getting-started', () => {
  describe('gettingStarted', () => {
      it('should be defined', () => { expect(mod.gettingStarted).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.gettingStarted).not.toBe(void 0) })
  })
})
