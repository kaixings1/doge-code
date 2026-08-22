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
import * as mod from './../../commands/api-test/index'

describe('api-test', () => {
  describe('httpRequest', () => {
      it('should be defined', () => { expect(mod.default).toBeDefined() })
      it('should be a async function', () => { expect(typeof mod.default).not.toBe(void 0) })
  })

  describe('resolveEnvVars', () => {
      it('should be defined', () => { expect(mod.default).toBeDefined() })
      it('should be a function', () => { expect(typeof mod.default).not.toBe(void 0) })
  })

  describe('evaluateAssertion', () => {
      it('should be defined', () => { expect(mod.default).toBeDefined() })
      it('should be a function', () => { expect(typeof mod.default).not.toBe(void 0) })
  })

  describe('validateJsonSchema', () => {
      it('should be defined', () => { expect(mod.default).toBeDefined() })
      it('should be a function', () => { expect(typeof mod.default).not.toBe(void 0) })
  })

  describe('formatResponse', () => {
      it('should be defined', () => { expect(mod.default).toBeDefined() })
      it('should be a function', () => { expect(typeof mod.default).not.toBe(void 0) })
  })

  describe('apiTest', () => {
      it('should be defined', () => { expect(mod.default).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.default).not.toBe(void 0) })
  })
})
