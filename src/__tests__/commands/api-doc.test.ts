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
      it('should be defined', () => { expect(mod.parseParams).toBeDefined() })
      it('should be a function', () => { expect(typeof mod.parseParams).not.toBe(void 0) })
  })

  describe('parseSingleParam', () => {
      it('should be defined', () => { expect(mod.parseSingleParam).toBeDefined() })
      it('should be a function', () => { expect(typeof mod.parseSingleParam).not.toBe(void 0) })
  })

  describe('extractFunctionSignatures', () => {
      it('should be defined', () => { expect(mod.extractFunctionSignatures).toBeDefined() })
      it('should be a function', () => { expect(typeof mod.extractFunctionSignatures).not.toBe(void 0) })
  })

  describe('generateSignaturesMarkdown', () => {
      it('should be defined', () => { expect(mod.generateSignaturesMarkdown).toBeDefined() })
      it('should be a function', () => { expect(typeof mod.generateSignaturesMarkdown).not.toBe(void 0) })
  })

  describe('extractJSdocs', () => {
      it('should be defined', () => { expect(mod.extractJSdocs).toBeDefined() })
      it('should be a function', () => { expect(typeof mod.extractJSdocs).not.toBe(void 0) })
  })

  describe('extractTypesAST', () => {
      it('should be defined', () => { expect(mod.extractTypesAST).toBeDefined() })
      it('should be a function', () => { expect(typeof mod.extractTypesAST).not.toBe(void 0) })
  })

  describe('generateTypesMarkdown', () => {
      it('should be defined', () => { expect(mod.generateTypesMarkdown).toBeDefined() })
      it('should be a function', () => { expect(typeof mod.generateTypesMarkdown).not.toBe(void 0) })
  })

  describe('extractRoutesAdvanced', () => {
      it('should be defined', () => { expect(mod.extractRoutesAdvanced).toBeDefined() })
      it('should be a function', () => { expect(typeof mod.extractRoutesAdvanced).not.toBe(void 0) })
  })

  describe('extractRoutes', () => {
      it('should be defined', () => { expect(mod.extractRoutes).toBeDefined() })
      it('should be a function', () => { expect(typeof mod.extractRoutes).not.toBe(void 0) })
  })

  describe('generateMarkdown', () => {
      it('should be defined', () => { expect(mod.generateMarkdown).toBeDefined() })
      it('should be a function', () => { expect(typeof mod.generateMarkdown).not.toBe(void 0) })
  })

  describe('cmd', () => {
      it('should be defined', () => { expect(mod.cmd).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.cmd).not.toBe(void 0) })
  })
})
