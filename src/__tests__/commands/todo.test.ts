import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/todo/index'

describe('todo', () => {
  describe('todo', () => {
      it('should be defined', () => { expect(mod.todo).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.todo).not.toBe(void 0) })
  })
})
