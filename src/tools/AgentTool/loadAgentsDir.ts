import { feature } from 'bun:bundle'
import memoize from 'lodash-es/memoize.js'
import { basename } from 'path'
import type { SettingSource } from '../../utils/settings/constants.js'
import { z } from 'zod/v4'
import { isAutoMemoryEnabled } from '../../memdir/paths.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import {
  type McpServerConfig,
  McpServerConfigSchema,
} from '../../services/mcp/types.js'
import type { ToolUseContext } from '../../Tool.js'
import { logForDebugging } from '../../utils/debug.js'
import {
  EFFORT_LEVELS,
  type EffortValue,
  parseEffortValue,
} from '../../utils/effort.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { parsePositiveIntFromFrontmatter } from '../../utils/frontmatterParser.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { logError } from '../../utils/log.js'
import {
  loadMarkdownFilesForSubdir,
  parseAgentToolsFromFrontmatter,
  parseSlashCommandToolsFromFrontmatter,
} from '../../utils/markdownConfigLoader.js'
import {
  PERMISSION_MODES,
  type PermissionMode,
} from '../../utils/permissions/PermissionMode.js'
import {
  clearPluginAgentCache,
  loadPluginAgents,
} from '../../utils/plugins/loadPluginAgents.js'
import { HooksSchema, type HooksSettings } from '../../utils/settings/types.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import { FILE_EDIT_TOOL_NAME } from '../FileEditTool/constants.js'
import { FILE_READ_TOOL_NAME } from '../FileReadTool/prompt.js'
import { FILE_WRITE_TOOL_NAME } from '../FileWriteTool/prompt.js'
import {
  AGENT_COLORS,
  type AgentColorName,
  setAgentColor,
} from './agentColorManager.js'
import { type AgentMemoryScope, loadAgentMemoryPrompt } from './agentMemory.js'
import {
  checkAgentMemorySnapshot,
  initializeFromSnapshot,
} from './agentMemorySnapshot.js'
import { getBuiltInAgents } from './builtInAgents.js'

// 代理定义中 MCP 服务器规格的类型
// 可以是按名称引用现有服务器，也可以是内联定义 { [name]: config }
export type AgentMcpServerSpec =
  | string // 按名称引用现有服务器（如 "slack"）
  | { [name: string]: McpServerConfig } // 内联定义为 { name: config }

// 代理 MCP 服务器规格的 Zod schema
const AgentMcpServerSpecSchema = lazySchema(() =>
  z.union([
    z.string(), // 按名称引用
    z.record(z.string(), McpServerConfigSchema()), // 内联为 { name: config }
  ]),
)

// 用于 JSON 代理验证的 Zod schemas
// 注意：HooksSchema 是懒加载的，因此 AppState -> loadAgentsDir -> settings/types 的循环链
// 在模块加载时被打破
const AgentJsonSchema = lazySchema(() =>
  z.object({
    description: z.string().min(1, 'Description cannot be empty'),
    tools: z.array(z.string()).optional(),
    disallowedTools: z.array(z.string()).optional(),
    prompt: z.string().min(1, 'Prompt cannot be empty'),
    model: z
      .string()
      .trim()
      .min(1, 'Model cannot be empty')
      .transform(m => (m.toLowerCase() === 'inherit' ? 'inherit' : m))
      .optional(),
    effort: z.union([z.enum(EFFORT_LEVELS), z.number().int()]).optional(),
    permissionMode: z.enum(PERMISSION_MODES).optional(),
    mcpServers: z.array(AgentMcpServerSpecSchema()).optional(),
    hooks: HooksSchema().optional(),
    maxTurns: z.number().int().positive().optional(),
    skills: z.array(z.string()).optional(),
    initialPrompt: z.string().optional(),
    memory: z.enum(['user', 'project', 'local']).optional(),
    background: z.boolean().optional(),
    isolation: (process.env.USER_TYPE === 'ant'
      ? z.enum(['worktree', 'remote'])
      : z.enum(['worktree'])
    ).optional(),
  }),
)

