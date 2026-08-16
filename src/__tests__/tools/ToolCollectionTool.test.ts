import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ToolCollectionTool } from '../../tools/ToolCollectionTool/ToolCollectionTool.js'
import { createToolAdapter } from '../../tools/ToolCollectionTool/toolAdapters.js'
import { getGlobalToolRegistry, resetGlobalToolRegistry } from '../../tools/ToolCollectionTool/toolRegistry.js'

// ─── Mock 工具定义 ────────────────────────────────────────────

const MOCK_TOOL_METADATA: Record<string, {
  name: string
  description: string
  category: 'file' | 'shell' | 'web' | 'git' | 'database' | 'ai' | 'system' | 'communication'
  tags: string[]
  parameters: Record<string, unknown>
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; title?: string }
  outputSchema?: Record<string, unknown>
}> = {
  bash: {
    name: 'bash',
    description: '执行 shell 命令',
    category: 'shell',
    tags: ['shell', 'execute', 'terminal'],
    parameters: {
      type: 'object',
      properties: { command: { type: 'string', description: '要执行的命令' } },
      required: ['command'],
    },
  },
  file_read: {
    name: 'file_read',
    description: '读取文件内容',
    category: 'file',
    tags: ['file', 'read', 'io'],
    parameters: {
      type: 'object',
      properties: { file_path: { type: 'string', description: '文件路径' } },
      required: ['file_path'],
    },
  },
  file_edit: {
    name: 'file_edit',
    description: '编辑文件内容',
    category: 'file',
    tags: ['file', 'edit', 'write', 'io'],
    parameters: {
      type: 'object',
      properties: { file_path: { type: 'string' }, old_string: { type: 'string' }, new_string: { type: 'string' } },
      required: ['file_path', 'old_string', 'new_string'],
    },
  },
  file_write: {
    name: 'file_write',
    description: '写入文件内容',
    category: 'file',
    tags: ['file', 'write', 'io'],
    parameters: {
      type: 'object',
      properties: { file_path: { type: 'string' }, content: { type: 'string' } },
      required: ['file_path', 'content'],
    },
  },
  grep: {
    name: 'grep',
    description: '搜索文件内容',
    category: 'file',
    tags: ['file', 'search', 'content'],
    parameters: {
      type: 'object',
      properties: { pattern: { type: 'string' }, path: { type: 'string' } },
      required: ['pattern'],
    },
  },
  git: {
    name: 'git',
    description: '执行 git 命令',
    category: 'git',
    tags: ['git', 'vcs', 'version-control'],
    parameters: {
      type: 'object',
      properties: { command: { type: 'string', description: 'git 子命令' } },
      required: ['command'],
    },
  },
  web_search: {
    name: 'web_search',
    description: '网络搜索',
    category: 'web',
    tags: ['web', 'search', 'internet'],
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: '搜索关键词' } },
      required: ['query'],
    },
  },
}

function createMockToolAdapter(
  key: string,
  overrides: {
    execute?: (input: Record<string, unknown>) => Promise<{ success: boolean; output?: unknown; error?: string; duration: number }>
  } = {}
) {
  const meta = MOCK_TOOL_METADATA[key]
  if (!meta) throw new Error(`Unknown mock tool: ${key}`)

  const mockTool = {
    name: meta.name,
    description: meta.description,
    parameters: meta.parameters,
    annotations: meta.annotations,
    outputSchema: meta.outputSchema,
    validate: (_params: unknown) => ({ valid: true } as { valid: boolean; errors?: string[] }),
    execute: overrides.execute
      ? async (_params: unknown) => {
          const result = await overrides.execute!({})
          return { content: result.output ?? result.error }
        }
      : async () => ({ content: `Mock ${meta.name} output` }),
  }

  return createToolAdapter(mockTool as any)
}

// ─── 测试 ────────────────────────────────────────────

describe('ToolCollectionTool', () => {
  beforeEach(() => {
    resetGlobalToolRegistry()
    const registry = getGlobalToolRegistry()
    const toolsToRegister = ['bash', 'file_read', 'file_edit', 'file_write', 'grep', 'git', 'web_search']
    for (const key of toolsToRegister) {
      registry.register(createMockToolAdapter(key))
    }
  })

  it('list 返回可用工具列表', async () => {
    const result = await ToolCollectionTool.call({
      action: 'list',
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.tools).toBeDefined()
    expect(result.data.tools!.length).toBeGreaterThan(0)
    expect(result.data.tools!.some((t: any) => t.name === 'bash')).toBe(true)
  })

  it('execute 定位工具但不实际执行（无 execute 实现时返回结果）', async () => {
    const result = await ToolCollectionTool.call({
      action: 'execute',
      tool_name: 'git',
      tool_input: { action: 'status' },
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.result).toBeDefined()
  })

  it('execute 需要 tool_name', async () => {
    const result = await ToolCollectionTool.call({
      action: 'execute',
    } as any)
    expect(result.data.success).toBe(false)
    expect(result.data.message).toContain('tool_name')
  })

  it('get_params 返回工具参数结构', async () => {
    const result = await ToolCollectionTool.call({
      action: 'get_params',
      tool_name: 'bash',
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.params).toBeDefined()
    expect(result.data.params!.some((p: any) => p.name === 'command')).toBe(true)
  })

  it('get_params 未知工具返回错误', async () => {
    const result = await ToolCollectionTool.call({
      action: 'get_params',
      tool_name: 'nonexistent',
    } as any)
    expect(result.data.success).toBe(false)
  })

  it('add 返回提示信息', async () => {
    const result = await ToolCollectionTool.call({
      action: 'add',
      tool_def: { name: 'test' },
    } as any)
    expect(result.data.success).toBe(true)
  })

  it('未知 action 返回错误', async () => {
    const result = await ToolCollectionTool.call({
      action: 'invalid',
    } as any)
    expect(result.data.success).toBe(false)
  })
})
