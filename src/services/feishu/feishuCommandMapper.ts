/**
 * feishuCommandMapper.ts — 飞书命令映射器
 *
 * 将飞书文本消息转换为内部 MobileRequest 命令。
 */

import type { MobileRequest, MobileCommandHandler } from '../../bridge/mobileProtocol.js'
import { recordCommand } from '../../bridge/mobileProtocol.js'

/**
 * 支持的飞书命令前缀
 */
export const FEISHU_COMMANDS: Record<string, { description: string; action: string }> = {
  '/help': { description: '显示帮助信息', action: 'help' },
  '/status': { description: '查看 Claude Code 状态', action: 'getStatus' },
  '/run': { description: '执行 shell 命令', action: 'execute' },
  '/read': { description: '读取文件内容', action: 'readFile' },
  '/write': { description: '写入文件内容', action: 'writeFile' },
  '/edit': { description: '编辑文件', action: 'editFile' },
  '/ls': { description: '列出目录内容', action: 'listFiles' },
  '/search': { description: '搜索文件内容', action: 'search' },
  '/interrupt': { description: '中断当前操作', action: 'interrupt' },
  '/cancel': { description: '取消当前任务', action: 'cancel' },
  '/history': { description: '查看命令历史', action: 'getHistory' },
  '/new': { description: '开始新会话', action: 'newSession' },
}

/**
 * 解析飞书文本消息，尝试匹配命令
 * @returns { command, params, raw } | null（如果不是命令）
 */
export function parseFeishuMessage(
  text: string,
): { command: string; action: string; params: Record<string, unknown>; raw: string } | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  // 检查是否以已知命令开头
  for (const [prefix, info] of Object.entries(FEISHU_COMMANDS)) {
    if (trimmed === prefix || trimmed.startsWith(`${prefix} `)) {
      const args = trimmed.slice(prefix.length).trim()
      const params: Record<string, unknown> = {}
      if (args) {
        if (prefix === '/run') {
          params.command = args
        } else if (prefix === '/read' || prefix === '/write' || prefix === '/edit') {
          params.path = args.split(' ')[0]
          params.content = args.slice(args.split(' ')[0]?.length ?? 0).trim() || undefined
        } else if (prefix === '/ls') {
          params.path = args || '.'
        } else if (prefix === '/search') {
          params.query = args
        } else {
          params.args = args
        }
      }
      return { command: prefix, action: info.action, params, raw: trimmed }
    }
  }

  // 非命令文本，作为普通消息发送给 Claude
  return null
}

/**
 * 将解析后的命令包装为 MobileRequest
 */
export function toMobileRequest(
  parsed: { command: string; action: string; params: Record<string, unknown>; raw: string },
  sessionId: string,
  requestId: string,
): MobileRequest {
  recordCommand(parsed.action, requestId, parsed.params)
  return {
    type: 'command',
    action: parsed.action,
    params: parsed.params,
    requestId,
    sessionId,
    timestamp: Date.now(),
  }
}

/**
 * 将普通文本包装为 MobileRequest（作为 prompt 发送给 Claude）
 */
export function toPromptRequest(
  text: string,
  sessionId: string,
  requestId: string,
): MobileRequest {
  return {
    type: 'message',
    action: 'sendMessage',
    params: { message: text },
    requestId,
    sessionId,
    timestamp: Date.now(),
  }
}
