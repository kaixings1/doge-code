vi.spyOn(console, 'log').mockImplementation(() => {})

vi.spyOn(console, 'error').mockImplementation(() => {})

vi.spyOn(console, 'warn').mockImplementation(() => {})

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false), readFileSync: vi.fn(() => ''),
  writeFileSync: vi.fn(), mkdirSync: vi.fn(),
  statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 0 })),
  readdirSync: vi.fn(() => []),
}))
import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/autocomplete/index'

describe('autocomplete', () => {
  describe('autocomplete', () => {
      it('should be defined', () => { expect(mod.autocomplete).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.autocomplete).not.toBe(void 0) })
  })
})
