vi.mock('fs', () => ({
  existsSync: vi.fn(() => false), readFileSync: vi.fn(() => ''),
  writeFileSync: vi.fn(), mkdirSync: vi.fn(),
  statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 0 })),
  readdirSync: vi.fn(() => []),
}))
import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/clone-all-1500/index'

describe('clone-all-1500', () => {
  describe('cloneAll', () => {
      it('should be defined', () => { expect(mod.cloneAll).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.cloneAll).not.toBe(void 0) })
  })
})
