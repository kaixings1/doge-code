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
import * as mod from './../../commands/bughunter/index'

describe('bughunter', () => {
  describe('bughunter', () => {
      it('should be defined', () => { expect(mod.bughunter).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.bughunter).not.toBe(void 0) })
  })
})
