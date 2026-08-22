import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/file-watcher/index'

describe('file-watcher', () => {
  describe('fileWatcher', () => {
      it('should be defined', () => { expect(mod.default).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.default).not.toBe(void 0) })
  })
})
