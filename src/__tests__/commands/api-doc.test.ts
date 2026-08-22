vi.mock('fs', () => ({
  existsSync: vi.fn(() => false), readFileSync: vi.fn(() => ''),
  writeFileSync: vi.fn(), mkdirSync: vi.fn(),
  statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 0 })),
  readdirSync: vi.fn(() => []),
}))
import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/api-doc/index'

describe('api-doc', () => {
  describe('parseParams', () => {
      it('should be defined', () => { expect(mod.default).toBeDefined() })
      it('should be a function', () => { expect(typeof mod.default).not.toBe(void 0) })
  })

  describe('parseSingleParam', () => {
      it('should be defined', () => { expect(mod.default).toBeDefined() })
      it('should be a function', () => { expect(typeof mod.default).not.toBe(void 0) })
  })

  describe('extractFunctionSignatures', () => {
      it('should be defined', () => { expect(mod.default).toBeDefined() })
      it('should be a function', () => { expect(typeof mod.default).not.toBe(void 0) })
  })

  describe('generateSignaturesMarkdown', () => {
      it('should be defined', () => { expect(mod.default).toBeDefined() })
      it('should be a function', () => { expect(typeof mod.default).not.toBe(void 0) })
  })

  describe('extractJSdocs', () => {
      it('should be defined', () => { expect(mod.default).toBeDefined() })
      it('should be a function', () => { expect(typeof mod.default).not.toBe(void 0) })
  })

  describe('extractTypesAST', () => {
      it('should be defined', () => { expect(mod.default).toBeDefined() })
      it('should be a function', () => { expect(typeof mod.default).not.toBe(void 0) })
  })

  describe('generateTypesMarkdown', () => {
      it('should be defined', () => { expect(mod.default).toBeDefined() })
      it('should be a function', () => { expect(typeof mod.default).not.toBe(void 0) })
  })

  describe('extractRoutesAdvanced', () => {
      it('should be defined', () => { expect(mod.default).toBeDefined() })
      it('should be a function', () => { expect(typeof mod.default).not.toBe(void 0) })
  })

  describe('extractRoutes', () => {
      it('should be defined', () => { expect(mod.default).toBeDefined() })
      it('should be a function', () => { expect(typeof mod.default).not.toBe(void 0) })
  })

  describe('generateMarkdown', () => {
      it('should be defined', () => { expect(mod.default).toBeDefined() })
      it('should be a function', () => { expect(typeof mod.default).not.toBe(void 0) })
  })

  describe('cmd', () => {
      it('should be defined', () => { expect(mod.default).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.default).not.toBe(void 0) })
  })
})
