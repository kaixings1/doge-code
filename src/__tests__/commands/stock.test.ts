vi.mock('react', () => ({
  createContext: (val: any) => ({ Provider: ({ children }: any) => children, _value: val }),
  useState: (init: any) => [init, () => {}],
  useCallback: (fn: any) => fn,
  useEffect: () => {},
  useRef: (init: any) => ({ current: init }),
  useMemo: (fn: any) => fn(),
  useReducer: (r: any, i: any) => [i, () => {}],
}))
import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/stock/index'

describe('stock', () => {
  describe('stockCommand', () => {
      it('should be defined', () => { expect(mod.stockCommand).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.stockCommand).not.toBe(void 0) })
  })
})
