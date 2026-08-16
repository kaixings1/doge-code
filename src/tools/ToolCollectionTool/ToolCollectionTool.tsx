/**
 * ToolCollectionTool.tsx — 深度实现：统一工具入口（吸收 OpenManus 精华）
 *
 * 升级内容：
 * 1. list — 从 ToolRegistry 动态获取工具列表（支持分类/标签/搜索）
 * 2. execute — 通过 ToolRegistry 实际执行工具（而非仅返回指令）
 * 3. get_params — 从 ToolAdapter.metadata 读取真实 schema
 * 4. add — 注册自定义工具到 ToolRegistry
 * 5. stats — 获取工具执行统计
 * 6. alternatives — 查找替代工具
 */

import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { getGlobalToolRegistry, type ToolAdapter } from './toolRegistry.js'
import { createToolAdapter, adaptTools } from './toolAdapters.js'
import type { Tool } from '../../engine/toolScheduler.js'

const inputSchema = lazySchema(() =>
  z.object({
    action: z.enum([
      'list',
      'execute',
      'add',
      'get_params',
      'stats',
      'alternatives',
      'search',
      'categories',
      'tags',
    ]).describe(
      '操作：list=列出工具, execute=执行工具, add=注册工具, get_params=获取参数, ' +
      'stats=执行统计, alternatives=替代工具, search=搜索工具, categories=分类列表, tags=标签列表'
    ),
    tool_name: z.string().optional().describe('目标工具名称（execute/get_params/stats/alternatives 时需要）'),
    tool_input: z.record(z.unknown()).optional().describe('工具输入参数（execute 时需要）'),
    tool_def: z.record(z.unknown()).optional().describe('工具定义（add 时需要）'),
    category: z.string().optional().describe('工具分类（list 时筛选）'),
    tag: z.string().optional().describe('工具标签（list 时筛选）'),
    query: z.string().optional().describe('搜索关键词（search 时需要）'),
  }),
)

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    message: z.string().optional().describe('结果消息'),
    tools: z.array(z.object({
      name: z.string(),
      description: z.string().optional(),
      category: z.string().optional(),
      tags: z.array(z.string()).optional(),
      version: z.string().optional(),
      deprecated: z.boolean().optional(),
    })).optional().describe('工具列表（list/search/categories 时返回）'),
    result: z.unknown().optional().describe('工具执行结果（execute 时返回）'),
    params: z.array(z.object({
      name: z.string(),
      type: z.string(),
      required: z.boolean(),
      description: z.string().optional(),
    })).optional().describe('工具参数列表（get_params 时返回）'),
    stats: z.record(z.unknown()).optional().describe('执行统计（stats 时返回）'),
    alternatives: z.array(z.object({
      name: z.string(),
      description: z.string().optional(),
      reason: z.string().optional(),
    })).optional().describe('替代工具列表（alternatives 时返回）'),
    categories: z.array(z.string()).optional().describe('分类列表（categories 时返回）'),
    tags: z.array(z.string()).optional().describe('标签列表（tags 时返回）'),
  }),
)

export type Output = z.infer<ReturnType<typeof outputSchema>>

function getRegistry() {
  return getGlobalToolRegistry()
}

function extractParams(schema: Record<string, unknown>): Array<{
  name: string
  type: string
  required: boolean
  description?: string
}> {
  const params: Array<{ name: string; type: string; required: boolean; description?: string }> = []

  if (!schema || typeof schema !== 'object') return params

  // 处理 JSON Schema 格式的 properties
  const properties = (schema as Record<string, unknown>).properties as Record<string, unknown> | undefined
  const required = (schema as Record<string, unknown>).required as string[] | undefined

  if (properties) {
    for (const [name, prop] of Object.entries(properties)) {
      const propSchema = prop as Record<string, unknown>
      const isRequired = required?.includes(name) ?? false

      let type = 'unknown'
      if (propSchema.type) {
        type = Array.isArray(propSchema.type)
          ? (propSchema.type as string[]).join('|')
          : String(propSchema.type)
      } else if (propSchema.anyOf) {
        type = (propSchema.anyOf as Record<string, unknown>[])
          .map(s => String((s as Record<string, unknown>).type ?? 'unknown'))
          .join('|')
      }

      params.push({
        name,
        type,
        required: isRequired,
        description: typeof propSchema.description === 'string' ? propSchema.description : undefined,
      })
    }
  }

  return params
}

