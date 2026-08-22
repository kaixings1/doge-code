vi.mock('fs', () => ({
  existsSync: vi.fn(() => false), readFileSync: vi.fn(() => ''),
  writeFileSync: vi.fn(), mkdirSync: vi.fn(),
  statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 0 })),
  readdirSync: vi.fn(() => []),
}))
import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/blame/index'

describe('blame', () => {
  describe('blame', () => {
      it('should be defined', () => { expect(mod.blame).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.blame).not.toBe(void 0) })
  })
})
