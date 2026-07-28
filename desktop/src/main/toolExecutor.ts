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
import type { Tool } from '../../../src/tools.js'
import { zodToJsonSchema } from '../../../src/utils/zodToJsonSchema.js'
import { getAllBaseTools } from '../../../src/tools.js'
import { getPermissionManager } from './permissionManager.js'
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

function buildToolContext(config: EngineConfig) {
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
  }
}

// ─── 创建适配 QueryEngine 的工具集 ───

export function createAdaptedTools(config: EngineConfig) {
  const srcTools = getAllBaseTools()
  const adaptedTools = new Map<string, {
    name: string
    description: string
    parameters: Record<string, unknown>
    validate: (input: unknown) => { valid: boolean; errors?: string[] }
    execute: (params: unknown) => Promise<{ content: unknown }>
  }>()

  const ctx = buildToolContext(config)
  const pm = getPermissionManager()

  for (const srcTool of srcTools) {
    if (!srcTool || !srcTool.name) continue
    ctx.options.tools = srcTools

    adaptedTools.set(srcTool.name, {
      name: srcTool.name,
      description: srcTool.description,
      parameters: zodToJsonSchema(srcTool.inputSchema),
      validate: (_input: unknown) => ({ valid: true }),
      execute: async (params: unknown) => {
        try {
          const args = params as Record<string, unknown>
          const permCtx = {
            tool: srcTool.name,
            action: 'execute',
            params: args,
            path: (args.file_path || args.path) as string | undefined,
            command: (args.command || args.cmd) as string | undefined,
          }
          const decision = await pm.checkPermission(permCtx)
          if (decision === 'deny') {
            return { content: '用户拒绝了操作请求。' }
          }
          const result = await srcTool.call(
            args,
            ctx,
            async () => ({ allowed: decision === 'allow' || decision === 'allow_once' }),
            { role: 'user', content: '' },
            null,
          )
          return result
        } catch (e) {
          return { content: String(e instanceof Error ? e.message : '未知错误') }
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
      validate: (_input: unknown) => ({ valid: true }),
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

export async function executeTool(call: ToolCallInput, config: EngineConfig | null, projectRoot: string): Promise<ToolResult> {
  const { name, input } = call
  const toolUseId = `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  try {
    switch (name) {
      case 'BashTool': {
        const command = input.command as string
        if (typeof command !== 'string') throw new Error('command 参数缺失')
        const { execSync } = await import('node:child_process')
        const result = execSync(command, {
          cwd: config?.workingDir,
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
          timeout: 120_000,
        })
        return { toolUseId, success: true, output: result }
      }
      case 'FileReadTool': {
        const filePath = input.file_path || input.path as string
        if (!filePath) throw new Error('file_path 参数缺失')
        const content = fs.readFileSync(filePath, 'utf-8')
        return { toolUseId, success: true, output: content }
      }
      case 'FileWriteTool': {
        const writePath = input.file_path || input.path as string
        const content = input.content as string
        if (!writePath || content === undefined) throw new Error('file_path 和 content 参数缺失')
        const dir = path.dirname(writePath)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(writePath, content, 'utf-8')
        return { toolUseId, success: true, output: `已写入 ${writePath}` }
      }
      case 'GrepTool': {
        const pattern = input.pattern as string
        const searchPath = (input.path as string) || config?.workingDir || '.'
        if (!pattern) throw new Error('pattern 参数缺失')
        const { execSync: exec } = await import('node:child_process')
        const result = exec(`find "${searchPath}" -type f -not -path "*/node_modules/*" -not -path "*/dist/*" -exec grep -n "${pattern}" {} + 2>/dev/null`, {
          encoding: 'utf-8',
          maxBuffer: 5 * 1024 * 1024,
          timeout: 30_000,
        }).catch(() => '')
        return { toolUseId, success: true, output: result || '无匹配结果' }
      }
      case 'GlobTool': {
        const globPattern = input.pattern as string
        const searchDir = (input.path as string) || config?.workingDir || '.'
        if (!globPattern) throw new Error('pattern 参数缺失')
        const { execSync: exec } = await import('node:child_process')
        const result = exec(`find "${searchDir}" -path "*/node_modules" -prune -o -path "*/dist" -prune -o -name "${globPattern}" -print`, {
          encoding: 'utf-8',
          maxBuffer: 5 * 1024 * 1024,
          timeout: 30_000,
        })
        return { toolUseId, success: true, output: result }
      }
      case 'FileEditTool': {
        const editPath = input.file_path || input.path as string
        const oldText = input.oldText as string
        const newText = input.newText as string
        if (!editPath || oldText === '' || newText === '') throw new Error('file_path、oldText、newText 参数缺失')
        const content = fs.readFileSync(editPath, 'utf-8')
        if (!content.includes(oldText)) throw new Error('未找到匹配的文本')
        const updated = content.replace(oldText, newText)
        fs.writeFileSync(editPath, updated, 'utf-8')
        return { toolUseId, success: true, output: '已替换 ' + editPath + ' (' + content.split('\n').length + ' 行)' }
      }
      case 'WebFetchTool': {
        const url = input.url as string
        if (!url) throw new Error('url 参数缺失')
        const res = await fetch(url)
        const text = await res.text()
        return { toolUseId, success: true, output: text.slice(0, 50000) }
      }
      case 'HttpTool': {
        const method = (input.method as string) || 'GET'
        const url = input.url as string
        if (!url) throw new Error('url 参数缺失')
        const opts: RequestInit = { method, headers: input.headers as Record<string, string> }
        if (input.body) opts.body = typeof input.body === 'string' ? input.body : JSON.stringify(input.body)
        const res = await fetch(url, opts)
        const contentType = res.headers.get('content-type') || ''
        const output = contentType.includes('application/json') ? JSON.stringify(await res.json(), null, 2) : await res.text()
        return { toolUseId, success: true, output: 'HTTP ' + res.status + ' ' + res.statusText + '\n\n' + output.slice(0, 50000) }
      }
      case 'LSPTool': {
        const operation = input.operation as string
        const filePath = input.filePath as string
        const line = (input.line as number) || 1
        const character = (input.character as number) || 1
        if (!filePath || !operation) throw new Error('LSPTool 需要 filePath 和 operation 参数')
        const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(config?.workingDir || projectRoot, filePath)
        const uri = pathToFileURL(absolutePath).href
        const lsp = getLspClientManager(projectRoot)
        const serverName = lsp.findServerForFile(absolutePath)
        if (!serverName) return { toolUseId, success: false, error: `不支持的文件类型: ${filePath}` }

        // 确保服务器已启动
        const serverState = lsp.getServerState(serverName)
        if (!serverState?.connected) {
          const startResult = await lsp.startServer(serverName)
          if (!startResult.success) return { toolUseId, success: false, error: `LSP 服务器启动失败: ${startResult.error}` }
        }

        // 打开文档
        try {
          const content = fs.readFileSync(absolutePath, 'utf-8')
          await lsp.openDocument(serverName, uri, serverName, content)
        } catch { /* 打开文档失败，继续尝试 */ }

        // 执行 LSP 操作
        switch (operation) {
          case 'goToDefinition': {
            const locations = await lsp.definition(serverName, uri, line, character)
            return { toolUseId, success: true, output: locations.length > 0 ? JSON.stringify(locations, null, 2) : '未找到定义' }
          }
          case 'findReferences': {
            const locations = await lsp.references(serverName, uri, line, character)
            return { toolUseId, success: true, output: locations.length > 0 ? JSON.stringify(locations, null, 2) : '未找到引用' }
          }
          case 'hover': {
            const result = await lsp.hover(serverName, uri, line, character)
            return { toolUseId, success: true, output: result ? JSON.stringify(result, null, 2) : '无悬停信息' }
          }
          case 'documentSymbol': {
            const symbols = await lsp.documentSymbol(serverName, uri)
            return { toolUseId, success: true, output: symbols.length > 0 ? JSON.stringify(symbols, null, 2) : '未找到符号' }
          }
          case 'workspaceSymbol': {
            const query = (input.query as string) || ''
            const symbols = await lsp.workspaceSymbol(serverName, query)
            return { toolUseId, success: true, output: symbols.length > 0 ? JSON.stringify(symbols, null, 2) : '未找到工作区符号' }
          }
          case 'goToImplementation': {
            // implementation 方法未在 LspClientManager 中直接暴露，使用 definition 替代
            const locations = await lsp.definition(serverName, uri, line, character)
            return { toolUseId, success: true, output: locations.length > 0 ? JSON.stringify(locations, null, 2) : '未找到实现' }
          }
          default:
            return { toolUseId, success: false, error: `不支持的 LSP 操作: ${operation}` }
        }
      }
      default:
        return { toolUseId, success: false, error: '未知工具: ' + name }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '未知错误'
    return { toolUseId, success: false, error: message }
  }
}
