import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/install-slack-app/index'

describe('install-slack-app', () => {
  describe('installSlackApp', () => {
      it('should be defined', () => { expect(mod.installSlackApp).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.installSlackApp).not.toBe(void 0) })
  })
})
