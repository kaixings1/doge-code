import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolRegistry } from '../../tools/ToolRegistry.js';
import { TestHelper } from '../utils/TestHelper.js';

describe('ToolRegistry', () => {
  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    toolRegistry = new ToolRegistry();
  });

  describe('工具注册', () => {
    it('应该注册工具', () => {
      const tool = {
        name: 'TestTool',
        description: 'Test tool',
        parameters: {
          type: 'object',
          properties: {},
        },
        execute: vi.fn(() => Promise.resolve({ success: true })),
      };

      toolRegistry.register(tool);

      expect(toolRegistry.has('TestTool')).toBe(true);
    });

    it('应该禁止重复注册', () => {
      const tool = {
        name: 'TestTool',
        description: 'Test tool',
        parameters: { type: 'object', properties: {} },
        execute: vi.fn(() => Promise.resolve({ success: true })),
      };

      toolRegistry.register(tool);

      expect(() => toolRegistry.register(tool)).toThrow();
    });

    it('应该获取工具', () => {
      const tool = {
        name: 'TestTool',
        description: 'Test tool',
        parameters: { type: 'object', properties: {} },
        execute: vi.fn(() => Promise.resolve({ success: true })),
      };

      toolRegistry.register(tool);
      const retrieved = toolRegistry.get('TestTool');

      expect(retrieved).toBe(tool);
    });

    it('应该获取所有工具', () => {
      const tool1 = {
        name: 'Tool1',
        description: 'Tool 1',
        parameters: { type: 'object', properties: {} },
        execute: vi.fn(() => Promise.resolve({ success: true })),
      };

      const tool2 = {
        name: 'Tool2',
        description: 'Tool 2',
        parameters: { type: 'object', properties: {} },
        execute: vi.fn(() => Promise.resolve({ success: true })),
      };

      toolRegistry.register(tool1);
      toolRegistry.register(tool2);

      const all = toolRegistry.getAll();
      expect(all).toHaveLength(2);
    });
  });

  describe('工具执行', () => {
    it('应该执行工具', async () => {
      const tool = {
        name: 'TestTool',
        description: 'Test tool',
        parameters: { type: 'object', properties: {} },
        execute: vi.fn(() => Promise.resolve({ success: true, content: 'Result' })),
      };

      toolRegistry.register(tool);

      const result = await toolRegistry.execute('TestTool', {});

      expect(result.success).toBe(true);
      expect(tool.execute).toHaveBeenCalledWith({}, expect.any(Object));
    });

    it('应该处理工具错误', async () => {
      const tool = {
        name: 'TestTool',
        description: 'Test tool',
        parameters: { type: 'object', properties: {} },
        execute: vi.fn(() => Promise.reject(new Error('Tool error'))),
      };

      toolRegistry.register(tool);

      const result = await toolRegistry.execute('TestTool', {});

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('应该处理未找到的工具', async () => {
      const result = await toolRegistry.execute('NonExistentTool', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('工具统计', () => {
    it('应该跟踪调用统计', async () => {
      const tool = {
        name: 'TestTool',
        description: 'Test tool',
        parameters: { type: 'object', properties: {} },
        execute: vi.fn(() => Promise.resolve({ success: true })),
      };

      toolRegistry.register(tool);

      await toolRegistry.execute('TestTool', {});
      await toolRegistry.execute('TestTool', {});

      const stats = toolRegistry.getStats();
      expect(stats.TestTool).toEqual({ calls: 2, failures: 0 });
    });

    it('应该跟踪失败统计', async () => {
      const tool = {
        name: 'TestTool',
        description: 'Test tool',
        parameters: { type: 'object', properties: {} },
        execute: vi.fn(() => Promise.reject(new Error('Error'))),
      };

      toolRegistry.register(tool);

      await toolRegistry.execute('TestTool', {}).catch(() => {});

      const stats = toolRegistry.getStats();
      expect(stats.TestTool).toEqual({ calls: 1, failures: 1 });
    });
  });
});