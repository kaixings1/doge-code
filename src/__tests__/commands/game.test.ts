import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/game/index'

describe('game', () => {
  describe('game', () => {
      it('should be defined', () => { expect(mod.game).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.game).not.toBe(void 0) })
  })
})
