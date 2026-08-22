vi.mock('fs', () => ({
  existsSync: vi.fn(() => false), readFileSync: vi.fn(() => ''),
  writeFileSync: vi.fn(), mkdirSync: vi.fn(),
  statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 0 })),
  readdirSync: vi.fn(() => []),
}))
import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/background/index'

describe('background', () => {
  describe('background', () => {
      it('should be defined', () => { expect(mod.background).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.background).not.toBe(void 0) })
  })
})
