import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../../api/ToolRegistry.js';
import type { ITool, ToolExecutionContext } from '../../api/ToolRegistry.js';

function makeTool(name: string, deps: string[] = []): ITool {
  return {
    name,
    description: 'Tool ' + name,
    parameters: { type: 'object', properties: {} },
    dependencies: deps.length ? deps : undefined,
    execute: async () => ({ success: true }),
  };
}

function ctx(permissions: string[] = []): ToolExecutionContext {
  return { sessionId: 's', messageId: 'm', permissions };
}

describe('ToolRegistry 真实实现（D4 DI）', () => {
  it('注册与获取', () => {
    const reg = new ToolRegistry();
    reg.register(makeTool('a'));
    expect(reg.has('a')).toBe(true);
    expect(reg.get('a')?.name).toBe('a');
    expect(reg.size()).toBe(1);
  });

  it('非法工具注册抛错（缺 name/description/parameters）', () => {
    const reg = new ToolRegistry();
    const base = { type: 'object' as const, properties: {} };
    expect(() => reg.register({ name: '', description: 'd', parameters: base, execute: async () => ({ success: true }) })).toThrow('name');
    expect(() => reg.register({ name: 'x', description: '', parameters: base, execute: async () => ({ success: true }) })).toThrow('description');
    expect(() => reg.register({ name: 'x', description: 'd', parameters: { type: 'string' } as any, execute: async () => ({ success: true }) })).toThrow('parameters');
  });

  it('重复注册抛错', () => {
    const reg = new ToolRegistry();
    reg.register(makeTool('a'));
    expect(() => reg.register(makeTool('a'))).toThrow('already registered');
  });

  it('未解析依赖注册抛错', () => {
    const reg = new ToolRegistry();
    expect(() => reg.register(makeTool('a', ['missing']))).toThrow('unresolved dependency');
  });

  it('execute 必填参数校验', async () => {
    const reg = new ToolRegistry();
    const tool: ITool = {
      name: 't', description: 'd',
      parameters: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] },
      execute: async () => ({ success: true }),
    };
    reg.register(tool);
    const res = await reg.execute('t', {}, ctx());
    expect(res.success).toBe(false);
    expect(res.errorType).toBe('validation');
  });

  it('execute 类型/枚举/范围校验', async () => {
    const reg = new ToolRegistry();
    const tool: ITool = {
      name: 't', description: 'd',
      parameters: {
        type: 'object',
        properties: { kind: { type: 'string', enum: ['a', 'b'] }, n: { type: 'number', minimum: 1, maximum: 10 }, s: { type: 'string', minLength: 2, maxLength: 5, pattern: '^[a-z]+$' } },
      },
      execute: async () => ({ success: true }),
    };
    reg.register(tool);
    expect((await reg.execute('t', { kind: 'c' }, ctx())).errorType).toBe('validation');
    expect((await reg.execute('t', { n: 0 }, ctx())).errorType).toBe('validation');
    expect((await reg.execute('t', { n: 11 }, ctx())).errorType).toBe('validation');
    expect((await reg.execute('t', { s: 'x' }, ctx())).errorType).toBe('validation');
    expect((await reg.execute('t', { s: 'ABCD' }, ctx())).errorType).toBe('validation');
    expect((await reg.execute('t', { kind: 'a', n: 5, s: 'abc' }, ctx())).success).toBe(true);
  });

  it('默认值填充', async () => {
    const reg = new ToolRegistry();
    let received: any = null;
    reg.register({
      name: 't', description: 'd',
      parameters: { type: 'object', properties: { page: { type: 'number', default: 1 } } },
      execute: async (params: any) => { received = params; return { success: true }; },
    });
    await reg.execute('t', {}, ctx());
    expect(received.page).toBe(1);
  });

  it('权限检查（deny 拒绝 / allow 放行）', async () => {
    const reg = new ToolRegistry();
    reg.register(makeTool('t'));
    const denied = await reg.execute('t', {}, ctx(['deny:t']));
    expect(denied.errorType).toBe('permission');
    const allowed = await reg.execute('t', {}, ctx(['allow:t']));
    expect(allowed.success).toBe(true);
  });

  it('execute 超时', async () => {
    const reg = new ToolRegistry(50);
    reg.register({
      name: 'slow', description: 'd',
      parameters: { type: 'object', properties: {} },
      execute: () => new Promise((r) => setTimeout(() => r({ success: true }), 500)),
    });
    const res = await reg.execute('slow', {}, ctx());
    expect(res.errorType).toBe('timeout');
  });

  it('工具不存在返回 not_found', async () => {
    const reg = new ToolRegistry();
    const res = await reg.execute('nope', {}, ctx());
    expect(res.errorType).toBe('not_found');
  });

  it('compose 组合工具（依赖注入执行）', async () => {
    const reg = new ToolRegistry();
    reg.register(makeTool('base'));
    reg.compose('combo', ['base'], (tools) => async () => ({ success: true, output: 'composed with ' + tools.base.name }));
    expect(reg.has('combo')).toBe(true);
    const res = await reg.execute('combo', {}, ctx());
    expect(res.output).toContain('base');
  });

  it('compose 缺失依赖抛错', () => {
    const reg = new ToolRegistry();
    expect(() => reg.compose('bad', ['nope'], () => async () => ({ success: true }))).toThrow('missing dependency');
  });

  it('topoSort 按依赖顺序排序', () => {
    const reg = new ToolRegistry();
    reg.register(makeTool('leaf'));
    reg.register(makeTool('mid', ['leaf']));
    reg.register(makeTool('root', ['mid']));
    const sorted = reg.topoSort();
    expect(sorted.indexOf('leaf')).toBeLessThan(sorted.indexOf('mid'));
    expect(sorted.indexOf('mid')).toBeLessThan(sorted.indexOf('root'));
  });

  it('topoSort 循环依赖抛错', () => {
    const reg = new ToolRegistry();
    // register 会拦截未解析依赖（a→b 需 b 已注册），故通过私有 Map 直接注入循环依赖来测 topoSort 的循环检测
    const tools = (reg as any).tools as Map<string, ITool>;
    tools.set('a', makeTool('a', ['b']));
    tools.set('b', makeTool('b', ['a']));
    expect(() => reg.topoSort()).toThrow('Circular');
  });

  it('依赖深度 / 叶子工具 / 依赖完整性', () => {
    const reg = new ToolRegistry();
    reg.register(makeTool('leaf'));
    reg.register(makeTool('mid', ['leaf']));
    reg.register(makeTool('root', ['mid']));
    expect(reg.getDependencyDepth('root')).toBe(2);
    expect(reg.getDependencyDepth('mid')).toBe(1);
    expect(reg.getDependencyDepth('leaf')).toBe(0);
    expect(reg.listLeafTools()).toContain('leaf');
    expect(reg.listLeafTools()).not.toContain('root');
    expect(reg.checkDependencies()).toHaveLength(0);
  });

  it('getDependencies 解析注入依赖工具', () => {
    const reg = new ToolRegistry();
    reg.register(makeTool('dep1'));
    reg.register(makeTool('dep2', ['dep1']));
    const deps = reg.getDependencies(reg.get('dep2')!);
    expect(deps.dep1?.name).toBe('dep1');
  });

  it('统计信息（调用次数/失败/时长）', async () => {
    const reg = new ToolRegistry();
    reg.register(makeTool('t'));
    await reg.execute('t', {}, ctx());
    await reg.execute('t', {}, ctx());
    await reg.execute('missing', {}, ctx());
    const stats = reg.getStats();
    expect(stats.t.calls).toBe(2);
    expect(stats.t.avgDurationMs).toBeGreaterThanOrEqual(0);
    expect(reg.listNames()).toContain('t');
  });

  it('unregister 注销工具', () => {
    const reg = new ToolRegistry();
    reg.register(makeTool('t'));
    reg.unregister('t');
    expect(reg.has('t')).toBe(false);
    expect(() => reg.unregister('t')).toThrow('not found');
  });
});
