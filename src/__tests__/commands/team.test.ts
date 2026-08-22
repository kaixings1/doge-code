import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/team/index'

describe('team', () => {
  describe('team', () => {
      it('should be defined', () => { expect(mod.team).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.team).not.toBe(void 0) })
  })
})
