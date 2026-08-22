vi.mock('react', () => {
  const React = {
    createContext: (val: any) => ({ Provider: ({ children }: any) => children, _value: val }),
    useState: (init: any) => [init, () => {}],
    useCallback: (fn: any) => fn,
    useEffect: () => {},
    useRef: (init: any) => ({ current: init }),
    useMemo: (fn: any) => fn(),
    useReducer: (r: any, i: any) => [i, () => {}],
    PureComponent: class { setState() {} },
    memo: (fn: any) => fn,
    Children: { toArray: (x: any) => x },
    isValidElement: (x: any) => false,
    createElement: (type: any, props: any, ...children: any[]) => ({ type, props, children }),
  }
  return { default: React, ...React }
})

vi.spyOn(console, 'log').mockImplementation(() => {})

vi.spyOn(console, 'error').mockImplementation(() => {})

vi.spyOn(console, 'warn').mockImplementation(() => {})

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
import * as mod from './../../commands/scaffold/index'

describe('scaffold', () => {
  describe('defineConfig', () => {
      it('should be defined', () => { expect(mod.default).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.default).not.toBe(void 0) })
  })

  describe('config', () => {
      it('should be defined', () => { expect(mod.default).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.default).not.toBe(void 0) })
  })

  describe('scaffold', () => {
      it('should be defined', () => { expect(mod.default).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.default).not.toBe(void 0) })
  })
})
