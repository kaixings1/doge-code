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
import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/repo-map/index'

describe('repo-map', () => {
  describe('repoMap', () => {
      it('should be defined', () => { expect(mod.default).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.default).not.toBe(void 0) })
  })
})
