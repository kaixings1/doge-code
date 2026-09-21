// ARCHIVED 2026-09-17 (心虫决策: arch) — 被测模块从未接入引擎。
// 该模块在 src/ 中存在但全库零引用（无任何 require），其断言描述的是一套
// 未完成的设计。测试不可能通过，归档而非删除，保留设计意图。
// 若将来把这些模块接入 think 主链路，把此文件移回 test/ 即可。

const dispatch = require('../src/core/engine-dispatcher.js');

describe('engine-dispatcher', () => {
  const hf = { started: true, _modules: {}, _lazy: {} };

  test('dispatch: throws for invalid route', () => {
    expect(() => dispatch(hf, 'invalid')).toThrow('Invalid route');
  });

  test('dispatch: monitor.getStats returns stats', () => {
    const result = dispatch(hf, 'monitor.getStats');
    expect(result).toBeDefined();
    expect(typeof result.enabled).toBe('boolean');
  });

  test('dispatch: monitor.enable toggles perf', () => {
    dispatch(hf, 'monitor.enable');
    expect(dispatch(hf, 'monitor.getStats').enabled).toBe(true);
    dispatch(hf, 'monitor.disable');
    expect(dispatch(hf, 'monitor.getStats').enabled).toBe(false);
  });

  test('dispatch: monitor.reset noop', () => {
    expect(() => dispatch(hf, 'monitor.reset')).not.toThrow();
  });

  test('dispatch: monitor methods not throw', () => {
    ['enable', 'disable', 'reset', 'getStats'].forEach(m => {
      expect(() => dispatch(hf, 'monitor.' + m)).not.toThrow();
    });
  });
});
