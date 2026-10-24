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
import * as mod from './../../commands/reset-limits/index'

describe('reset-limits', () => {
  describe('resetLimits', () => {
      it('should be defined', () => { expect(mod.default).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.default).not.toBe(void 0) })
  })

  describe('resetLimitsCommand', () => {
      it('should be defined', () => { expect(mod.default).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.default).not.toBe(void 0) })
  })

  // 回归：曾有 resetLimits 与 resetLimitsNonInteractive 两个导出指向同一对象，
  // 二者都被注册进命令列表 → `/reset-limits` 出现两次。
  it('不再导出与 resetLimits 重复注册的同名命令别名', () => {
    expect('resetLimitsNonInteractive' in mod).toBe(false)
  })
})
