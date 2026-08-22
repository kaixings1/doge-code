import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/add-dir/index'

describe('add-dir', () => {
  describe('addDir', () => {
      it('should be defined', () => { expect(mod.addDir).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.addDir).not.toBe(void 0) })
  })
})
