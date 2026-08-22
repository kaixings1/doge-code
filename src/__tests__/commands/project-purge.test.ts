import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/project-purge/index'

describe('project-purge', () => {
  describe('projectPurge', () => {
      it('should be defined', () => { expect(mod.projectPurge).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.projectPurge).not.toBe(void 0) })
  })
})
