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
import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/ant-trace/index'

describe('ant-trace', () => {
  describe('antTrace', () => {
      it('should be defined', () => { expect(mod.antTrace).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.antTrace).not.toBe(void 0) })
  })
})
