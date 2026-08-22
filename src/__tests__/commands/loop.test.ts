vi.mock('react', () => ({
  createContext: (val: any) => ({ Provider: ({ children }: any) => children, _value: val }),
  useState: (init: any) => [init, () => {}],
  useCallback: (fn: any) => fn,
  useEffect: () => {},
  useRef: (init: any) => ({ current: init }),
  useMemo: (fn: any) => fn(),
  useReducer: (r: any, i: any) => [i, () => {}],
}))

vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/loop/index'

describe('loop', () => {
  describe('loopCommand', () => {
      it('should be defined', () => { expect(mod.loopCommand).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.loopCommand).not.toBe(void 0) })
  })
})
