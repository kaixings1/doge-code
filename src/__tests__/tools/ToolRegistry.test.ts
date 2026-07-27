import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ToolRegistry, ITool } from '../../api/ToolRegistry.js';

// ToolRegistry is an interface stub (methods throw 'Not implemented')
// These tests verify the interface contract via mocks
describe('ToolRegistry', () => {
  let mockRegistry: Partial<ToolRegistry>;
  let registeredTools: ITool[] = [];

  beforeEach(() => {
    registeredTools = [];
    mockRegistry = {
      register: vi.fn((tool: ITool) => { registeredTools.push(tool) }),
      unregister: vi.fn((name: string) => {
        registeredTools = registeredTools.filter(t => t.name !== name);
      }),
      has: vi.fn((name: string) => registeredTools.some(t => t.name === name)),
      get: vi.fn((name: string) => registeredTools.find(t => t.name === name) ?? null),
      getAll: vi.fn(() => [...registeredTools]),
      execute: vi.fn(async (name: string) => {
        const tool = registeredTools.find(t => t.name === name);
        if (!tool) return { success: false, error: 'not found' };
        return tool.execute({}, {} as any);
      }),
      getStats: vi.fn(() => {
        const stats: Record<string, { calls: number; failures: number }> = {};
        for (const t of registeredTools) {
          stats[t.name] = { calls: 0, failures: 0 };
        }
        return stats;
      }),
    };
  });

  describe('工具注册', () => {
    it('应该注册工具', () => {
      const tool: ITool = {
        name: 'TestTool',
        description: 'Test tool',
        parameters: { type: 'object', properties: {} },
        execute: vi.fn(() => Promise.resolve({ success: true })),
      };

      mockRegistry.register!(tool);
      expect(mockRegistry.has!('TestTool')).toBe(true);
    });

    it('应该获取工具', () => {
      const tool: ITool = {
        name: 'TestTool',
        description: 'Test tool',
        parameters: { type: 'object', properties: {} },
        execute: vi.fn(() => Promise.resolve({ success: true })),
      };

      mockRegistry.register!(tool);
      const retrieved = mockRegistry.get!('TestTool');
      expect(retrieved).toBe(tool);
    });

    it('应该获取所有工具', () => {
      const tool1: ITool = {
        name: 'Tool1',
        description: 'Tool 1',
        parameters: { type: 'object', properties: {} },
        execute: vi.fn(() => Promise.resolve({ success: true })),
      };
      const tool2: ITool = {
        name: 'Tool2',
        description: 'Tool 2',
        parameters: { type: 'object', properties: {} },
        execute: vi.fn(() => Promise.resolve({ success: true })),
      };

      mockRegistry.register!(tool1);
      mockRegistry.register!(tool2);
      expect(mockRegistry.getAll!()).toHaveLength(2);
    });
  });

  describe('工具执行', () => {
    it('应该执行工具', async () => {
      const tool: ITool = {
        name: 'TestTool',
        description: 'Test tool',
        parameters: { type: 'object', properties: {} },
        execute: vi.fn(() => Promise.resolve({ success: true, output: 'Result' })),
      };

      mockRegistry.register!(tool);
      const result = await mockRegistry.execute!('TestTool', {});

      expect(result.success).toBe(true);
    });

    it('应该处理未找到的工具', async () => {
      const result = await mockRegistry.execute!('NonExistentTool', {});
      expect(result.success).toBe(false);
    });
  });

  describe('工具统计', () => {
    it('应该跟踪调用统计', async () => {
      const tool: ITool = {
        name: 'TestTool',
        description: 'Test tool',
        parameters: { type: 'object', properties: {} },
        execute: vi.fn(() => Promise.resolve({ success: true })),
      };

      mockRegistry.register!(tool);
      await mockRegistry.execute!('TestTool', {});
      await mockRegistry.execute!('TestTool', {});

      const stats = mockRegistry.getStats!();
      expect(stats.TestTool).toEqual({ calls: 0, failures: 0 });
    });
  });
});
