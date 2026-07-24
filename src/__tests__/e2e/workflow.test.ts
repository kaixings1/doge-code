import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootstrapServices } from '../../services/bootstrap.js';
import { QueryEngine } from '../../query/QueryEngine.js';
import { TestHelper } from '../utils/TestHelper.js';

describe('端到端测试', () => {
  let container: any;
  let queryEngine: QueryEngine;

  beforeAll(async () => {
    container = await bootstrapServices({
      api: {
        provider: 'anthropic',
        apiKey: 'test-key',
        model: 'claude-3-5-sonnet-20241022',
      },
      telemetry: {
        enabled: false,
      },
    });

    queryEngine = new QueryEngine({
      apiClient: container.get('api'),
      toolRegistry: container.get('toolRegistry'),
    });
  });

  afterAll(async () => {
    await container.destroyAll();
  });

  describe('完整工作流', () => {
    it('应该执行完整的查询流程', async () => {
      // 创建会话
      const session = await container.get('session').createSession();
      expect(session.id).toBeDefined();

      // 执行查询
      const result = await queryEngine.query('What is 2+2?');
      expect(result.success).toBe(true);

      // 检查会话更新
      const updatedSession = container.get('session').getActiveSession();
      expect(updatedSession.messages).toBeDefined();
    });

    it('应该处理工具调用', async () => {
      const result = await queryEngine.query('Read the README.md file');

      expect(result.success).toBe(true);
      expect(result.toolCalls).toBeDefined();
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
      container.get('api').sendMessage = () =>
        Promise.reject(new Error('API Error'));

      const result = await queryEngine.query('test');
      expect(result.success).toBe(false);
    });

    it('应该处理超时', async () => {
      container.get('api').sendMessage = () =>
        new Promise((resolve) => setTimeout(() => resolve('result'), 10000));

      const result = await queryEngine.query('test');
      expect(result.success).toBe(false);
    });
  });
});