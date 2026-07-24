import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ClaudeAPIClient } from '../../services/api/claude.js';

describe('API 客户端集成测试', () => {
  let apiClient: ClaudeAPIClient;

  beforeAll(() => {
    apiClient = new ClaudeAPIClient({
      enabled: true,
      apiKey: 'test-key',
      baseUrl: 'https://api.anthropic.com/v1',
      model: 'claude-3-5-sonnet-20241022',
    });
  });

  afterAll(async () => {
    await apiClient.destroy();
  });

  describe('初始化', () => {
    it('应该成功初始化', async () => {
      await apiClient.initialize();
      expect(await apiClient.healthCheck()).toBe(true);
    });

    it('应该处理无效的 API Key', async () => {
      const client = new ClaudeAPIClient({
        enabled: true,
        apiKey: 'invalid-key',
        baseUrl: 'https://api.anthropic.com/v1',
      });

      await expect(client.initialize()).rejects.toThrow();
    });
  });

  describe('消息发送', () => {
    it('应该发送消息', async () => {
      const result = await apiClient.sendMessage([
        { role: 'user', content: 'Hello!' },
      ]);

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('应该支持系统提示词', async () => {
      const result = await apiClient.sendMessage(
        [{ role: 'user', content: 'Hello!' }],
        { system: 'You are a helpful assistant.' }
      );

      expect(typeof result).toBe('string');
    });
  });

  describe('流式传输', () => {
    it('应该流式传输消息', async () => {
      const chunks: string[] = [];

      for await (const chunk of apiClient.streamMessage([
        { role: 'user', content: 'Hello!' },
      ])) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.join('')).length.toBeGreaterThan(0);
    });
  });
});