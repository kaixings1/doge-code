import { describe, it, expect, beforeAll } from 'vitest';
import { QueryEngine } from '../../query/QueryEngine.js';
import { ToolRegistry } from '../../tools/ToolRegistry.js';

describe('性能测试', () => {
  let queryEngine: QueryEngine;
  let toolRegistry: ToolRegistry;

  beforeAll(() => {
    toolRegistry = new ToolRegistry();

    // 注册测试工具
    toolRegistry.register({
      name: 'FastTool',
      description: 'Fast tool',
      parameters: { type: 'object', properties: {} },
      execute: () => Promise.resolve({ success: true }),
    });

    queryEngine = new QueryEngine({
      apiClient: {
        sendMessage: () => Promise.resolve('Response'),
      },
      toolRegistry,
    });
  });

  describe('查询性能', () => {
    it('应该在合理时间内完成查询', async () => {
      const start = Date.now();

      await queryEngine.query('test message');

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(5000);
    });

    it('应该处理大量并发查询', async () => {
      const queries = Array(10).fill(null).map(() =>
        queryEngine.query('test')
      );

      const start = Date.now();
      await Promise.all(queries);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(15000);
    });
  });

  describe('工具调用性能', () => {
    it('应该快速执行工具', async () => {
      const start = Date.now();

      await toolRegistry.execute('FastTool', {});

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100);
    });

    it('应该处理批量工具调用', async () => {
      const start = Date.now();

      const promises = Array(100).fill(null).map(() =>
        toolRegistry.execute('FastTool', {})
      );

      await Promise.all(promises);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000);
    });
  });

  describe('内存性能', () => {
    it('应该控制内存使用', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // 执行大量操作
      for (let i = 0; i < 100; i++) {
        await queryEngine.query(`test ${i}`);
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // 内存增长应该合理
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // 100MB
    });
  });
});