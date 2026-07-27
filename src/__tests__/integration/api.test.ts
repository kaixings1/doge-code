import { describe, it, expect } from 'vitest';
import { queryModelWithoutStreaming, queryWithModel } from '../../services/api/claude.js';

describe('API 函数集成测试', () => {

  describe('queryModelWithoutStreaming', () => {
    it('应该是可调用的函数', () => {
      expect(typeof queryModelWithoutStreaming).toBe('function');
    });
  });

  describe('queryWithModel', () => {
    it('应该是可调用的函数', () => {
      expect(typeof queryWithModel).toBe('function');
    });
  });
});