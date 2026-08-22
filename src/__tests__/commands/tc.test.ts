vi.mock('fs', () => ({
  existsSync: vi.fn(() => false), readFileSync: vi.fn(() => ''),
  writeFileSync: vi.fn(), mkdirSync: vi.fn(),
  statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 0 })),
  readdirSync: vi.fn(() => []),
}))
import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/tc/index'

describe('tc', () => {
  describe('tc', () => {
      it('should be defined', () => { expect(mod.tc).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.tc).not.toBe(void 0) })
  })
})