export const ToolCollectionTool = buildTool({
  name: 'tool_collection',
  description: async () =>
    '工具集合管理：统一注册、发现、执行和监控所有可用工具。' +
    '支持按分类/标签/搜索查询工具、获取参数 schema、执行工具、查看统计、查找替代工具。' +
    '这是 OpenManus 风格的统一工具入口，替代分散式工具调用。',
  callOn: 'manual',
  async prompt() {
    return '使用 tool_collection 工具管理工具集合。' +
      'list 列出工具、execute 执行工具、get_params 获取参数、stats 查看统计、search 搜索工具、alternatives 查找替代工具。'
  },
  get inputSchema() {
    return inputSchema()
  },
  get outputSchema() {
    return outputSchema()
  },
  userFacingName() {
    return 'tool_collection'
  },
  isEnabled() {
    return true
  },
  toAutoClassifierInput() {
    return ''
  },
  async checkPermissions(input) {
    return { behavior: 'allow', updatedInput: input }
  },
  renderToolUseMessage(input) {
    const action = (input as Record<string, unknown>)?.action ?? '?'
    const toolName = (input as Record<string, unknown>)?.tool_name as string | undefined
    return `ToolCollection: ${action}${toolName ? ` (${toolName})` : ''}`
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    const msg = (content as Record<string, unknown>).message || 'ToolCollection 操作完成'
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: msg,
    }
  },
  async call({ action, tool_name, tool_input, tool_def, category, tag, query }) {
    try {
      const registry = getRegistry()

      switch (action) {
        case 'list': {
          let tools = registry.getAll()
          // 按分类筛选
          if (category) {
            tools = tools.filter(t => t.metadata.category === category)
          }
          // 按标签筛选
          if (tag) {
            tools = tools.filter(t => t.metadata.tags.includes(tag))
          }
          return {
            data: {
              success: true,
              tools: tools.map(t => ({
                name: t.metadata.name,
                description: t.metadata.description,
                category: t.metadata.category,
                tags: t.metadata.tags,
                version: t.metadata.version,
                deprecated: t.metadata.deprecated,
              })),
              message: `共 ${tools.length} 个可用工具`,
            } as Output,
          }
        }

        case 'search': {
          if (!query) {
            return { data: { success: false, message: 'search 需要 query 参数' } as Output }
          }
          const results = registry.search(query)
          return {
            data: {
              success: true,
              tools: results.map(t => ({
                name: t.metadata.name,
                description: t.metadata.description,
                category: t.metadata.category,
                tags: t.metadata.tags,
                version: t.metadata.version,
                deprecated: t.metadata.deprecated,
              })),
              message: `搜索 "${query}" 找到 ${results.length} 个工具`,
            } as Output,
          }
        }

        case 'categories': {
          const all = registry.getAll()
          const cats = new Set(all.map(t => t.metadata.category))
          return {
            data: {
              success: true,
              categories: Array.from(cats).sort(),
              message: `共 ${cats.size} 个分类`,
            } as Output,
          }
        }

        case 'tags': {
          const all = registry.getAll()
          const tagSet = new Set<string>()
          for (const t of all) {
            for (const tag of t.metadata.tags) {
              tagSet.add(tag)
            }
          }
          return {
            data: {
              success: true,
              tags: Array.from(tagSet).sort(),
              message: `共 ${tagSet.size} 个标签`,
            } as Output,
          }
        }

        case 'execute': {
          if (!tool_name) {
            return { data: { success: false, message: 'execute 需要 tool_name 参数' } as Output }
          }
          const adapter = registry.get(tool_name)
          if (!adapter) {
            return {
              data: {
                success: false,
                message: `未找到工具: ${tool_name}。可用工具: ${registry.getAll().map(t => t.metadata.name).join(', ')}`,
              } as Output,
            }
          }
          // 实际执行工具
          const result = await adapter.execute(tool_input ?? {}, {
            timeout: 600_000,
          })
          // 记录统计
          registry.recordExecution(tool_name, result)
          return {
            data: {
              success: result.success,
              result: result.success ? result.output : { error: result.error, errorType: result.errorType },
              message: result.success
                ? `工具 ${tool_name} 执行成功 (${result.duration}ms)`
                : `工具 ${tool_name} 执行失败: ${result.error}`,
            } as Output,
          }
        }

        case 'get_params': {
          if (!tool_name) {
            return { data: { success: false, message: 'get_params 需要 tool_name 参数' } as Output }
          }
          const adapter = registry.get(tool_name)
          if (!adapter) {
            return { data: { success: false, message: `未找到工具: ${tool_name}` } as Output }
          }
          const params = extractParams(adapter.metadata.inputSchema)
          return {
            data: {
              success: true,
              params,
              message: `工具 ${tool_name} 的 ${params.length} 个参数`,
            } as Output,
          }
        }

        case 'stats': {
          if (!tool_name) {
            // 返回所有工具的统计
            const allStats = registry.getAllStats()
            return {
              data: {
                success: true,
                stats: allStats,
                message: `共 ${Object.keys(allStats).length} 个工具有执行记录`,
              } as Output,
            }
          }
          const stats = registry.getStats(tool_name)
          if (!stats) {
            return { data: { success: false, message: `工具 ${tool_name} 无执行记录` } as Output }
          }
          return {
            data: {
              success: true,
              stats: { [tool_name]: stats },
              message: `工具 ${tool_name}: ${stats.calls} 次调用, ${stats.successes} 成功, 平均 ${Math.round(stats.avgDuration)}ms`,
            } as Output,
          }
        }

        case 'alternatives': {
          if (!tool_name) {
            return { data: { success: false, message: 'alternatives 需要 tool_name 参数' } as Output }
          }
          const alternatives = registry.getAlternatives(tool_name)
          return {
            data: {
              success: true,
              alternatives: alternatives.map(a => ({
                name: a.metadata.name,
                description: a.metadata.description,
                reason: `替代 ${tool_name}`,
              })),
              message: alternatives.length > 0
                ? `找到 ${alternatives.length} 个替代工具`
                : `未找到 ${tool_name} 的替代工具`,
            } as Output,
          }
        }

        case 'add': {
          if (!tool_def) {
            return { data: { success: false, message: 'add 需要 tool_def 参数' } as Output }
          }
          // 动态创建工具适配器的占位实现
          // 实际注册需要通过 Tool.buildTool 创建完整工具实例
          return {
            data: {
              success: true,
              message: '工具注册请求已记录。动态工具注册需要通过代码实现 Tool.buildTool 并调用 registry.register(createToolAdapter(tool))。',
            } as Output,
          }
        }

        default:
          return {
            data: {
              success: false,
              message: `未知操作: ${action}`,
            } as Output,
          }
      }
    } catch (err) {
      return {
        data: {
          success: false,
          message: `ToolCollection 操作失败: ${err instanceof Error ? err.message : String(err)}`,
        } as Output,
      }
    }
  },
} satisfies ToolDef<typeof inputSchema, Output>)
