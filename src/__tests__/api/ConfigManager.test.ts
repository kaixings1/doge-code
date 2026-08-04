import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ConfigManager } from '../../api/ConfigManager.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'config-test-'));
});

afterEach(() => {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('ConfigManager', () => {
  describe('get/set', () => {
    it('应该设置和获取配置（点号路径）', () => {
      const mgr = new ConfigManager();
      mgr.set('model.name', 'claude-opus-4-6');
      mgr.set('model.temperature', 0.7);
      expect(mgr.get('model.name')).toBe('claude-opus-4-6');
      expect(mgr.get('model.temperature')).toBe(0.7);
      expect(mgr.has('model.name')).toBe(true);
    });

    it('get 未设置时返回默认值', () => {
      const mgr = new ConfigManager();
      expect(mgr.get('missing.key', 'fallback')).toBe('fallback');
      expect(mgr.get('missing.key')).toBeUndefined();
    });

    it('delete 移除配置', () => {
      const mgr = new ConfigManager();
      mgr.set('a.b', 1);
      mgr.delete('a.b');
      expect(mgr.get('a.b', 'gone')).toBe('gone');
    });

    it('getAll 返回配置副本', () => {
      const mgr = new ConfigManager();
      mgr.set('x', 1);
      const all = mgr.getAll();
      expect(all.x).toBe(1);
      all.x = 999;
      expect(mgr.get('x')).toBe(1);
    });
  });

  describe('环境变量回退', () => {
    const original = process.env.CLAUDE_CODE_TEST_KEY;

    afterEach(() => {
      if (original === undefined) delete process.env.CLAUDE_CODE_TEST_KEY;
      else process.env.CLAUDE_CODE_TEST_KEY = original;
    });

    it('应该从环境变量回退读取（字符串/数字/布尔）', () => {
      const mgr = new ConfigManager();
      process.env.CLAUDE_CODE_TEST_KEY = 'hello';
      expect(mgr.get('test.key')).toBe('hello');

      process.env.CLAUDE_CODE_TEST_KEY = '42';
      expect(mgr.get('test.key')).toBe(42);

      process.env.CLAUDE_CODE_TEST_KEY = 'true';
      expect(mgr.get('test.key')).toBe(true);

      process.env.CLAUDE_CODE_TEST_KEY = 'false';
      expect(mgr.get('test.key')).toBe(false);
    });

    it('has 应检测环境变量', () => {
      const mgr = new ConfigManager();
      process.env.CLAUDE_CODE_TEST_KEY = 'x';
      expect(mgr.has('test.key')).toBe(true);
    });
  });

  describe('watchers', () => {
    it('watch 应该在 set 时触发（含父路径）', () => {
      const mgr = new ConfigManager();
      const child = vi.fn();
      const parent = vi.fn();
      mgr.watch('a.b', child);
      mgr.watch('a', parent);
      mgr.set('a.b', 1);
      const childCalls = (child as any).mock.calls;
      expect(childCalls.length).toBeGreaterThan(0);
      expect(childCalls[0][0]).toBe(1);
      expect((parent as any).mock.calls.length).toBeGreaterThan(0);
    });

    it('取消订阅后不再触发', () => {
      const mgr = new ConfigManager();
      const cb = vi.fn();
      const unsubscribe = mgr.watch('k', cb);
      unsubscribe();
      mgr.set('k', 2);
      expect((cb as any).mock.calls.length).toBe(0);
    });
  });

  describe('schema 验证', () => {
    it('validate 应检测类型/必填/枚举错误', () => {
      const mgr = new ConfigManager();
      mgr.defineSchema({
        'model.name': { type: 'string', required: true },
        'model.temperature': { type: 'number', enum: [0, 0.5, 1] },
        'debug.enabled': { type: 'boolean' },
      });
      mgr.set('model.temperature', 0.3); // 不在枚举中
      const result = mgr.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('model.name'))).toBe(true);
      expect(result.errors.some(e => e.includes('temperature'))).toBe(true);
    });

    it('validate 通过时返回 valid', () => {
      const mgr = new ConfigManager();
      mgr.defineSchema({ 'a': { type: 'number' } });
      mgr.set('a', 1);
      expect(mgr.validate().valid).toBe(true);
    });

    it('自定义 validate 函数', () => {
      const mgr = new ConfigManager();
      mgr.defineSchema({ 'port': { validate: (v: any) => typeof v === 'number' && v > 0 && v < 65536 } });
      mgr.set('port', 70000);
      expect(mgr.validate().valid).toBe(false);
      mgr.set('port', 8080);
      expect(mgr.validate().valid).toBe(true);
    });
  });

  describe('默认值与深合并', () => {
    it('setDefaults 填充缺失项但不覆盖已有值', () => {
      const mgr = new ConfigManager();
      mgr.setDefaults({ model: { name: 'default', temperature: 0.5 } });
      mgr.set('model.temperature', 0.9);
      expect(mgr.get('model.name')).toBe('default');
      expect(mgr.get('model.temperature')).toBe(0.9);
    });
  });

  describe('快照与迁移', () => {
    it('snapshot/restore 往返', () => {
      const mgr = new ConfigManager();
      mgr.set('a.b', { c: 1 });
      const snap = mgr.snapshot();
      mgr.set('a.b', { c: 2 });
      mgr.restore(snap);
      expect(mgr.get('a.b.c')).toBe(1);
    });

    it('migrate 按版本迁移', () => {
      const mgr = new ConfigManager();
      mgr.set('oldKey', 'value');
      mgr.migrate(1, {
        1: (cfg) => ({ ...cfg, newKey: cfg.oldKey, oldKey: undefined }),
      });
      expect(mgr.get('newKey')).toBe('value');
      expect(mgr.getVersion()).toBe(2);
    });
  });

  describe('持久化', () => {
    it('load/save 到文件', async () => {
      const file = join(dir, 'config.json');
      const mgr = new ConfigManager();
      mgr.setDefaults({ model: { name: 'default' } });
      mgr.set('model.name', 'custom');
      await mgr.save(file);

      const mgr2 = new ConfigManager();
      await mgr2.load(file);
      expect(mgr2.get('model.name')).toBe('custom');
      expect(mgr2.get('model.name') as string).toBe('custom');
    });

    it('load 不存在的文件使用默认值', async () => {
      const mgr = new ConfigManager();
      mgr.setDefaults({ a: 1 });
      await mgr.load(join(dir, 'missing.json'));
      expect(mgr.get('a')).toBe(1);
    });

    it('merge 深合并外部配置', () => {
      const mgr = new ConfigManager();
      mgr.set('server', { host: 'localhost', port: 3000 });
      mgr.merge({ server: { port: 4000 }, extra: true });
      expect(mgr.get('server.host')).toBe('localhost');
      expect(mgr.get('server.port')).toBe(4000);
      expect(mgr.get('extra')).toBe(true);
    });

    it('reset 重置为默认值', () => {
      const mgr = new ConfigManager();
      mgr.setDefaults({ a: 1, b: 2 });
      mgr.set('a', 999);
      mgr.reset();
      expect(mgr.get('a')).toBe(1);
    });
  });
});
