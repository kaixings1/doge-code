/**
 * 工具调用执行器（增强版）
 * 自动接收、处理和执行来自服务器的工具调用指令。
 *
 * 支持的格式：tool_json {"tool":"exec","parameters":{"command":"..."}}
 *
 * 增强内容（满足四项需求）：
 * - 跨平台命令映射与回退执行
 * - 命令安全校验
 * - 全局编码配置，解决中文乱码
 * - 可扩展工具注册表
 * - 详细的执行日志与错误上下文
 */

import { Bash } from '../../../tools/bash/index.js'
import { exec } from '../../utils/Shell.js'
import type { ShellCommand } from '../../utils/ShellCommand.js'
import { createStreamingCommand } from '../../utils/Shell.js'; // 新增
import { progressEmitter } from '../../tools/progressEmitter.js';       // 新增

// ==================== 全局配置（新增，可测试） ====================

export interface ToolExecutorConfig {
  /** 子进程编码，默认 'utf8' */
  encoding: BufferEncoding
  /** 结果输出编码，用于处理乱码。若为 'gbk'，将尝试从 binary 转 utf8 */
  outputEncoding: 'utf8' | 'gbk' | 'auto'
  /** 命令执行失败时是否启用平台回退 */
  fallbackOnFailure: boolean
  /** 回退尝试的最大次数（不同 shell） */
  maxFallbackAttempts: number
  /** 自定义解码函数，完全控制输出转换 */
  decodeOutput?: (text: string) => string
  /** 命令映射表（Unix -> Windows） */
  commandMappings?: Record<string, string>
  /** 备选 shell 列表，按优先级排列 */
  fallbackShells: Array<'bash' | 'powershell' | 'cmd'>
}

/** 默认全局配置 */
export const toolExecutorConfig: ToolExecutorConfig = {
  encoding: 'utf8',
  outputEncoding: 'auto',
  fallbackOnFailure: true,
  maxFallbackAttempts: 2,
  decodeOutput: undefined,
  commandMappings: {
    // 常用 Unix 命令映射到 Windows 对应命令（自动替换）
    'ls': 'dir',
    'cat': 'type',
    'rm': 'del',
    'cp': 'copy',
    'mv': 'move',
    'pwd': 'cd',
    'clear': 'cls',
    'grep': 'findstr',
    // 可继续添加
  },
  fallbackShells: ['bash', 'powershell', 'cmd'],
}

// ==================== 工具接口（保持原样） ====================

export interface ToolCall {
  tool: string
  parameters: Record<string, any>
}

export interface ToolResult {
  success: boolean
  tool: string
  parameters: Record<string, any>
  result: any
  error?: string
  timestamp: string
  executionTime: string
}

// ==================== 工具注册表（增强） ====================

type ToolExecutor = (parameters: Record<string, any>) => Promise<any>
const toolRegistry: Record<string, ToolExecutor> = {}

/** 注册自定义工具处理器 */
export function registerTool(name: string, executor: ToolExecutor): void {
  const lowerName = name.toLowerCase()
  if (toolRegistry[lowerName]) {
    console.warn(`[ToolExecutor] 工具 "${name}" 已被覆盖`)
  }
  toolRegistry[lowerName] = executor
}

/** 获取已注册的所有工具名称 */
export function registeredTools(): string[] {
  return Object.keys(toolRegistry)
}

// 预注册内置工具
registerTool('exec', executeExecTool)
registerTool('clear', executeClearTool)
registerTool('bash', executeBashTool)

// ==================== 内部辅助函数（新增） ====================

/**
 * 检测当前操作系统是否为 Windows
 */
function isWindows(): boolean {
  return process.platform === 'win32'
}

/**
 * 基础命令安全校验
 */
function validateCommand(command: string): void {
  if (!command || command.trim().length === 0) {
    throw new Error('命令不能为空')
  }
  // 可根据需要扩展更严格的安全策略
}

