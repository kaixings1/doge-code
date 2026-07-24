import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryEngine } from '../../query/QueryEngine.js';
import { TestHelper } from '../utils/TestHelper.js';

describe('QueryEngine', () => {
  let queryEngine: QueryEngine;

  beforeEach(() => {
    const config = {
      apiClient: {
        sendMessage: vi.fn(() => Promise.resolve('Test response')),
      },
      toolRegistry: {
        get: vi.fn((name: string) => ({
          name,
          execute: vi.fn(() => Promise.resolve({ content: 'Result' })),
        })),
      },
    };

    queryEngine = new QueryEngine(config);
  });

  describe('初始化', () => {
    it('应该正确初始化', () => {
      expect(queryEngine).toBeDefined();
      expect(queryEngine.state).toBe('idle');
    });

    it('应该设置正确的配置', () => {
      expect(queryEngine.config).toBeDefined();
    });
  });

  describe('查询执行', () => {
    it('应该成功执行查询', async () => {
      const result = await queryEngine.query('test message');

      expect(result.success).toBe(true);
      expect(result.content).toBe('Test response');
    });

    it('应该处理工具调用', async () => {
      const toolCall = TestHelper.createMockToolCall();

      vi.mocked(queryEngine.config.apiClient).sendMessage.mockResolvedValue(
        JSON.stringify({ tool_calls: [toolCall] })
      );

      const result = await queryEngine.query('Use a tool');

      expect(result.success).toBe(true);
      expect(result.toolCalls).toBeDefined();
    });

    it('应该处理错误', async () => {
      vi.mocked(queryEngine.config.apiClient).sendMessage.mockRejectedValue(
        new Error('API Error')
      );

      const result = await queryEngine.query('test');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('状态管理', () => {
    it('应该更新状态', async () => {
      expect(queryEngine.state).toBe('idle');

      const queryPromise = queryEngine.query('test');
      expect(queryEngine.state).toBe('responding');

      await queryPromise;
      expect(queryEngine.state).toBe('done');
    });

    it('应该支持中止', async () => {
      const queryPromise = queryEngine.query('long query');

      setTimeout(() => queryEngine.abort(), 100);

      const result = await queryPromise;
      expect(result.success).toBe(false);
      expect(queryEngine.state).toBe('aborted_by_user');
    });
  });

  describe('Token 管理', () => {
    it('应该跟踪 Token 使用', async () => {
      await queryEngine.query('test');

      const usage = queryEngine.getTokenUsage();
      expect(usage.inputTokens).toBeGreaterThan(0);
      expect(usage.outputTokens).toBeGreaterThan(0);
    });
  });
});