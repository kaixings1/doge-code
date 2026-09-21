'use strict';
/**
 * HeartFlow MCP 鉴权 header 辅助脚本（doge-code 集成）
 *
 * doge-code 的 MCP 客户端通过 headersHelper 动态获取鉴权 header。
 * 这里从 vendor/heartflow/.env 读取 MCP_HEARTFLOW_KEY（由 HeartFlow
 * 自身管理，已被 .gitignore 排除，不进入版本库），构造 Bearer token。
 *
 * 输出格式：单行 JSON，与 doge MCP headersHelper 约定一致。
 */
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
let token = '';

try {
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.startsWith('MCP_HEARTFLOW_KEY=')) {
        token = trimmed.slice('MCP_HEARTFLOW_KEY='.length).trim();
        break;
      }
    }
  }
} catch (_) {
  /* 防御性 */
}

// 环境变量优先级高于 .env（与 HeartFlow mcp-server 一致）
const envToken =
  process.env.HEARTFLOW_MCP_TOKEN ||
  process.env.MCP_HEARTFLOW_API_KEY ||
  process.env.MCP_HEARTFLOW_KEY ||
  '';
const finalToken = envToken || token;

process.stdout.write(
  JSON.stringify({
    Authorization: finalToken ? `Bearer ${finalToken}` : '',
  }),
);