import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/websocket/index'

describe('websocket', () => {
  describe('websocket', () => {
      it('should be defined', () => { expect(mod.websocket).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.websocket).not.toBe(void 0) })
  })
})
