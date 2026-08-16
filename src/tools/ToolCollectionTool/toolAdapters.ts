/**
 * toolAdapters.ts — 现有工具到 ToolRegistry 的适配器（吸收 OpenManus 精华）
 *
 * 将 src/tools/ 下的工具包装为 ToolAdapter，统一注册到 ToolRegistry。
 * 适配器负责：参数验证、权限检查、执行包装、进度上报、统计记录。
 */

import type { Tool } from '../../engine/toolScheduler.js'
import type {
  ToolAdapter,
  ToolExecutionContext,
  ToolExecutionResult,
  ToolMetadata,
  PermissionRequirement,
} from './toolRegistry.js'

// ─── 从现有工具构建元数据 ────────────────────────────────────────────

const TOOL_CATEGORY_MAP: Record<string, ToolMetadata['category']> = {
  bash: 'shell',
  shell: 'shell',
  powershell: 'shell',
  file_read: 'file',
  file_edit: 'file',
  file_write: 'file',
  file_watcher: 'file',
  multi_file_edit: 'file',
  read: 'file',
  edit: 'file',
  write: 'file',
  glob: 'file',
  grep: 'file',
  code_search: 'file',
  git: 'git',
  branch: 'git',
  web_fetch: 'web',
  web_search: 'web',
  http: 'web',
  web_browser: 'web',
  graphql: 'web',
  database: 'database',
  sql: 'database',
  agent: 'ai',
  task_create: 'system',
  task_stop: 'system',
  task_update: 'system',
  task_list: 'system',
  flow: 'system',
  state_machine: 'system',
  action_sampler: 'ai',
  tool_collection: 'system',
  mcp: 'system',
  mcp_tool_search: 'system',
  send_message: 'communication',
  event_stream: 'communication',
  queue: 'system',
  cache: 'system',
  backup: 'system',
  cron: 'system',
  schedule: 'system',
  logger: 'system',
  metrics: 'system',
  monitor: 'system',
  event_stream: 'system',
  websocket: 'communication',
  terminal_panel: 'system',
  python_interpreter: 'shell',
  compare: 'file',
  copy: 'file',
  config: 'system',
  context_collapse: 'system',
  less_permission_prompts: 'system',
  effort: 'system',
  review_artifact: 'ai',
  sandbox: 'system',
  vim_visual_mode: 'file',
  notebook_edit: 'file',
  plan_mode: 'system',
  enter_plan_mode: 'system',
  enter_worktree: 'system',
  exit_plan_mode: 'system',
  exit_worktree: 'system',
  verify_plan_execution: 'system',
  ask_user_question: 'system',
  list_mcp_resources: 'system',
  read_mcp_resource: 'system',
  send_user_file: 'file',
  multi_search: 'file',
  tungsten: 'ai',
  project_scaffolder: 'system',
}

const TOOL_TAG_MAP: Record<string, string[]> = {
  bash: ['shell', 'execute', 'terminal'],
  shell: ['shell', 'execute', 'terminal'],
  powershell: ['shell', 'execute', 'terminal', 'windows'],
  file_read: ['file', 'read', 'io'],
  file_edit: ['file', 'edit', 'write', 'io'],
  file_write: ['file', 'write', 'io'],
  multi_file_edit: ['file', 'edit', 'batch', 'io'],
  glob: ['file', 'search', 'pattern'],
  grep: ['file', 'search', 'content'],
  code_search: ['file', 'search', 'semantic'],
  git: ['git', 'vcs', 'version-control'],
  branch: ['git', 'vcs', 'branch'],
  web_fetch: ['web', 'http', 'fetch'],
  web_search: ['web', 'search', 'internet'],
  http: ['web', 'http', 'request'],
  agent: ['ai', 'subagent', 'delegate'],
  action_sampler: ['ai', 'decision', 'sampling'],
  tool_collection: ['system', 'tools', 'registry'],
  database: ['database', 'query', 'sql'],
}

function detectCategory(name: string): ToolMetadata['category'] {
  const lower = name.toLowerCase().replace(/-/g, '_')
  return TOOL_CATEGORY_MAP[lower] ?? 'system'
}

