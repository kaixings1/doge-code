import { describe, it, expect, vi } from 'vitest';
import { CommandRegistry, type ICommand } from '../../api/CommandRegistry.js';

function makeCommand(overrides: Partial<ICommand> = {}): ICommand {
  return {
    name: 'test',
    description: 'Test command',
    execute: vi.fn(async () => ({ success: true, output: 'ok' })),
    ...overrides,
  };
}

describe('CommandRegistry', () => {
  describe('注册', () => {
    it('应该注册命令', () => {
      const reg = new CommandRegistry();
      reg.register(makeCommand());
      expect(reg.has('test')).toBe(true);
      expect(reg.size()).toBe(1);
    });

    it('应该注册别名（支持 / 前缀）', () => {
      const reg = new CommandRegistry();
      reg.register(makeCommand({ aliases: ['/t', 'test-alias'] }));
      expect(reg.has('/t')).toBe(true);
      expect(reg.has('test-alias')).toBe(true);
      expect(reg.get('/t')?.name).toBe('test');
    });

    it('重复注册应该抛错', () => {
      const reg = new CommandRegistry();
      reg.register(makeCommand());
      expect(() => reg.register(makeCommand())).toThrow('already registered');
    });

    it('缺少名称/描述应该抛错', () => {
      const reg = new CommandRegistry();
      expect(() => reg.register(makeCommand({ name: '' }))).toThrow('name is required');
      expect(() => reg.register(makeCommand({ description: '' }))).toThrow('description is required');
    });

    it('别名冲突应该抛错', () => {
      const reg = new CommandRegistry();
      reg.register(makeCommand({ name: 'a', aliases: ['/shared'] }));
      expect(() => reg.register(makeCommand({ name: 'b', aliases: ['/shared'] }))).toThrow('Alias conflict');
    });

    it('取消注册应该移除命令和别名', () => {
      const reg = new CommandRegistry();
      reg.register(makeCommand({ aliases: ['/t'] }));
      reg.unregister('test');
      expect(reg.has('test')).toBe(false);
      expect(reg.has('/t')).toBe(false);
    });
  });

  describe('智能解析', () => {
    it('应该解析位置参数', () => {
      const reg = new CommandRegistry();
      const parsed = reg.parse('/test arg1 arg2');
      expect(parsed.name).toBe('test');
      expect(parsed.args).toEqual(['arg1', 'arg2']);
    });

    it('应该支持带引号的参数', () => {
      const reg = new CommandRegistry();
      const parsed = reg.parse('/test "hello world" \'single quoted\'');
      expect(parsed.args).toEqual(['hello world', 'single quoted']);
    });

    it('应该支持 --key=value 长选项并自动类型转换', () => {
      const reg = new CommandRegistry();
      const parsed = reg.parse('/test --count=5 --name=foo --flag --on=true');
      expect(parsed.options).toEqual({ count: 5, name: 'foo', flag: true, on: true });
    });

    it('应该支持 -k value 短选项', () => {
      const reg = new CommandRegistry();
      const parsed = reg.parse('/test -n foo -c 3');
      expect(parsed.options).toEqual({ n: 'foo', c: 3 });
    });

    it('负数应该作为位置参数而非选项', () => {
      const reg = new CommandRegistry();
      const parsed = reg.parse('/test -5');
      expect(parsed.args).toEqual(['-5']);
      expect(Object.keys(parsed.options)).toHaveLength(0);
    });
  });

  describe('执行', () => {
    it('应该执行命令并记录历史', async () => {
      const reg = new CommandRegistry();
      const execute = vi.fn(async () => ({ success: true, output: 'done' }));
      reg.register(makeCommand({ execute }));
      const result = await reg.execute('/test foo', { sessionId: 's1', workingDirectory: '.', args: [], options: {} });
      expect(result.success).toBe(true);
      const mockCalls = (execute as any).mock.calls;
      expect(mockCalls.length).toBeGreaterThan(0);
      expect(mockCalls[0][0]).toEqual(['foo']);
      expect(mockCalls[0][1].options).toEqual({});
      expect(reg.getHistory().includes('/test foo')).toBe(true);
    });

    it('未找到命令返回错误', async () => {
      const reg = new CommandRegistry();
      const result = await reg.execute('/missing', { sessionId: 's1', workingDirectory: '.', args: [], options: {} });
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it('参数验证失败返回错误码 2', async () => {
      const reg = new CommandRegistry();
      reg.register(makeCommand({
        arguments: [
          { name: 'count', required: true, type: 'number' },
        ],
      }));
      const result = await reg.execute('/test abc', { sessionId: 's1', workingDirectory: '.', args: [], options: {} });
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(2);
    });

    it('缺少必填参数返回错误', async () => {
      const reg = new CommandRegistry();
      reg.register(makeCommand({
        arguments: [
          { name: 'file', required: true, type: 'string' },
        ],
      }));
      const result = await reg.execute('/test', { sessionId: 's1', workingDirectory: '.', args: [], options: {} });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required argument: file');
    });
  });

  describe('模糊搜索', () => {
    it('名称前缀匹配优先', () => {
      const reg = new CommandRegistry();
      reg.register(makeCommand({ name: 'help' }));
      reg.register(makeCommand({ name: 'health-check' }));
      reg.register(makeCommand({ name: 'version' }));
      const results = reg.search('he');
      expect(results[0].name).toBe('help');
      const names = results.map(r => r.name);
      expect(names.includes('health-check')).toBe(true);
      expect(names.includes('version')).toBe(false);
    });

    it('空查询返回所有命令', () => {
      const reg = new CommandRegistry();
      reg.register(makeCommand({ name: 'a' }));
      reg.register(makeCommand({ name: 'b' }));
      expect(reg.search('')).toHaveLength(2);
    });
  });

  describe('分组与统计', () => {
    it('groupByCategory 按分类分组', () => {
      const reg = new CommandRegistry();
      reg.register(makeCommand({ name: 'a', category: 'git' }));
      reg.register(makeCommand({ name: 'b', category: 'git' }));
      reg.register(makeCommand({ name: 'c', category: 'files' }));
      const groups = reg.groupByCategory();
      expect(groups.git).toHaveLength(2);
      expect(groups.files).toHaveLength(1);
    });

    it('getUsageStats 按使用频率排序', async () => {
      const reg = new CommandRegistry();
      reg.register(makeCommand({ name: 'a' }));
      reg.register(makeCommand({ name: 'b' }));
      reg.register(makeCommand({ name: 'c' }));
      await reg.execute('/a', { sessionId: 's', workingDirectory: '.', args: [], options: {} });
      await reg.execute('/a', { sessionId: 's', workingDirectory: '.', args: [], options: {} });
      await reg.execute('/b', { sessionId: 's', workingDirectory: '.', args: [], options: {} });
      const stats = reg.getUsageStats();
      expect(stats[0].name).toBe('a');
      expect(stats[0].count).toBe(2);
      expect(stats[1].name).toBe('b');
    });
  });

  describe('历史记录', () => {
    it('历史记录有上限', async () => {
      const reg = new CommandRegistry();
      reg.register(makeCommand({ name: 'a' }));
      for (let i = 0; i < 150; i++) {
        await reg.execute(`/a arg${i}`, { sessionId: 's', workingDirectory: '.', args: [], options: {} });
      }
      expect(reg.getHistory().length).toBeLessThanOrEqual(100);
    });

    it('clearHistory 清空历史', () => {
      const reg = new CommandRegistry();
      reg.register(makeCommand({ name: 'a' }));
      reg.parse('/a');
      reg.clearHistory();
      expect(reg.getHistory()).toHaveLength(0);
    });
  });
});
