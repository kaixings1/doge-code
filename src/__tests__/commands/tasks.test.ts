import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/tasks/index'

describe('tasks', () => {
  describe('tasks', () => {
      it('should be defined', () => { expect(mod.tasks).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.tasks).not.toBe(void 0) })
  })
})