const AgentsJsonSchema = lazySchema(() =>
  z.record(z.string(), AgentJsonSchema()),
)

// 所有代理的通用字段基础类型
export type BaseAgentDefinition = {
  agentType: string
  whenToUse: string
  tools?: string[]
  disallowedTools?: string[]
  skills?: string[] // 要预加载的技能名称（从逗号分隔的 frontmatter 解析）
  mcpServers?: AgentMcpServerSpec[] // 此代理特定的 MCP 服务器
  hooks?: HooksSettings // 代理启动时注册的会话级钩子
  color?: AgentColorName
  model?: string
  effort?: EffortValue
  permissionMode?: PermissionMode
  maxTurns?: number // 停止前的最大代理轮次
  filename?: string // 原始文件名（不含 .md 扩展名，用于用户/项目/受管代理）
  baseDir?: string
  criticalSystemReminder_EXPERIMENTAL?: string // 每轮用户交互时重新注入的短消息
  requiredMcpServers?: string[] // 代理可用前必须配置的 MCP 服务器名称模式
  background?: boolean // 生成时始终作为后台任务运行
  initialPrompt?: string // 预置到首轮用户交互（斜杠命令可用）
  memory?: AgentMemoryScope // 持久记忆作用域
  isolation?: 'worktree' | 'remote' // 在隔离的 git 工作树中运行，或在 CCR 中远程运行（仅限内部）
  pendingSnapshotUpdate?: { snapshotTimestamp: string }
  /** 从代理的 userContext 中省略 CLAUDE.md 层级。只读代理
   *（Explore、Plan）不需要提交/PR/lint 指南——主代理持有
   *完整的 CLAUDE.md 并解释它们的输出。每周在 3400 万+ Explore 生成中
   *节省约 5-15 Gtoken。终止开关：tengu_slim_subagent_claudemd。 */
  omitClaudeMd?: boolean
}

// 内置代理——仅动态提示词，无静态 systemPrompt 字段
export type BuiltInAgentDefinition = BaseAgentDefinition & {
  source: 'built-in'
  baseDir: 'built-in'
  callback?: () => void
  getSystemPrompt: (params: {
    toolUseContext: Pick<ToolUseContext, 'options'>
  }) => string
}

// 来自用户/项目/策略设置的自定义代理——提示词通过闭包存储
export type CustomAgentDefinition = BaseAgentDefinition & {
  getSystemPrompt: () => string
  source: SettingSource
  filename?: string
  baseDir?: string
}

// 插件代理——类似于自定义代理，但带有插件元数据，提示词通过闭包存储
export type PluginAgentDefinition = BaseAgentDefinition & {
  getSystemPrompt: () => string
  source: 'plugin'
  filename?: string
  plugin: string
}

// 所有代理类型的联合类型
export type AgentDefinition =
  | BuiltInAgentDefinition
  | CustomAgentDefinition
  | PluginAgentDefinition

// 运行时类型检查的类型守卫
export function isBuiltInAgent(
  agent: AgentDefinition,
): agent is BuiltInAgentDefinition {
  return agent.source === 'built-in'
}

export function isCustomAgent(
  agent: AgentDefinition,
): agent is CustomAgentDefinition {
  return agent.source !== 'built-in' && agent.source !== 'plugin'
}

export function isPluginAgent(
  agent: AgentDefinition,
): agent is PluginAgentDefinition {
  return agent.source === 'plugin'
}

export type AgentDefinitionsResult = {
  activeAgents: AgentDefinition[]
  allAgents: AgentDefinition[]
  failedFiles?: Array<{ path: string; error: string }>
  allowedAgentTypes?: string[]
}

