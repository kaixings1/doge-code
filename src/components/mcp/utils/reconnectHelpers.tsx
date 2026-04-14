import type { Command } from '../../../commands.js';
import type { MCPServerConnection, ServerResource } from '../../../services/mcp/types.js';
import type { Tool } from '../../../Tool.js';
export interface ReconnectResult {
  message: string;
  success: boolean;
}

/**
 * Handles the result of a reconnect attempt and returns an appropriate user message
 */
export function handleReconnectResult(result: {
  client: MCPServerConnection;
  tools: Tool[];
  commands: Command[];
  resources?: ServerResource[];
}, serverName: string): ReconnectResult {
  switch (result.client.type) {
    case 'connected':
      return {
        message: `已重新连接到 ${serverName}。`,
        success: true
      };
    case 'needs-auth':
      return {
        message: `${serverName} 需要身份验证。请使用"身份验证"选项。`,
        success: false
      };
    case 'failed':
      return {
        message: `重新连接到 ${serverName} 失败。`,
        success: false
      };
    default:
      return {
        message: `重新连接到 ${serverName} 时出现未知结果。`,
        success: false
      };
  }
}

/**
 * Handles errors from reconnect attempts
 */
export function handleReconnectError(error: unknown, serverName: string): string {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return `重新连接到 ${serverName} 时出错：${errorMessage}`;
}
