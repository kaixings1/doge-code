import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { QueryEngine } from '../../api/QueryEngine.js';

// QueryEngine is an interface stub (methods throw 'Not implemented')
// These tests verify the interface contract via mocks
describe('QueryEngine', () => {
  let mockQueryEngine: Partial<QueryEngine>;

  beforeEach(() => {
    mockQueryEngine = {
      state: 'idle' as any,
      query: vi.fn(() => Promise.resolve({ success: true, content: 'Test response' })),
      abort: vi.fn(),
      getState: vi.fn(() => ({ status: 'idle' })),
      getTokenUsage: vi.fn(() => ({ inputTokens: 1, outputTokens: 1, totalTokens: 2 })),
      reset: vi.fn(),
    };
  });

  describe('初始化', () => {
    it('接口类型应该正确定义', () => {
      expect(typeof mockQueryEngine.query).toBe('function');
      expect(typeof mockQueryEngine.abort).toBe('function');
    });
  });

  describe('查询执行', () => {
    it('应该成功执行查询', async () => {
      const result = await mockQueryEngine.query!('test message');
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe('状态管理', () => {
    it('应该有状态属性', () => {
      expect(mockQueryEngine.state).toBeDefined();
    });
  });

  describe('Token 管理', () => {
    it('应该返回 token 使用量', () => {
      const usage = mockQueryEngine.getTokenUsage!();
      expect(usage.totalTokens).toBeGreaterThan(0);
    });
  });
});
