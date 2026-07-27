import { describe, it, expect } from 'vitest';
import {
  createLinkedTransportPair,
  isMcpTool,
  filterToolsByServer,
  hashMcpConfig,
  isOfficialMcpUrl,
} from '../../services/mcp/client.js';

describe('MCP 服务', () => {
  describe('Transport', () => {
    it('应该创建 transport pair', () => {
      const [client, server] = createLinkedTransportPair();
      expect(client).toBeDefined();
      expect(server).toBeDefined();
    });
  });

  describe('工具过滤', () => {
    it('应该识别 MCP 工具', () => {
      const mcpTool = {
        _originalName: 'server/tool',
        description: 'MCP tool',
        execute: async () => ({ success: true }),
      };

      expect(isMcpTool(mcpTool as any)).toBe(true);
    });

    it('应该按服务器过滤工具', () => {
      const tools = [
        { name: 'serverA/tool1', description: 'Tool 1' },
        { name: 'serverB/tool1', description: 'Tool 2' },
        { name: 'Read', description: 'Built-in tool' },
      ] as any[];

      const filtered = filterToolsByServer(tools, 'serverA');
      expect(filtered.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('URL 验证', () => {
    it('应该识别官方 MCP URL', () => {
      expect(isOfficialMcpUrl('https://mcp.example.com')).toBe(true);
      expect(isOfficialMcpUrl('https://example.com')).toBe(false);
    });
  });

  describe('配置哈希', () => {
    it('应该生成一致哈希', () => {
      const config1 = { command: 'node', args: ['test.js'] };
      const config2 = { command: 'node', args: ['test.js'] };

      expect(hashMcpConfig(config1 as any)).toBe(hashMcpConfig(config2 as any));
    });
  });
});
