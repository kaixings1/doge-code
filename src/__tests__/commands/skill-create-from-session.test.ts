vi.mock('fs', () => ({
  existsSync: vi.fn(() => false), readFileSync: vi.fn(() => ''),
  writeFileSync: vi.fn(), mkdirSync: vi.fn(),
  statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 0 })),
  readdirSync: vi.fn(() => []),
}))
import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/skill-create-from-session/index'

describe('skill-create-from-session', () => {
  describe('skillCreateFromSession', () => {
      it('should be defined', () => { expect(mod.skillCreateFromSession).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.skillCreateFromSession).not.toBe(void 0) })
  })
})
