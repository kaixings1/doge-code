import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryEngine } from '../../api/QueryEngine.js';
import { TestHelper } from '../utils/TestHelper.js';

describe('端到端测试', () => {
  let queryEngine: QueryEngine;

  beforeEach(() => {
    queryEngine = new QueryEngine({
      apiClient: {
        sendMessage: vi.fn(() =>
          Promise.resolve(JSON.stringify({ content: 'E2E response' }))
        ),
        streamMessage: vi.fn(async function* () {
          yield 'E2E response';
        }),
        healthCheck: vi.fn(() => Promise.resolve(true)),
      },
      toolRegistry: {
        get: vi.fn(() => ({
          name: 'TestTool',
          execute: vi.fn(() => Promise.resolve({ success: true, content: 'result' })),
        })),
      } as any,
    });
  });

  describe('完整工作流', () => {
    it('应该执行完整的查询流程', async () => {
      const result = await queryEngine.query('What is 2+2?');
      expect(result.success).toBe(true);
    });

    it('应该处理工具调用', async () => {
      const result = await queryEngine.query('Read the README.md file');
      expect(result.success).toBe(true);
    });

    it('应该处理多轮对话', async () => {
      const result1 = await queryEngine.query('Hello!');
      expect(result1.success).toBe(true);

      const result2 = await queryEngine.query('What did I just say?');
      expect(result2.success).toBe(true);
    });
  });

  describe('错误处理', () => {
    it('应该处理 API 错误', async () => {
      const errorEngine = new QueryEngine({
        apiClient: {
          sendMessage: () => Promise.reject(new Error('API Error')),
          streamMessage: vi.fn(async function* () {
            throw new Error('API Error');
          }),
          healthCheck: vi.fn(() => Promise.resolve(false)),
        },
        toolRegistry: {} as any,
      });

      const result = await errorEngine.query('test');
      expect(result.success).toBe(false);
    });
  });
});
