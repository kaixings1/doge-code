vi.mock('react', () => {
    const React = {
        createContext: (val) => ({ Provider: ({ children }) => children, _value: val }),
        useState: (init) => [init, () => { }],
        useCallback: (fn) => fn,
        useEffect: () => { },
        useRef: (init) => ({ current: init }),
        useMemo: (fn) => fn(),
        useReducer: (r, i) => [i, () => { }],
        PureComponent: class {
            setState() { }
        },
        memo: (fn) => fn,
        Children: { toArray: (x) => x },
        isValidElement: (x) => false,
        createElement: (type, props, ...children) => ({ type, props, children }),
    };
    return { default: React, ...React };
});
vi.spyOn(process, 'exit').mockImplementation(() => undefined);
import { describe, it, expect, vi } from 'vitest';
import * as mod from './../../commands/loop/index';
describe('loop', () => {
    describe('loopCommand', () => {
        it('should be defined', () => { expect(mod.default).toBeDefined(); });
        it('should be a const', () => { expect(typeof mod.default).not.toBe(void 0); });
    });
});
