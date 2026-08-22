vi.mock('fs', () => ({
  existsSync: vi.fn(() => false), readFileSync: vi.fn(() => ''),
  writeFileSync: vi.fn(), mkdirSync: vi.fn(),
  statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 0 })),
  readdirSync: vi.fn(() => []),
}))
import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/custom-cmd/index'

describe('custom-cmd', () => {
  describe('customCmd', () => {
      it('should be defined', () => { expect(mod.customCmd).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.customCmd).not.toBe(void 0) })
  })
})
