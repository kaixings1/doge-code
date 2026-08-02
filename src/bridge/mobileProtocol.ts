/**
 * mobileProtocol.ts — 移动端协议适配层
 *
 * 将移动端 App 的请求转换为内部命令/工具调用。
 * 支持的命令类型：
 * - execute: 执行 shell 命令
 * - readFile: 读取文件
 * - writeFile: 写入文件
 * - editFile: 编辑文件
 * - search: 搜索文件内容
 * - listFiles: 列出目录内容
 * - getStatus: 获取会话状态
 * - sendMessage: 发送消息到 CLI
 * - getHistory: 获取命令历史
 * - interrupt: 中断当前操作
 * - cancel: 取消任务
 */

import type { Command } from '../commands.js'

// ─── 移动端请求类型 ───

export interface MobileRequest {
  type: 'command' | 'tool' | 'message' | 'control'
  action: string
  params: Record<string, unknown>
  requestId: string
  sessionId: string
  timestamp: number
}

export interface MobileResponse {
  type: 'result' | 'error' | 'event' | 'progress'
  requestId: string
  data: unknown
  success: boolean
  timestamp: number
}

// ─── 命令处理器 ───

export interface MobileCommandHandler {
  (params: Record<string, unknown>, requestId: string): Promise<unknown>
}

export type MobileCommandMap = Record<string, MobileCommandHandler>

/**
 * 默认移动端命令处理器
 */
export const defaultMobileHandlers: MobileCommandMap = {
  /** 执行 shell 命令 */
  async execute(params, requestId) {
    const { command, cwd, timeout } = params as {
      command: string
      cwd?: string
      timeout?: number
    }
    return {
      requestId,
      command,
      cwd,
      timeout,
      status: 'queued',
      message: '命令已排队执行',
    }
  },

  /** 读取文件 */
  async readFile(params, requestId) {
    const { path, limit, offset } = params as {
      path: string
      limit?: number
      offset?: number
    }
    return {
      requestId,
      path,
      limit,
      offset,
      status: 'queued',
      message: '文件读取请求已排队',
    }
  },

  /** 写入文件 */
  async writeFile(params, requestId) {
    const { path, content } = params as { path: string; content: string }
    return {
      requestId,
      path,
      status: 'queued',
      message: '文件写入请求已排队',
    }
  },

  /** 编辑文件 */
  async editFile(params, requestId) {
    const { path, oldString, newString } = params as {
      path: string
      oldString: string
      newString: string
    }
    return {
      requestId,
      path,
      status: 'queued',
      message: '文件编辑请求已排队',
    }
  },

  /** 搜索文件内容 */
  async search(params, requestId) {
    const { pattern, path, type } = params as {
      pattern: string
      path?: string
      type?: string
    }
    return {
      requestId,
      pattern,
      path,
      type,
      status: 'queued',
      message: '搜索请求已排队',
    }
  },

  /** 列出目录内容 */
  async listFiles(params, requestId) {
    const { path, recursive } = params as { path: string; recursive?: boolean }
    return {
      requestId,
      path,
      recursive,
      status: 'queued',
      message: '目录列表请求已排队',
    }
  },

  /** 获取会话状态 */
  async getStatus(params, requestId) {
    return {
      requestId,
      status: 'connected',
      timestamp: Date.now(),
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
    }
  },

  /** 发送消息 */
  async sendMessage(params, requestId) {
    const { message } = params as { message: string }
    return {
      requestId,
      message,
      status: 'queued',
    }
  },

  /** 获取命令历史 */
  async getHistory(params, requestId) {
    const { limit } = params as { limit?: number }
    return {
      requestId,
      limit,
      history: [],
      message: '历史记录功能待实现',
    }
  },

  /** 中断当前操作 */
  async interrupt(params, requestId) {
    return {
      requestId,
      status: 'queued',
      message: '中断请求已排队',
    }
  },

  /** 取消任务 */
  async cancel(params, requestId) {
    const { taskId } = params as { taskId: string }
    return {
      requestId,
      taskId,
      status: 'queued',
      message: '取消请求已排队',
    }
  },
}

/**
 * 处理移动端请求并返回响应
 */
export async function handleMobileRequest(
  request: MobileRequest,
  handlers: MobileCommandMap = defaultMobileHandlers,
): Promise<MobileResponse> {
  const handler = handlers[request.action]
  if (!handler) {
    return {
      type: 'error',
      requestId: request.requestId,
      data: { error: `未知操作: ${request.action}` },
      success: false,
      timestamp: Date.now(),
    }
  }

  try {
    const result = await handler(request.params, request.requestId)
    return {
      type: 'result',
      requestId: request.requestId,
      data: result,
      success: true,
      timestamp: Date.now(),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      type: 'error',
      requestId: request.requestId,
      data: { error: message },
      success: false,
      timestamp: Date.now(),
    }
  }
}

/**
 * 验证移动端请求格式
 */
export function validateMobileRequest(request: unknown): request is MobileRequest {
  if (!request || typeof request !== 'object') return false
  const req = request as Record<string, unknown>
  return (
    typeof req.type === 'string' &&
    typeof req.action === 'string' &&
    typeof req.requestId === 'string' &&
    typeof req.sessionId === 'string' &&
    typeof req.timestamp === 'number' &&
    req.params !== undefined
  )
}

/**
 * 解析移动端请求字符串（JSON）
 */
export function parseMobileRequest(input: string): MobileRequest | null {
  try {
    const parsed = JSON.parse(input)
    if (validateMobileRequest(parsed)) {
      return parsed
    }
  } catch {
    // 忽略解析错误
  }
  return null
}

/**
 * 格式化移动端响应为字符串
 */
export function formatMobileResponse(response: MobileResponse): string {
  return JSON.stringify(response)
}