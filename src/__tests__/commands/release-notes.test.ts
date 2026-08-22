import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/release-notes/index'

describe('release-notes', () => {
  describe('releaseNotes', () => {
      it('should be defined', () => { expect(mod.releaseNotes).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.releaseNotes).not.toBe(void 0) })
  })
})
