vi.mock('fs', () => ({
  existsSync: vi.fn(() => false), readFileSync: vi.fn(() => ''),
  writeFileSync: vi.fn(), mkdirSync: vi.fn(),
  statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 0 })),
  readdirSync: vi.fn(() => []),
}))

vi.mock('axios', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  get: vi.fn(), post: vi.fn(),
}))
import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/issue/index'

describe('issue', () => {
  describe('issue', () => {
      it('should be defined', () => { expect(mod.issue).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.issue).not.toBe(void 0) })
  })
})
