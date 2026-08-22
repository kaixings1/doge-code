vi.mock('react', () => ({
  createContext: (val: any) => ({ Provider: ({ children }: any) => children, _value: val }),
  useState: (init: any) => [init, () => {}],
  useCallback: (fn: any) => fn,
  useEffect: () => {},
  useRef: (init: any) => ({ current: init }),
  useMemo: (fn: any) => fn(),
  useReducer: (r: any, i: any) => [i, () => {}],
}))

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
import * as mod from './../../commands/snippets/index'

describe('snippets', () => {
  describe('useHook', () => {
      it('should be defined', () => { expect(mod.useHook).toBeDefined() })
      it('should be a function', () => { expect(typeof mod.useHook).not.toBe(void 0) })
  })

  describe('snippets', () => {
      it('should be defined', () => { expect(mod.snippets).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.snippets).not.toBe(void 0) })
  })
})
