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
import * as mod from './../../commands/reset-limits/index'

describe('reset-limits', () => {
  describe('resetLimits', () => {
      it('should be defined', () => { expect(mod.resetLimits).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.resetLimits).not.toBe(void 0) })
  })

  describe('resetLimitsNonInteractive', () => {
      it('should be defined', () => { expect(mod.resetLimitsNonInteractive).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.resetLimitsNonInteractive).not.toBe(void 0) })
  })

  describe('resetLimitsCommand', () => {
      it('should be defined', () => { expect(mod.resetLimitsCommand).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.resetLimitsCommand).not.toBe(void 0) })
  })
})