function detectTags(name: string): string[] {
  const lower = name.toLowerCase().replace(/-/g, '_')
  return TOOL_TAG_MAP[lower] ?? [name.toLowerCase()]
}

// ─── 适配器工厂 ────────────────────────────────────────────

export function createToolAdapter(tool: Tool): ToolAdapter {
  const metadata: ToolMetadata = {
    name: tool.name,
    description: tool.description,
    category: detectCategory(tool.name),
    tags: detectTags(tool.name),
    version: '1.0.0',
    inputSchema: tool.parameters,
    annotations: tool.annotations,
    outputSchema: tool.outputSchema,
    examples: [],
  }

  return {
    tool,
    metadata,

    async execute(input, context) {
      const startTime = Date.now()
      try {
        // 参数预处理
        const normalized = normalizeInput(input)
        // 参数验证
        const validation = tool.validate(normalized)
        if (!validation.valid) {
          return {
            success: false,
            error: validation.errors?.join(', ') ?? 'Validation failed',
            errorType: 'validation',
            duration: Date.now() - startTime,
          }
        }
        // 执行工具
        const result = await tool.execute(normalized, {
          timeout: context?.timeout ?? tool.timeout ?? 600_000,
          onProgress: context?.onProgress,
        })
        const duration = Date.now() - startTime
        return {
          success: true,
          output: result.content,
          duration,
          metadata: { toolName: tool.name },
        }
      } catch (e) {
        const duration = Date.now() - startTime
        const error = e instanceof Error ? e.message : String(e)
        return {
          success: false,
          error,
          errorType: classifyError(error),
          duration,
        }
      }
    },

    validate(input) {
      return tool.validate(input)
    },

    getPermissionRequirements(): PermissionRequirement[] {
      const reqs: PermissionRequirement[] = []
      const annotations = tool.annotations

      if (annotations?.destructiveHint) {
        reqs.push({ type: 'write', resource: tool.name, reason: 'Tool may modify data' })
      }
      if (annotations?.readOnlyHint) {
        reqs.push({ type: 'read', resource: tool.name, reason: 'Tool reads data' })
      }

      // 基于工具名称推断权限要求
      if (tool.name.includes('bash') || tool.name.includes('shell') || tool.name.includes('powershell')) {
        reqs.push({ type: 'execute', resource: tool.name, reason: 'Tool executes shell commands' })
      }
      if (tool.name.includes('file_edit') || tool.name.includes('file_write') || tool.name.includes('edit')) {
        reqs.push({ type: 'write', resource: tool.name, reason: 'Tool modifies files' })
      }
      if (tool.name.includes('file_read') || tool.name.includes('read')) {
        reqs.push({ type: 'read', resource: tool.name, reason: 'Tool reads files' })
      }
      if (tool.name.includes('web') || tool.name.includes('http')) {
        reqs.push({ type: 'network', resource: tool.name, reason: 'Tool makes network requests' })
      }
      if (tool.name.includes('git')) {
        reqs.push({ type: 'execute', resource: tool.name, reason: 'Tool executes git commands' })
      }

      return reqs.length > 0 ? reqs : [{ type: 'read', resource: tool.name, reason: 'Default read permission' }]
    },
  }
}

// ─── 辅助函数 ────────────────────────────────────────────

function normalizeInput(input: Record<string, unknown>): Record<string, unknown> {
  // 深度克隆，移除 undefined 值
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      result[key] = value
    }
  }
  return result
}

function classifyError(error: string): ToolExecutionResult['errorType'] {
  if (error.includes('timeout') || error.includes('ETIMEDOUT')) return 'timeout'
  if (error.includes('network') || error.includes('ECONNREFUSED') || error.includes('fetch')) return 'network'
  if (error.includes('permission') || error.includes('denied') || error.includes('EACCES')) return 'permission'
  if (error.includes('validation') || error.includes('invalid') || error.includes('schema')) return 'validation'
  return 'runtime'
}

// ─── 批量适配 ────────────────────────────────────────────

export function adaptTools(tools: Tool[]): ToolAdapter[] {
  return tools.map(createToolAdapter)
}
