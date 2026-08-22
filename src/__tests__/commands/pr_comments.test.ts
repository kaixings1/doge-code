import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/pr_comments/index'

describe('pr_comments', () => {
  describe('createMovedToPluginCommand', () => {
      it('should be defined', () => { expect(mod.createMovedToPluginCommand).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.createMovedToPluginCommand).not.toBe(void 0) })
  })
})
