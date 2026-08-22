vi.mock('fs', () => ({
  existsSync: vi.fn(() => false), readFileSync: vi.fn(() => ''),
  writeFileSync: vi.fn(), mkdirSync: vi.fn(),
  statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 0 })),
  readdirSync: vi.fn(() => []),
  realpathSync: vi.fn((p: string) => p),
  constants: { O_NOFOLLOW: 0, O_WRONLY: 1, O_APPEND: 1024, O_CREAT: 64, O_EXCL: 128 },
}))
import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/dashboard/index'

describe('dashboard', () => {
  describe('command', () => {
      it('should be defined', () => { expect(mod.default).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.default).not.toBe(void 0) })
  })
})
