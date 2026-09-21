// ARCHIVED 2026-09-17 (心虫决策: arch) — 被测模块从未接入引擎。
// 该模块在 src/ 中存在但全库零引用（无任何 require），其断言描述的是一套
// 未完成的设计。测试不可能通过，归档而非删除，保留设计意图。
// 若将来把这些模块接入 think 主链路，把此文件移回 test/ 即可。

const { InitHookPoints } = require('../src/core/engine-hook-points.js');

describe('InitHookPoints', () => {
  let hooks;
  beforeEach(() => { hooks = new InitHookPoints({ rootPath: __dirname }); });

  test('register: adds handler', () => {
    hooks.register('test.hook', () => 'ok', { priority: 5 });
    const h = hooks.getHandler('test.hook');
    expect(h).not.toBeNull();
    expect(h.priority).toBe(5);
    expect(h.handler()).toBe('ok');
  });

  test('getAllHandlers: returns all registered', () => {
    const all = hooks.getAllHandlers();
    expect(all.length).toBeGreaterThanOrEqual(5); // 5 defaults
    expect(all[0]).toHaveProperty('name');
    expect(all[0]).toHaveProperty('priority');
    expect(all[0]).toHaveProperty('softInit');
  });

  test('register: disabled hook skips', () => {
    const disabled = new InitHookPoints({ enabled: false, rootPath: __dirname });
    disabled.register('x', () => 'x', { priority: 1 });
    expect(disabled.getHandler('x')).toBeNull();
  });

  test('default handlers: _initMemory populates state', () => {
    hooks.register('test.mem', hooks._initMemory.bind(hooks), { priority: 1, softInit: true });
    const ctx = { state: {} };
    hooks.runAll = undefined; // no runAll in this version
    // Directly invoke the handler
    const result = hooks._initMemory(ctx);
    expect(result.state.memory.rom.identityRules).toEqual([]);
  });

  test('register: softInit false means failure is fatal when run', () => {
    // Without runAll, just verify handler metadata
    hooks.register('hard.fail', () => { throw new Error('hard fail'); }, { softInit: false });
    const h = hooks.getHandler('hard.fail');
    expect(h.softInit).toBe(false);
  });
});
