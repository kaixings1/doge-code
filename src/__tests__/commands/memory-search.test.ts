vi.mock('fs', () => ({
  existsSync: vi.fn(() => false), readFileSync: vi.fn(() => ''),
  writeFileSync: vi.fn(), mkdirSync: vi.fn(),
  statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 0 })),
  readdirSync: vi.fn(() => []),
}))
import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/memory-search/index'

describe('memory-search', () => {
  describe('memorySearch', () => {
      it('should be defined', () => { expect(mod.memorySearch).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.memorySearch).not.toBe(void 0) })
  })
})
