vi.mock('fs', () => ({
  existsSync: vi.fn(() => false), readFileSync: vi.fn(() => ''),
  writeFileSync: vi.fn(), mkdirSync: vi.fn(),
  statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 0 })),
  readdirSync: vi.fn(() => []),
}))
import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/changelog-gen/index'

describe('changelog-gen', () => {
  describe('changelogGen', () => {
      it('should be defined', () => { expect(mod.changelogGen).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.changelogGen).not.toBe(void 0) })
  })
})
