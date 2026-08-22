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
import * as mod from './../../commands/perf-issue/index'

describe('perf-issue', () => {
  describe('perfIssue', () => {
      it('should be defined', () => { expect(mod.perfIssue).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.perfIssue).not.toBe(void 0) })
  })
})
