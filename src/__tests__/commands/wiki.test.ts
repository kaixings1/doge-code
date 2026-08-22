vi.mock('fs', () => ({
  existsSync: vi.fn(() => false), readFileSync: vi.fn(() => ''),
  writeFileSync: vi.fn(), mkdirSync: vi.fn(),
  statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 0 })),
  readdirSync: vi.fn(() => []),
}))
import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/wiki/index'

describe('wiki', () => {
  describe('wiki', () => {
      it('should be defined', () => { expect(mod.wiki).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.wiki).not.toBe(void 0) })
  })
})
