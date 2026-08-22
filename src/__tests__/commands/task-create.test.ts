import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/task-create/index'

describe('task-create', () => {
  describe('taskCreate', () => {
      it('should be defined', () => { expect(mod.taskCreate).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.taskCreate).not.toBe(void 0) })
  })
})
