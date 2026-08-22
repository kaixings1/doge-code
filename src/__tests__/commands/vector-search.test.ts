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
import * as mod from './../../commands/vector-search/index'

describe('vector-search', () => {
  it('module should load', async () => {
    const m = await import('./../../commands/vector-search/index')
    expect(m).toBeDefined()
  })
})
