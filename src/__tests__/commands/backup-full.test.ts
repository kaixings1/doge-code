vi.mock('fs', () => ({
  existsSync: vi.fn(() => false), readFileSync: vi.fn(() => ''),
  writeFileSync: vi.fn(), mkdirSync: vi.fn(),
  statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 0 })),
  readdirSync: vi.fn(() => []),
}))
import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/backup-full/index'

describe('backup-full', () => {
  describe('backupFull', () => {
      it('should be defined', () => { expect(mod.backupFull).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.backupFull).not.toBe(void 0) })
  })
})