/**
 * 修复输出编码问题（针对 GBK 乱码场景）
 */
function normalizeOutput(text: string): string {
  const config = toolExecutorConfig
  if (config.decodeOutput) {
    return config.decodeOutput(text)
  }

  if (config.outputEncoding === 'utf8') return text

  // 自动检测：如果文本中包含常见的乱码特征，尝试修复
  if (config.outputEncoding === 'auto') {
    // 简单启发式：若存在非ASCII字节且UTF-8解码后出现替换字符，尝试binary->utf8
    const hasReplacementChars = text.includes('\ufffd')
    if (hasReplacementChars && isWindows()) {
      try {
        const fixed = Buffer.from(text, 'binary').toString('utf8')
        // 只保留可打印字符
        return fixed.replace(/[^\x20-\x7E\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g, '')
      } catch {
        return text
      }
    }
    return text
  }

  // 指定 GBK 编码
  if (config.outputEncoding === 'gbk') {
    try {
      return Buffer.from(text, 'binary').toString('utf8')
    } catch {
      return text
    }
  }
  return text
}

/**
 * 命令转换：将 Unix 命令转为当前平台可用形式
 * 支持直接映射和简单参数替换
 */
function convertCommand(command: string, shell: 'bash' | 'powershell' | 'cmd'): string {
  if (shell === 'bash') return command // 无需转换

  const parts = command.trim().split(/\s+/)
  const cmdName = parts[0]
  const args = parts.slice(1)

  const mappings = toolExecutorConfig.commandMappings || {}
  const mappedCmd = mappings[cmdName]
  if (!mappedCmd) {
    // 无映射，保持原命令（可能在 powershell/cmd 中无法执行）
    return command
  }

  if (shell === 'powershell') {
    // 对常见参数进行简单转换
    const convertedArgs = args.map(arg => {
      // 例如 -l 在 dir 中不需要，可以忽略或转为 /s /b
      if (arg === '-l' || arg === '-la') return ''
      return arg
    }).filter(Boolean)

    // 若映射为 dir，自动添加常用参数
    if (mappedCmd === 'dir') {
      return `Get-ChildItem ${convertedArgs.join(' ')}`.trim()
    }
    return `${mappedCmd} ${convertedArgs.join(' ')}`.trim()
  }

  if (shell === 'cmd') {
    const convertedArgs = args.map(arg => {
      if (arg === '-l') return '/s /b'
      return arg
    })
    return `${mappedCmd} ${convertedArgs.join(' ')}`.trim()
  }

  return command
}

/**
 * 带超时和回退的命令执行核心
 */
async function executeCommandWithFallback(
  command: string,
  signal: AbortSignal,
  timeout: number,
  runInBackground: boolean
): Promise<{ stdout: string; stderr: string; code: number; interrupted: boolean }> {
  const config = toolExecutorConfig
  let lastError: Error | undefined
  const shellsToTry = config.fallbackOnFailure
    ? config.fallbackShells.slice(0, config.maxFallbackAttempts)
    : ['bash' as const]

  for (const shell of shellsToTry) {
    try {
      const finalCommand = shell === 'bash' ? command : convertCommand(command, shell)
      console.log(`[ToolExecutor] 尝试执行 (${shell}): ${finalCommand}`)

      const shellCmd: ShellCommand = await exec(
        finalCommand,
        signal,
        shell,
        {
          timeout,
          shouldAutoBackground: runInBackground,
          env: { ...process.env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' } as Record<string, unknown>,
        },
      )

      const result = await shellCmd.result

      // 检查是否需要回退（退出码非 0 且配置允许）
      if (result.code !== 0 && config.fallbackOnFailure && shellsToTry.length > 1) {
        console.warn(`[ToolExecutor] 命令执行失败 (退出码 ${result.code})，尝试下一个 shell`)
        lastError = new Error(result.stderr || `Exit code ${result.code}`)
        continue
      }

      // 成功，规范化输出
      const stdout = normalizeOutput(result.stdout || '')
      const stderr = normalizeOutput(result.stderr || '')
      return {
        stdout,
        stderr,
        code: result.code,
        interrupted: result.interrupted,
      }
    } catch (error: any) {
      console.error(`[ToolExecutor] Shell ${shell} 执行异常:`, error.message)
      lastError = error
      // 继续尝试下一个 shell
    }
  }

  throw lastError || new Error('所有命令执行尝试均失败')
}

// ==================== 原公开函数（保持签名，增强内部） ====================

/**
 * 解析工具调用字符串
 */
export function parseToolCall(input: string): ToolCall | null {
  try {
    const jsonStr = input.replace(/^tool_json\s*/, '').trim()
    if (!jsonStr.startsWith('{')) {
      console.error('❌ 错误: [ToolExecutor] 工具调用格式错误：找不到 JSON 对象')
      return null
    }

    const data = JSON.parse(jsonStr)

    if (!data.tool || typeof data.tool !== 'string') {
      console.error('[ToolExecutor] 无效的工具调用：缺少 tool 字段')
      return null
    }

    if (!data.parameters || typeof data.parameters !== 'object') {
      console.error('[ToolExecutor] 无效的工具调用：缺少 parameters 字段')
      return null
    }

    return {
      tool: data.tool,
      parameters: data.parameters,
    }
  } catch (error: any) {
    console.error('❌ 错误: [ToolExecutor] 解析工具调用失败:', error.message)
    return null
  }
}

/**
 * 执行单个工具调用（根据注册表分发）
 */
export async function executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
  const startTime = Date.now()

  try {
    console.log(`[ToolExecutor] 执行工具: ${toolCall.tool}`)

    const executor = toolRegistry[toolCall.tool.toLowerCase()]
    if (!executor) {
      throw new Error(`未知的工具: "${toolCall.tool}"。可用工具: ${registeredTools().join(', ')}`)
    }

    const result = await executor(toolCall.parameters)
    const executionTime = Date.now() - startTime

    return {
      success: true,
      tool: toolCall.tool,
      parameters: toolCall.parameters,
      result: {
        ...result,
        executionTime: `${executionTime}ms`,
      },
      timestamp: new Date().toISOString(),
      executionTime: `${executionTime}ms`,
    }
  } catch (error: any) {
    const executionTime = Date.now() - startTime
    console.error(`[ToolExecutor] 工具 ${toolCall.tool} 执行失败:`, error.message)

    return {
      success: false,
      tool: toolCall.tool,
      parameters: toolCall.parameters,
      result: null,
      error: error.message,
      timestamp: new Date().toISOString(),
      executionTime: `${executionTime}ms`,
    }
  }
}

/**
 * 处理单个工具调用字符串并返回 JSON
 */
export async function handleToolCall(input: string): Promise<string> {
  console.log('[ToolExecutor] 收到工具调用请求')

  const toolCall = parseToolCall(input)
  if (!toolCall) {
    const errorResult: ToolResult = {
      success: false,
      tool: 'unknown',
      parameters: {},
      result: null,
      error: '无法解析工具调用格式',
      timestamp: new Date().toISOString(),
      executionTime: '0ms',
    }
    return JSON.stringify(errorResult, null, 2)
  }

  const result = await executeToolCall(toolCall)
  return JSON.stringify(result, null, 2)
}

/**
 * 批量处理工具调用
 */
export async function handleToolCalls(inputs: string[]): Promise<string[]> {
  const results: string[] = []
  for (const input of inputs) {
    try {
      const result = await handleToolCall(input)
      results.push(result)
    } catch (error: any) {
      console.error('❌ 错误: [ToolExecutor] 批量处理单条失败:', error.message)
      const failResult: ToolResult = {
        success: false,
        tool: 'unknown',
        parameters: {},
        result: null,
        error: `批量处理异常: ${error.message}`,
        timestamp: new Date().toISOString(),
        executionTime: '0ms',
      }
      results.push(JSON.stringify(failResult, null, 2))
    }
  }
  return results
}

/**
 * 检查输入是否为工具调用格式
 */
export function isToolCall(input: string): boolean {
  return input.trim().startsWith('tool_json')
}

/** 支持的工具列表 */
export const SUPPORTED_TOOLS = ['exec', 'clear', 'bash'] as const
export type SupportedTool = (typeof SUPPORTED_TOOLS)[number]

// ==================== 内置工具实现（增强） ====================

/**
 * 执行 exec 工具 —— 运行系统命令（自动平台适配与回退）
 */
async function executeExecTool(parameters: any): Promise<any> {
  const {
    command,
    description,
    timeout = 30000,
    run_in_background = false,
  } = parameters

  if (!command) {
    throw new Error('exec 工具需要 command 参数')
  }

  validateCommand(command)

  console.log(`[ToolExecutor] 执行命令: ${command}`)

  const abortController = new AbortController()
  const execResult = await executeCommandWithFallback(
    command,
    abortController.signal,
    timeout,
    run_in_background,
  )

  return {
    action: 'exec',
    command,
    description: description || '执行命令',
    output: execResult.stdout,
    error: execResult.stderr,
    exitCode: execResult.code,
    interrupted: execResult.interrupted,
    status: execResult.code === 0 ? 'success' : 'failed',
    platform: process.platform,
  }
}

/**
 * 执行 clear 工具
 */
async function executeClearTool(parameters: any): Promise<any> {
  const { clearMessages = true, clearCaches = true, clearHistory = false } = parameters

  console.log('[ToolExecutor] 执行清除操作')

  return {
    action: 'clear',
    message: '对话已清除',
    clearedItems: [
      ...(clearMessages ? ['messages'] : []),
      ...(clearCaches ? ['caches'] : []),
      ...(clearHistory ? ['history'] : []),
      'session_data',
    ],
  }
}

/**
 * 执行 bash 工具 —— 与 exec 类似，语义更明确
 */
async function executeBashTool(parameters: any): Promise<any> {
  const { command, description, timeout = 30000, id } = parameters; // id 前端可传入唯一调用 ID

  if (!command) throw new Error('bash 工具需要 command 参数');
  validateCommand(command);

  console.log(`[ToolExecutor] 执行 bash 命令（流式）: ${command}`);

  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let fullOutput = '';
    let stderrOutput = '';

    const shell = process.platform === 'win32' ? 'powershell' : 'bash'; // 简化选择
    const child = createStreamingCommand(command, shell, {
      env: { LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' },
    });

    let timedOut = false;

    // 超时处理：先清理 timer 再 kill 子进程，避免 onClose 中 clearTimeout 无效
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      // 给子进程 3 秒善后，然后强制 SIGKILL
      setTimeout(() => {
        child.kill('SIGKILL');
      }, 3000);
    }, timeout);

    child.onStdout((chunk) => {
      if (timedOut) return; // 超时后不再处理输出
      fullOutput += chunk;
      // 发射进度事件给 UI
      progressEmitter.emitProgress(id || 'unknown', {
        type: 'bash',
        output: fullOutput,
        elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
      });
    });

    child.onStderr((chunk) => {
      if (timedOut) return;
      stderrOutput += chunk;
      // 也可以将 stderr 包含进进度显示
      fullOutput += chunk;
      progressEmitter.emitProgress(id || 'unknown', {
        type: 'bash',
        output: fullOutput,
        elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
      });
    });

    child.onClose((code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`命令超时 (${timeout}ms)`));
        return;
      }
      const finalResult = {
        action: 'bash',
        command,
        description: description || '执行 bash 命令',
        output: fullOutput,
        error: stderrOutput,
        exitCode: code,
        interrupted: code === null,
        status: code === 0 ? 'success' : 'failed',
        platform: process.platform,
      };
      resolve(finalResult);
    });
  });
}