export function getActiveAgentsFromList(
  allAgents: AgentDefinition[],
): AgentDefinition[] {
  const builtInAgents = allAgents.filter(a => a.source === 'built-in')
  const pluginAgents = allAgents.filter(a => a.source === 'plugin')
  const userAgents = allAgents.filter(a => a.source === 'userSettings')
  const projectAgents = allAgents.filter(a => a.source === 'projectSettings')
  const managedAgents = allAgents.filter(a => a.source === 'policySettings')
  const flagAgents = allAgents.filter(a => a.source === 'flagSettings')

  const agentGroups = [
    builtInAgents,
    pluginAgents,
    userAgents,
    projectAgents,
    flagAgents,
    managedAgents,
  ]

  const agentMap = new Map<string, AgentDefinition>()

  for (const agents of agentGroups) {
    for (const agent of agents) {
      agentMap.set(agent.agentType, agent)
    }
  }

  return Array.from(agentMap.values())
}

/**
 * 检查代理所需的 MCP 服务器是否可用。
 * 如果没有要求或所有要求均已满足则返回 true。
 * @param agent 要检查的代理
 * @param availableServers 可用 MCP 服务器名称列表（例如来自 mcp.clients）
 */
export function hasRequiredMcpServers(
  agent: AgentDefinition,
  availableServers: string[],
): boolean {
  if (!agent.requiredMcpServers || agent.requiredMcpServers.length === 0) {
    return true
  }
  // 每个必需的模式必须至少匹配一个可用服务器（不区分大小写）
  return agent.requiredMcpServers.every(pattern =>
    availableServers.some(server =>
      server.toLowerCase().includes(pattern.toLowerCase()),
    ),
  )
}

/**
 * 根据 MCP 服务器要求过滤代理。
 * 仅返回所需 MCP 服务器可用的代理。
 * @param agents 要过滤的代理列表
 * @param availableServers 可用 MCP 服务器名称列表
 */
export function filterAgentsByMcpRequirements(
  agents: AgentDefinition[],
  availableServers: string[],
): AgentDefinition[] {
  return agents.filter(agent => hasRequiredMcpServers(agent, availableServers))
}

/**
 * 检查并从项目快照初始化代理记忆。
 * 对于启用了记忆的代理，如果本地记忆不存在则将快照复制到本地。
 * 对于有更新快照的代理，记录调试消息（用户提示 TODO）。
 */
async function initializeAgentMemorySnapshots(
  agents: CustomAgentDefinition[],
): Promise<void> {
  await Promise.all(
    agents.map(async agent => {
      if (agent.memory !== 'user') return
      const result = await checkAgentMemorySnapshot(
        agent.agentType,
        agent.memory,
      )
      switch (result.action) {
        case 'initialize':
          logForDebugging(
            `正在从项目快照初始化 ${agent.agentType} 记忆`,
          )
          await initializeFromSnapshot(
            agent.agentType,
            agent.memory,
            result.snapshotTimestamp!,
          )
          break
        case 'prompt-update':
          agent.pendingSnapshotUpdate = {
            snapshotTimestamp: result.snapshotTimestamp!,
          }
          logForDebugging(
            `Newer snapshot available for ${agent.agentType} memory (snapshot: ${result.snapshotTimestamp})`,
          )
          break
      }
    }),
  )
}

