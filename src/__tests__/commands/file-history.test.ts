vi.mock('fs', () => ({
  existsSync: vi.fn(() => false), readFileSync: vi.fn(() => ''),
  writeFileSync: vi.fn(), mkdirSync: vi.fn(),
  statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 0 })),
  readdirSync: vi.fn(() => []),
}))
import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/file-history/index'

describe('file-history', () => {
  describe('fileHistory', () => {
      it('should be defined', () => { expect(mod.fileHistory).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.fileHistory).not.toBe(void 0) })
  })
})
