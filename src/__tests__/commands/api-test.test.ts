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
      it('should be defined', () => { expect(mod.httpRequest).toBeDefined() })
      it('should be a async function', () => { expect(typeof mod.httpRequest).not.toBe(void 0) })
  })

  describe('resolveEnvVars', () => {
      it('should be defined', () => { expect(mod.resolveEnvVars).toBeDefined() })
      it('should be a function', () => { expect(typeof mod.resolveEnvVars).not.toBe(void 0) })
  })

  describe('evaluateAssertion', () => {
      it('should be defined', () => { expect(mod.evaluateAssertion).toBeDefined() })
      it('should be a function', () => { expect(typeof mod.evaluateAssertion).not.toBe(void 0) })
  })

  describe('validateJsonSchema', () => {
      it('should be defined', () => { expect(mod.validateJsonSchema).toBeDefined() })
      it('should be a function', () => { expect(typeof mod.validateJsonSchema).not.toBe(void 0) })
  })

  describe('formatResponse', () => {
      it('should be defined', () => { expect(mod.formatResponse).toBeDefined() })
      it('should be a function', () => { expect(typeof mod.formatResponse).not.toBe(void 0) })
  })

  describe('apiTest', () => {
      it('should be defined', () => { expect(mod.apiTest).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.apiTest).not.toBe(void 0) })
  })
})