export const getAgentDefinitionsWithOverrides = memoize(
  async (cwd: string): Promise<AgentDefinitionsResult> => {
    // 简单模式：跳过自定义代理，仅返回内置代理
    if (isEnvTruthy(process.env.CLAUDE_CODE_SIMPLE)) {
      const builtInAgents = getBuiltInAgents()
      return {
        activeAgents: builtInAgents,
        allAgents: builtInAgents,
      }
    }

    try {
      const markdownFiles = await loadMarkdownFilesForSubdir('agents', cwd)

      const failedFiles: Array<{ path: string; error: string }> = []
      const customAgents = markdownFiles
        .map(({ filePath, baseDir, frontmatter, content, source }) => {
          const agent = parseAgentFromMarkdown(
            filePath,
            baseDir,
            frontmatter,
            content,
            source,
          )
          if (!agent) {
            // 静默跳过非代理 markdown 文件（例如与代理定义同目录的参考文档）。
            // 仅对看起来像代理尝试的文件（frontmatter 中有 'name' 字段）报告错误。
            if (!frontmatter['name']) {
              return null
            }
            const errorMsg = getParseError(frontmatter)
            failedFiles.push({ path: filePath, error: errorMsg })
            logForDebugging(
              `Failed to parse agent from ${filePath}: ${errorMsg}`,
            )
            logEvent('tengu_agent_parse_error', {
              error:
                errorMsg as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              location:
                source as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
            })
            return null
          }
          return agent
        })
        .filter(agent => agent !== null)

      // 与记忆快照初始化同时启动插件代理加载——
      // loadPluginAgents 已记忆化且无参数，因此它是独立的。
      // 同时等待两者，以免任何一个在另一个抛出时成为浮动 promise。
      let pluginAgentsPromise = loadPluginAgents()
      if (feature('AGENT_MEMORY_SNAPSHOT') && isAutoMemoryEnabled()) {
        const [pluginAgents_] = await Promise.all([
          pluginAgentsPromise,
          initializeAgentMemorySnapshots(customAgents),
        ])
        pluginAgentsPromise = Promise.resolve(pluginAgents_)
      }
      const pluginAgents = await pluginAgentsPromise

      const builtInAgents = getBuiltInAgents()

      const allAgentsList: AgentDefinition[] = [
        ...builtInAgents,
        ...pluginAgents,
        ...customAgents,
      ]

      const activeAgents = getActiveAgentsFromList(allAgentsList)

      // 为所有活跃代理初始化颜色
      for (const agent of activeAgents) {
        if (agent.color) {
          setAgentColor(agent.agentType, agent.color)
        }
      }

      return {
        activeAgents,
        allAgents: allAgentsList,
        failedFiles: failedFiles.length > 0 ? failedFiles : undefined,
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      logForDebugging(`Error loading agent definitions: ${errorMessage}`)
      logError(error)
      // 即使出错，也要返回内置代理
      const builtInAgents = getBuiltInAgents()
      return {
        activeAgents: builtInAgents,
        allAgents: builtInAgents,
        failedFiles: [{ path: 'unknown', error: errorMessage }],
      }
    }
  },
)

export function clearAgentDefinitionsCache(): void {
  getAgentDefinitionsWithOverrides.cache.clear?.()
  clearPluginAgentCache()
}

/**
 * 辅助函数，用于确定代理文件的具体解析错误
 */
function getParseError(frontmatter: Record<string, unknown>): string {
  const agentType = frontmatter['name']
  const description = frontmatter['description']

  if (!agentType || typeof agentType !== 'string') {
    return 'Missing required "name" field in frontmatter'
  }

  if (!description || typeof description !== 'string') {
    return 'Missing required "description" field in frontmatter'
  }

  return 'Unknown parsing error'
}

/**
 * 使用 HooksSchema 从 frontmatter 解析钩子
 * @param frontmatter 包含潜在钩子的 frontmatter 对象
 * @param agentType 用于日志记录的代理类型
 * @returns 解析后的钩子设置，如果无效或缺失则返回 undefined
 */
function parseHooksFromFrontmatter(
  frontmatter: Record<string, unknown>,
  agentType: string,
): HooksSettings | undefined {
  if (!frontmatter.hooks) {
    return undefined
  }

  const result = HooksSchema().safeParse(frontmatter.hooks)
  if (!result.success) {
    logForDebugging(
      `Invalid hooks in agent '${agentType}': ${result.error.message}`,
    )
    return undefined
  }
  return result.data
}

/**
 * 从 JSON 数据解析代理定义
 */
export function parseAgentFromJson(
  name: string,
  definition: unknown,
  source: SettingSource = 'flagSettings',
): CustomAgentDefinition | null {
  try {
    const parsed = AgentJsonSchema().parse(definition)

    let tools = parseAgentToolsFromFrontmatter(parsed.tools)

    // 如果启用了记忆，注入 Write/Edit/Read 工具以供记忆访问
    if (isAutoMemoryEnabled() && parsed.memory && tools !== undefined) {
      const toolSet = new Set(tools)
      for (const tool of [
        FILE_WRITE_TOOL_NAME,
        FILE_EDIT_TOOL_NAME,
        FILE_READ_TOOL_NAME,
      ]) {
        if (!toolSet.has(tool)) {
          tools = [...tools, tool]
        }
      }
    }

    const disallowedTools =
      parsed.disallowedTools !== undefined
        ? parseAgentToolsFromFrontmatter(parsed.disallowedTools)
        : undefined

    const systemPrompt = parsed.prompt

    const agent: CustomAgentDefinition = {
      agentType: name,
      whenToUse: parsed.description,
      ...(tools !== undefined ? { tools } : {}),
      ...(disallowedTools !== undefined ? { disallowedTools } : {}),
      getSystemPrompt: () => {
        if (isAutoMemoryEnabled() && parsed.memory) {
          return (
            systemPrompt + '\n\n' + loadAgentMemoryPrompt(name, parsed.memory)
          )
        }
        return systemPrompt
      },
      source,
      ...(parsed.model ? { model: parsed.model } : {}),
      ...(parsed.effort !== undefined ? { effort: parsed.effort } : {}),
      ...(parsed.permissionMode
        ? { permissionMode: parsed.permissionMode }
        : {}),
      ...(parsed.mcpServers && parsed.mcpServers.length > 0
        ? { mcpServers: parsed.mcpServers }
        : {}),
      ...(parsed.hooks ? { hooks: parsed.hooks } : {}),
      ...(parsed.maxTurns !== undefined ? { maxTurns: parsed.maxTurns } : {}),
      ...(parsed.skills && parsed.skills.length > 0
        ? { skills: parsed.skills }
        : {}),
      ...(parsed.initialPrompt ? { initialPrompt: parsed.initialPrompt } : {}),
      ...(parsed.background ? { background: parsed.background } : {}),
      ...(parsed.memory ? { memory: parsed.memory } : {}),
      ...(parsed.isolation ? { isolation: parsed.isolation } : {}),
    }

    return agent
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logForDebugging(`Error parsing agent '${name}' from JSON: ${errorMessage}`)
    logError(error)
    return null
  }
}

/**
 * 从 JSON 对象解析多个代理
 */
export function parseAgentsFromJson(
  agentsJson: unknown,
  source: SettingSource = 'flagSettings',
): AgentDefinition[] {
  try {
    const parsed = AgentsJsonSchema().parse(agentsJson)
    return Object.entries(parsed)
      .map(([name, def]) => parseAgentFromJson(name, def, source))
      .filter((agent): agent is CustomAgentDefinition => agent !== null)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logForDebugging(`Error parsing agents from JSON: ${errorMessage}`)
    logError(error)
    return []
  }
}

/**
 * 从 markdown 文件数据解析代理定义
 */
export function parseAgentFromMarkdown(
  filePath: string,
  baseDir: string,
  frontmatter: Record<string, unknown>,
  content: string,
  source: SettingSource,
): CustomAgentDefinition | null {
  try {
    const agentType = frontmatter['name']
    let whenToUse = frontmatter['description'] as string

    // 验证必填字段——静默跳过没有任何代理 frontmatter 的文件
    //（它们很可能是同目录的参考文档）
    if (!agentType || typeof agentType !== 'string') {
      return null
    }
    if (!whenToUse || typeof whenToUse !== 'string') {
      logForDebugging(
        `Agent file ${filePath} is missing required 'description' in frontmatter`,
      )
      return null
    }

    // 反转义 whenToUse 中为了 YAML 解析而转义的换行符
    whenToUse = whenToUse.replace(/\\n/g, '\n')

    const color = frontmatter['color'] as AgentColorName | undefined
    const modelRaw = frontmatter['model']
    let model: string | undefined
    if (typeof modelRaw === 'string' && modelRaw.trim().length > 0) {
      const trimmed = modelRaw.trim()
      model = trimmed.toLowerCase() === 'inherit' ? 'inherit' : trimmed
    }

    // 解析 background 标志
    const backgroundRaw = frontmatter['background']

    if (
      backgroundRaw !== undefined &&
      backgroundRaw !== 'true' &&
      backgroundRaw !== 'false' &&
      backgroundRaw !== true &&
      backgroundRaw !== false
    ) {
      logForDebugging(
        `Agent file ${filePath} has invalid background value '${backgroundRaw}'. Must be 'true', 'false', or omitted.`,
      )
    }

    const background =
      backgroundRaw === 'true' || backgroundRaw === true ? true : undefined

    // 解析记忆作用域
    const VALID_MEMORY_SCOPES: AgentMemoryScope[] = ['user', 'project', 'local']
    const memoryRaw = frontmatter['memory'] as string | undefined
    let memory: AgentMemoryScope | undefined
    if (memoryRaw !== undefined) {
      if (VALID_MEMORY_SCOPES.includes(memoryRaw as AgentMemoryScope)) {
        memory = memoryRaw as AgentMemoryScope
      } else {
        logForDebugging(
          `Agent file ${filePath} has invalid memory value '${memoryRaw}'. Valid options: ${VALID_MEMORY_SCOPES.join(', ')}`,
        )
      }
    }

    // 解析隔离模式。'remote' 仅限内部使用；外部版本在解析时拒绝它。
    type IsolationMode = 'worktree' | 'remote'
    const VALID_ISOLATION_MODES: readonly IsolationMode[] =
      process.env.USER_TYPE === 'ant' ? ['worktree', 'remote'] : ['worktree']
    const isolationRaw = frontmatter['isolation'] as string | undefined
    let isolation: IsolationMode | undefined
    if (isolationRaw !== undefined) {
      if (VALID_ISOLATION_MODES.includes(isolationRaw as IsolationMode)) {
        isolation = isolationRaw as IsolationMode
      } else {
        logForDebugging(
          `Agent file ${filePath} has invalid isolation value '${isolationRaw}'. Valid options: ${VALID_ISOLATION_MODES.join(', ')}`,
        )
      }
    }

    // 从 frontmatter 解析 effort（支持字符串级别和整数）
    const effortRaw = frontmatter['effort']
    const parsedEffort =
      effortRaw !== undefined ? parseEffortValue(effortRaw) : undefined

    if (effortRaw !== undefined && parsedEffort === undefined) {
      logForDebugging(
        `Agent file ${filePath} has invalid effort '${effortRaw}'. Valid options: ${EFFORT_LEVELS.join(', ')} or an integer`,
      )
    }

    // 从 frontmatter 解析 permissionMode
    const permissionModeRaw = frontmatter['permissionMode'] as
      | string
      | undefined
    const isValidPermissionMode =
      permissionModeRaw &&
      (PERMISSION_MODES as readonly string[]).includes(permissionModeRaw)

    if (permissionModeRaw && !isValidPermissionMode) {
      const errorMsg = `Agent file ${filePath} has invalid permissionMode '${permissionModeRaw}'. Valid options: ${PERMISSION_MODES.join(', ')}`
      logForDebugging(errorMsg)
    }

    // 从 frontmatter 解析 maxTurns
    const maxTurnsRaw = frontmatter['maxTurns']
    const maxTurns = parsePositiveIntFromFrontmatter(maxTurnsRaw)
    if (maxTurnsRaw !== undefined && maxTurns === undefined) {
      logForDebugging(
        `Agent file ${filePath} has invalid maxTurns '${maxTurnsRaw}'. Must be a positive integer.`,
      )
    }

    // 提取文件名（不含扩展名）
    const filename = basename(filePath, '.md')

    // 从 frontmatter 解析工具列表
    let tools = parseAgentToolsFromFrontmatter(frontmatter['tools'])

    // 如果启用了记忆，注入 Write/Edit/Read 工具以供记忆访问
    if (isAutoMemoryEnabled() && memory && tools !== undefined) {
      const toolSet = new Set(tools)
      for (const tool of [
        FILE_WRITE_TOOL_NAME,
        FILE_EDIT_TOOL_NAME,
        FILE_READ_TOOL_NAME,
      ]) {
        if (!toolSet.has(tool)) {
          tools = [...tools, tool]
        }
      }
    }

    // 从 frontmatter 解析 disallowedTools
    const disallowedToolsRaw = frontmatter['disallowedTools']
    const disallowedTools =
      disallowedToolsRaw !== undefined
        ? parseAgentToolsFromFrontmatter(disallowedToolsRaw)
        : undefined

    // 从 frontmatter 解析技能列表
    const skills = parseSlashCommandToolsFromFrontmatter(frontmatter['skills'])

    const initialPromptRaw = frontmatter['initialPrompt']
    const initialPrompt =
      typeof initialPromptRaw === 'string' && initialPromptRaw.trim()
        ? initialPromptRaw
        : undefined

    // 使用与 JSON 代理相同的 Zod 验证从 frontmatter 解析 mcpServers
    const mcpServersRaw = frontmatter['mcpServers']
    let mcpServers: AgentMcpServerSpec[] | undefined
    if (Array.isArray(mcpServersRaw)) {
      mcpServers = mcpServersRaw
        .map(item => {
          const result = AgentMcpServerSpecSchema().safeParse(item)
          if (result.success) {
            return result.data
          }
          logForDebugging(
            `Agent file ${filePath} has invalid mcpServers item: ${jsonStringify(item)}. Error: ${result.error.message}`,
          )
          return null
        })
        .filter((item): item is AgentMcpServerSpec => item !== null)
    }

    // 从 frontmatter 解析钩子
    const hooks = parseHooksFromFrontmatter(frontmatter, agentType)

    const systemPrompt = content.trim()
    const agentDef: CustomAgentDefinition = {
      baseDir,
      agentType: agentType,
      whenToUse: whenToUse,
      ...(tools !== undefined ? { tools } : {}),
      ...(disallowedTools !== undefined ? { disallowedTools } : {}),
      ...(skills !== undefined ? { skills } : {}),
      ...(initialPrompt !== undefined ? { initialPrompt } : {}),
      ...(mcpServers !== undefined && mcpServers.length > 0
        ? { mcpServers }
        : {}),
      ...(hooks !== undefined ? { hooks } : {}),
      getSystemPrompt: () => {
        if (isAutoMemoryEnabled() && memory) {
          const memoryPrompt = loadAgentMemoryPrompt(agentType, memory)
          return systemPrompt + '\n\n' + memoryPrompt
        }
        return systemPrompt
      },
      source,
      filename,
      ...(color && typeof color === 'string' && AGENT_COLORS.includes(color)
        ? { color }
        : {}),
      ...(model !== undefined ? { model } : {}),
      ...(parsedEffort !== undefined ? { effort: parsedEffort } : {}),
      ...(isValidPermissionMode
        ? { permissionMode: permissionModeRaw as PermissionMode }
        : {}),
      ...(maxTurns !== undefined ? { maxTurns } : {}),
      ...(background ? { background } : {}),
      ...(memory ? { memory } : {}),
      ...(isolation ? { isolation } : {}),
    }
    return agentDef
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logForDebugging(`Error parsing agent from ${filePath}: ${errorMessage}`)
    logError(error)
    return null
  }
}
