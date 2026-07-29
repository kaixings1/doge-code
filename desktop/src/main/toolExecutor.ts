/**
 * desktop/src/main/toolExecutor.ts — 工具执行器
 *
 * 提供两个层次的工具执行：
 * 1. createAdaptedTools() — 将 src/tools/ 的 70+ 工具适配为 QueryEngine 格式
 * 2. executeTool() — 桌面端工具面板的快捷执行器（简化版）
 */

import * as path from 'path'
import { pathToFileURL } from 'url'
import * as fs from 'fs'
import type { Tool, ToolUseContext } from '../../../src/Tool.js'
import { getEmptyToolPermissionContext } from '../../../src/Tool.js'
import { zodToJsonSchema } from '../../../src/utils/zodToJsonSchema.js'
import { getAllBaseTools } from '../../../src/tools.js'
import { getLspClientManager } from './lspClientManager.js'

// ─── 类型定义 ───

interface ToolCallInput {
  name: string
  input: Record<string, unknown>
}

interface ToolResult {
  toolUseId: string
  success: boolean
  output?: unknown
  error?: string
}

interface EngineConfig {
  provider: string
  apiKey: string
  model: string
  baseUrl: string
  workingDir: string
}

// ─── 工具上下文构建 ───

function buildToolContext(config: EngineConfig): ToolUseContext {
  const abortController = new AbortController()
  return {
    options: {
      commands: [],
      debug: false,
      mainLoopModel: config.model,
      tools: [] as Tool[],
      verbose: false,
      thinkingConfig: { type: 'none' as const },
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: true,
      agentDefinitions: [],
    },
    abortController,
    getAppState: () => ({
      toolPermissionContext: getEmptyToolPermissionContext(),
    }),
    setAppState: () => {},
    setInProgressToolUseIDs: () => {},
    setResponseLength: () => 0,
    updateFileHistoryState: (f: unknown) => f,
    updateAttributionState: (f: unknown) => f,
    readFileState: { get: () => null, set: () => {}, has: () => false },
  }
}

// ─── 创建适配 QueryEngine 的工具集 ───

export function createAdaptedTools(config: EngineConfig) {
  const srcTools = getAllBaseTools()
  console.log('[TOOLEXEC] getAllBaseTools returned', srcTools.length, 'tools',
    srcTools.map(t => t.name).slice(0, 10).join(', '))

  const adaptedTools = new Map<string, {
    name: string
    description: string
    parameters: Record<string, unknown>
    validate: (input: unknown) => { valid: boolean; errors?: string[] }
    execute: (params: unknown) => Promise<{ content: unknown }>
  }>()

  const ctx = buildToolContext(config)

  for (const srcTool of srcTools) {
    if (!srcTool || !srcTool.name) {
      console.log('[TOOLEXEC] skip tool (no name):', JSON.stringify(srcTool).slice(0, 100))
      continue
    }
    ctx.options.tools = srcTools

    adaptedTools.set(srcTool.name, {
      name: srcTool.name,
      description: srcTool.description,
      parameters: zodToJsonSchema(srcTool.inputSchema),
      validate: (input) => {
        const args = input as Record<string, unknown>
        if (!args) return { valid: false, errors: ['参数为空'] }
        return { valid: true }
      },
      execute: async (params: unknown) => {
        try {
          const args = params as Record<string, unknown>
          // 权限检查由工具内部的 checkPermissionsAndCallTool 流程处理
          // (包括 DesktopPermissionManager 弹窗)，此处不再重复检查
          const result = await srcTool.call(
            args,
            ctx,
            async () => ({ allowed: true }),
            { role: 'user', content: '' },
            null,
          )
          // srcTool.call() 返回 { data: Out } 格式，但 engine 的 executor 期望
          // { content: string } 格式。解包 data 层，提取 stdout/content 作为 content。
          const raw = (result as { data?: unknown } | null)?.data ?? result
          const content = typeof raw === 'string'
            ? raw
            : typeof raw === 'object' && raw !== null
              ? (raw as Record<string, unknown>).stdout ?? (raw as Record<string, unknown>).content ?? JSON.stringify(raw)
              : String(raw ?? '')
          return { content }
        } catch (e) {
          const message = e instanceof Error ? e.message : '未知错误'
          throw new Error(message)
        }
      },
    })
  }

  // 桌面端补充工具：SnipTool（裁剪历史上下文）
  try {
    const { SnipTool: SnipToolCls } = require('../../../src/tools/SnipTool/SnipTool.js')
    const snipInstance = SnipToolCls()
    adaptedTools.set('SnipTool', {
      name: 'SnipTool',
      description: '裁剪历史上下文以减少 token 使用量',
      parameters: { type: 'object', properties: { lines: { type: 'number' }, keepRecent: { type: 'number' }, preserveSystem: { type: 'boolean' } } },
      validate: (input) => {
        const args = input as Record<string, unknown>
        if (!args) return { valid: false, errors: ['参数为空'] }
        return { valid: true }
      },
      execute: async (params: unknown) => {
        const args = params as Record<string, unknown>
        const result = await snipInstance.call(
          { lines: args.lines ?? 100, keepRecent: args.keepRecent ?? 50, preserveSystem: args.preserveSystem ?? true, target: 'all' },
          ctx,
          async () => ({ allowed: true }),
          { role: 'user', content: '' },
          null,
        )
        return result
      },
    })
  } catch { /* SnipTool 不可用，静默忽略 */ }

  return adaptedTools
}

// ─── 桌面端快捷工具执行器（工具面板用） ───

let adaptedToolsCache: Map<string, {
  name: string
  description: string
  parameters: Record<string, unknown>
  validate: (input: unknown) => { valid: boolean; errors?: string[] }
  execute: (params: unknown) => Promise<{ content: unknown }>
}> | null = null

function getAdaptedTools(config: EngineConfig): Map<string, {
  name: string
  description: string
  parameters: Record<string, unknown>
  validate: (input: unknown) => { valid: boolean; errors?: string[] }
  execute: (params: unknown) => Promise<{ content: unknown }>
}> {
  if (!adaptedToolsCache) {
    adaptedToolsCache = createAdaptedTools(config)
  }
  return adaptedToolsCache
}

export function resetAdaptedToolsCache(): void {
  adaptedToolsCache = null
}

export async function executeTool(call: ToolCallInput, config: EngineConfig | null, projectRoot: string): Promise<ToolResult> {
  const { name, input } = call
  const toolUseId = 'tool_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)

  if (!config) {
    return { toolUseId, success: false, error: '引擎配置未就绪，请先连接 API' }
  }

  try {
    const tools = getAdaptedTools(config)
    const adapted = tools.get(name)
    if (!adapted) {
      return { toolUseId, success: false, error: '未知工具: ' + name }
    }

    const validation = adapted.validate(input)
    if (!validation.valid) {
      return { toolUseId, success: false, error: '参数无效: ' + (validation.errors || []).join(', ') }
    }

    const result = await adapted.execute(input)
    const output = typeof result.content === 'string' ? result.content : JSON.stringify(result.content)
    return { toolUseId, success: true, output }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '未知错误'
    return { toolUseId, success: false, error: message }
  }
}

