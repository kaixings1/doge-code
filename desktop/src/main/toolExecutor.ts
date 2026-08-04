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
import { createRequire } from 'node:module'

const requireModule = createRequire(import.meta.url)
import type { Tool, ToolUseContext } from '../Tool.js'
import { getEmptyToolPermissionContext } from '../Tool.js'
import { zodToJsonSchema } from '../utils/zodToJsonSchema.js'
import { getAllBaseTools } from '../tools.js'
import { AgentIntegrationTool } from '../tools/AgentIntegrationTool/index.js'
import { AgentProxyTool } from '../tools/AgentProxyTool/index.js'
import { PowerTools } from '../tools/PowerTools/index.js'
import { PowerTools2 } from '../tools/PowerTools/index2.js'
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
  const srcTools = [...getAllBaseTools(), AgentIntegrationTool, AgentProxyTool, ...PowerTools, ...PowerTools2]
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
    try {
      if (!srcTool || !srcTool.name) {
        console.log('[TOOLEXEC] skip tool (no name):', JSON.stringify(srcTool).slice(0, 100))
        continue
      }
      if (!srcTool.inputSchema) {
        console.log('[TOOLEXEC] skip tool (no inputSchema):', srcTool.name)
        continue
      }
      ctx.options.tools = srcTools

      let jsonSchema: Record<string, unknown>
      try {
        jsonSchema = zodToJsonSchema(srcTool.inputSchema)
      } catch (zodErr) {
        console.error('[TOOLEXEC] zodToJsonSchema failed for tool:', srcTool.name, 'inputSchema type:', typeof srcTool.inputSchema, 'error:', zodErr instanceof Error ? zodErr.message : String(zodErr))
        jsonSchema = { type: 'object', properties: {} }
      }

      adaptedTools.set(srcTool.name, {
        name: srcTool.name,
        description: srcTool.description,
        parameters: jsonSchema,
        validate: (input) => {
          const args = input as Record<string, unknown>
          if (!args) return { valid: false, errors: ['参数为空'] }
          return { valid: true }
        },
        execute: async (params: unknown) => {
          try {
            const args = params as Record<string, unknown>
            const result = await srcTool.call(
              args,
              ctx,
              async () => ({ allowed: true }),
              { role: 'user', content: '' },
              null,
            )
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
    } catch (toolLoopErr) {
      console.error('[TOOLEXEC] unexpected error processing tool:', srcTool?.name || 'unknown', 'error:', toolLoopErr instanceof Error ? toolLoopErr.message : String(toolLoopErr))
    }
  }

  // 桌面端补充工具：SnipTool（裁剪历史上下文）
  try {
    const { SnipTool: SnipToolCls } = requireModule('../../../src/tools/SnipTool/SnipTool.js')
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

// ─── 操作快照 + 回滚 (Phase 3) ───

interface FileSnapshot {
  path: string
  content: string
  timestamp: number
}

const snapshotStore = new Map<string, FileSnapshot[]>()

/** 记录工具调用前的文件快照 */
export function takeBeforeSnapshot(toolUseId: string, files: string[]): void {
  const snapshots: FileSnapshot[] = []
  for (const fp of files) {
    try {
      const content = fs.readFileSync(fp, 'utf-8')
      snapshots.push({ path: fp, content, timestamp: Date.now() })
    } catch { /* 文件不存在则跳过 */ }
  }
  if (snapshots.length > 0) {
    snapshotStore.set(toolUseId, snapshots)
  }
}

/** 记录工具调用后的文件快照（追加到同一 toolUseId） */
export function takeAfterSnapshot(toolUseId: string, files: string[]): void {
  const existing = snapshotStore.get(toolUseId) ?? []
  for (const fp of files) {
    try {
      const content = fs.readFileSync(fp, 'utf-8')
      existing.push({ path: fp, content, timestamp: Date.now() })
    } catch { /* 跳过 */ }
  }
  snapshotStore.set(toolUseId, existing)
}

/** 回滚到工具调用前的状态 */
export function rollbackTool(toolUseId: string): string[] {
  const snapshots = snapshotStore.get(toolUseId)
  if (!snapshots || snapshots.length === 0) {
    return ['没有可回滚的快照']
  }
  const restored: string[] = []
  // 只恢复到第一个快照（执行前状态）
  const beforeSnapshots = snapshots.filter(s => s.timestamp === snapshots[0].timestamp)
  for (const snap of beforeSnapshots) {
    try {
      fs.writeFileSync(snap.path, snap.content, 'utf-8')
      restored.push(snap.path)
    } catch (e) {
      restored.push(`${snap.path}: ${e instanceof Error ? e.message : '写入失败'}`)
    }
  }
  snapshotStore.delete(toolUseId)
  return restored
}

/** 获取所有操作历史（从 snapshotStore 导出） */
export function getAllOperations(): Array<{ toolUseId: string; toolName: string; timestamp: number; files: string[]; hasSnapshot: boolean; rolledBack: boolean }> {
  const ops: Array<{ toolUseId: string; toolName: string; timestamp: number; files: string[]; hasSnapshot: boolean; rolledBack: boolean }> = []
  for (const [toolUseId, snapshots] of snapshotStore) {
    const firstSnap = snapshots[0]
    const hasBefore = snapshots.some(s => s.timestamp === firstSnap?.timestamp)
    const files = Array.from(new Set(snapshots.map(s => s.path)))
    ops.push({
      toolUseId,
      toolName: firstSnap ? extractToolName(toolUseId) : 'unknown',
      timestamp: firstSnap?.timestamp ?? Date.now(),
      files,
      hasSnapshot: hasBefore,
      rolledBack: !snapshotStore.has(toolUseId),
    })
  }
  return ops.sort((a, b) => b.timestamp - a.timestamp)
}

function extractToolName(toolUseId: string): string {
  // toolUseId format: tool_timestamp_random
  // toolName is not stored directly in snapshotStore, return generic
  return 'FileEdit'
}

/** 清理过期快照 */
export function cleanupSnapshots(maxAgeMs = 3600000): void {
  const cutoff = Date.now() - maxAgeMs
  for (const [id, snaps] of snapshotStore) {
    const allOld = snaps.every(s => s.timestamp < cutoff)
    if (allOld) snapshotStore.delete(id)
  }
}

// 每 5 分钟清理一次过期快照
setInterval(cleanupSnapshots, 300000)

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

    const toolName = name
    const args = input as Record<string, unknown>

    // Phase 3: 对文件修改类工具自动记录快照
    const shouldSnapshot = ['WriteTool', 'Edit', 'MultiEdit'].includes(toolName)
    let snapshotFiles: string[] = []
    if (shouldSnapshot) {
      const filePath = args.file_path ?? args.filePath
      if (typeof filePath === 'string' && filePath.length > 0) {
        snapshotFiles = [filePath]
      }
      // MultiEdit 可能有多文件
      const files = args.files
      if (Array.isArray(files)) {
        for (const f of files) {
          if (typeof f === 'string' && !snapshotFiles.includes(f)) snapshotFiles.push(f)
        }
      }
      takeBeforeSnapshot(toolUseId, snapshotFiles)
    }

    const result = await adapted.execute(input)
    const output = typeof result.content === 'string' ? result.content : JSON.stringify(result.content)

    // 成功后追加 after 快照
    if (shouldSnapshot && snapshotFiles.length > 0) {
      takeAfterSnapshot(toolUseId, snapshotFiles)
    }

    return { toolUseId, success: true, output }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '未知错误'
    return { toolUseId, success: false, error: message }
  }
}

