import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MCPManager } from '../../services/mcp/manager.js';

describe('MCP 集成测试', () => {
  let mcpManager: MCPManager;

  beforeAll(async () => {
    mcpManager = new MCPManager({
      enabled: true,
      servers: {
        test: {
          command: 'node',
          args: ['-e', 'console.log("ok")'],
        },
      },
    });

    await mcpManager.initialize();
  });

  afterAll(async () => {
    await mcpManager.destroy();
  });

  describe('服务器管理', () => {
    it('应该连接服务器', () => {
      const connection = mcpManager.getConnection('test');
      expect(connection).toBeDefined();
    });

    it('应该列出所有服务器', () => {
      const servers = mcpManager.getAllConnections();
      expect(servers.size).toBe(1);
    });

    it('应该断开服务器', async () => {
      await mcpManager.disconnect('test');
      expect(mcpManager.getConnection('test')).toBeUndefined();
    });
  });

  describe('工具调用', () => {
    it('应该列出工具', async () => {
      const tools = await mcpManager.listTools();
      expect(Array.isArray(tools)).toBe(true);
    });

    it('应该调用工具', async () => {
      const result = await mcpManager.callTool('test', 'echo', { text: 'hello' });
      expect(result).toBeDefined();
    });
  });
});