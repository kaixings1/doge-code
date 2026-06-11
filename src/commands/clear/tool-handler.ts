/**
 * 工具调用处理器
 * 解析并执行来自服务器的工具调用指令
 *
 * 支持的工具调用格式:
 * {"tool": "exec", "parameters": {...}}
 * {"tool": "clear", "parameters": {...}}
 */

import { exec as shellExec } from '../../utils/Shell.js'
import type { ShellCommand } from '../../utils/ShellCommand.js'

/**
 * 工具调用接口
 */
export interface ToolCall {
  tool: string
  parameters: Record<string, any>
}

/**
 * 工具执行结果
 */
export interface ToolResult {
  success: boolean
  tool: string
  parameters: Record<string, any>
  result: any
  error?: string
  timestamp: string
}

/**
 * 处理工具调用
 * @param toolCall 工具调用对象
 * @returns 工具执行结果
 */
export async function handleToolCall(toolCall: ToolCall): Promise<ToolResult> {
  const startTime = Date.now()
  
  try {
    // 验证工具调用格式
    if (!toolCall || typeof toolCall !== 'object') {
      throw new Error('无效的工具调用格式：必须是一个对象')
    }
    
    const { tool, parameters } = toolCall
    
    if (!tool || typeof tool !== 'string') {
      throw new Error('工具调用必须包含有效的 tool 字段')
    }
    
    if (!parameters || typeof parameters !== 'object') {
      throw new Error('工具调用必须包含 parameters 字段')
    }
    
    console.log(`[ToolHandler] 收到工具调用: ${tool}`, parameters)
    
    let result: any
    
    // 根据工具名称路由到相应的处理函数
    switch (tool.toLowerCase()) {
      case 'exec':
        result = await handleExecTool(parameters)
        break
      case 'clear':
        result = await handleClearTool(parameters)
        break
      case 'bash':
        result = await handleBashTool(parameters)
        break
      default:
        throw new Error(`未知的工具: ${tool}`)
    }
    
    const executionTime = Date.now() - startTime
    
    return {
      success: true,
      tool,
      parameters,
      result: {
        ...result,
        executionTime: `${executionTime}ms`
      },
      timestamp: new Date().toISOString()
    }
    
  } catch (error: any) {
    return {
      success: false,
      tool: toolCall.tool,
      parameters: toolCall.parameters,
      result: null,
      error: error.message,
      timestamp: new Date().toISOString()
    }
  }
}

/**
 * 处理 exec 工具 — 真正执行系统命令
 */
async function handleExecTool(parameters: any): Promise<any> {
  const { command, description, timeout = 30000, run_in_background = false } = parameters

  if (!command) {
    throw new Error('exec 工具需要 command 参数')
  }

  try {
    const abortController = new AbortController()
    const shellCommand: ShellCommand = await shellExec(
      command,
      abortController.signal,
      'bash' as const,
      {
        timeout,
        shouldAutoBackground: run_in_background,
      },
    )

    const execResult = await shellCommand.result

    return {
      action: 'exec',
      command,
      description: description || '执行命令',
      output: execResult.stdout || '',
      error: execResult.stderr || '',
      exitCode: execResult.code,
      interrupted: execResult.interrupted,
      status: execResult.code === 0 ? 'success' : 'failed',
    }
  } catch (error: any) {
    throw new Error(`命令执行失败: ${error.message}`)
  }
}

/**
 * 处理 clear 工具
 */
async function handleClearTool(parameters: any): Promise<any> {
  return {
    action: 'clear',
    message: '对话已清除',
    clearedItems: ['messages', 'caches', 'session_data']
  }
}

/**
 * 处理 bash 工具 — 真正执行系统命令
 */
async function handleBashTool(parameters: any): Promise<any> {
  const { command, description, timeout = 30000 } = parameters

  if (!command) {
    throw new Error('bash 工具需要 command 参数')
  }

  try {
    const abortController = new AbortController()
    const shellCommand: ShellCommand = await shellExec(
      command,
      abortController.signal,
      'bash' as const,
      { timeout },
    )

    const execResult = await shellCommand.result

    return {
      action: 'bash',
      command,
      description: description || '执行 bash 命令',
      output: execResult.stdout || '',
      error: execResult.stderr || '',
      exitCode: execResult.code,
      interrupted: execResult.interrupted,
      status: execResult.code === 0 ? 'success' : 'failed',
    }
  } catch (error: any) {
    throw new Error(`bash 命令执行失败: ${error.message}`)
  }
}

/**
 * 批量处理工具调用
 */
export async function handleToolCalls(toolCalls: ToolCall[]): Promise<ToolResult[]> {
  const results: ToolResult[] = []
  
  for (const toolCall of toolCalls) {
    const result = await handleToolCall(toolCall)
    results.push(result)
  }
  
  return results
}

/**
 * 验证工具调用格式
 */
export function validateToolCall(toolCall: any): boolean {
  if (!toolCall || typeof toolCall !== 'object') {
    return false
  }
  
  if (!toolCall.tool || typeof toolCall.tool !== 'string') {
    return false
  }
  
  if (!toolCall.parameters || typeof toolCall.parameters !== 'object') {
    return false
  }
  
  return true
}

/**
 * 支持的工具列表
 */
export const SUPPORTED_TOOLS = [
  'exec',
  'clear',
  'bash'
] as const
