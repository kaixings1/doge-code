import type Anthropic from '@anthropic-ai/sdk'
import type {
  BetaTool,
  BetaToolUnion,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { createHash } from 'crypto'
import { SYSTEM_PROMPT_DYNAMIC_BOUNDARY } from '../constants/prompts.js'
import { getSystemContext, getUserContext } from '../context.js'
import { isAnalyticsDisabled } from '../services/analytics/config.js'
import {
  checkStatsigFeatureGate_CACHED_MAY_BE_STALE,
  getFeatureValue_CACHED_MAY_BE_STALE,
} from '../services/analytics/growthbook.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../services/analytics/index.js'
import { prefetchAllMcpResources } from '../services/mcp/client.js'
import type { ScopedMcpServerConfig } from '../services/mcp/types.js'
import { BashTool } from '../tools/BashTool/BashTool.js'
import { FileEditTool } from '../tools/FileEditTool/FileEditTool.js'
import {
  normalizeFileEditInput,
  stripTrailingWhitespace,
} from '../tools/FileEditTool/utils.js'
import { FileWriteTool } from '../tools/FileWriteTool/FileWriteTool.js'
import { getTools } from '../tools.js'
import type { AgentId } from '../types/ids.js'
import type { z } from 'zod/v4'
import { CLI_SYSPROMPT_PREFIXES } from '../constants/system.js'
import { roughTokenCountEstimation } from '../services/tokenEstimation.js'
import type { Tool, ToolPermissionContext, Tools } from '../Tool.js'
import { AGENT_TOOL_NAME } from '../tools/AgentTool/constants.js'
import type { AgentDefinition } from '../tools/AgentTool/loadAgentsDir.js'
import { EXIT_PLAN_MODE_V2_TOOL_NAME } from '../tools/ExitPlanModeTool/constants.js'
import { TASK_OUTPUT_TOOL_NAME } from '../tools/TaskOutputTool/constants.js'
import type { Message } from '../types/message.js'
import { isAgentSwarmsEnabled } from './agentSwarmsEnabled.js'
import {
  modelSupportsStructuredOutputs,
  shouldUseGlobalCacheScope,
} from './betas.js'
import { getCwd } from './cwd.js'
import { logForDebugging } from './debug.js'
import { isEnvTruthy } from './envUtils.js'
import { createUserMessage } from './messages.js'
import {
  getAPIProvider,
  isFirstPartyAnthropicBaseUrl,
} from './model/providers.js'
import {
  getFileReadIgnorePatterns,
  normalizePatternsToPath,
} from './permissions/filesystem.js'
import {
  getPlan,
  getPlanFilePath,
  persistFileSnapshotIfRemote,
} from './plans.js'
import { getPlatform } from './platform.js'
import { countFilesRoundedRg } from './ripgrep.js'
import { jsonStringify } from './slowOperations.js'
import type { SystemPrompt } from './systemPromptType.js'
import { getToolSchemaCache } from './toolSchemaCache.js'
import { windowsPathToPosixPath } from './windowsPaths.js'
import { zodToJsonSchema } from './zodToJsonSchema.js'

// 扩展的 BetaTool 类型，支持严格模式和延迟加载
type BetaToolWithExtras = BetaTool & {
  strict?: boolean
  defer_loading?: boolean
  cache_control?: {
    type: 'ephemeral'
    scope?: 'global' | 'org'
    ttl?: '5m' | '1h'
  }
  eager_input_streaming?: boolean
}

export type CacheScope = 'global' | 'org'
export type SystemPromptBlock = {
  text: string
  cacheScope: CacheScope | null
}

// 当群组功能未启用时，需要从工具 schema 中过滤的字段
const SWARM_FIELDS_BY_TOOL: Record<string, string[]> = {
  [EXIT_PLAN_MODE_V2_TOOL_NAME]: ['launchSwarm', 'teammateCount'],
  [AGENT_TOOL_NAME]: ['name', 'team_name', 'mode'],
}

/**
 * 过滤工具输入 schema 中的群组相关字段。
 * 在 isAgentSwarmsEnabled() 返回 false 时调用。
 */
function filterSwarmFieldsFromSchema(
  toolName: string,
  schema: Anthropic.Tool.InputSchema,
): Anthropic.Tool.InputSchema {
  const fieldsToRemove = SWARM_FIELDS_BY_TOOL[toolName]
  if (!fieldsToRemove || fieldsToRemove.length === 0) {
    return schema
  }

  // 克隆 schema 以避免修改原始对象
  const filtered = { ...schema }
  const props = filtered.properties
  if (props && typeof props === 'object') {
    const filteredProps = { ...(props as Record<string, unknown>) }
    for (const field of fieldsToRemove) {
      delete filteredProps[field]
    }
    filtered.properties = filteredProps
  }

  return filtered
}

export async function toolToAPISchema(
  tool: Tool,
  options: {
    getToolPermissionContext: () => Promise<ToolPermissionContext>
    tools: Tools
    agents: AgentDefinition[]
    allowedAgentTypes?: string[]
    model?: string
    /** 当为 true 时，为该工具标记 defer_loading 以支持工具搜索 */
    deferLoading?: boolean
    cacheControl?: {
      type: 'ephemeral'
      scope?: 'global' | 'org'
      ttl?: '5m' | '1h'
    }
  },
): Promise<BetaToolUnion> {
  // 会话稳定的基础 schema：名称、描述、输入 schema、严格模式、eager_input_streaming。
  // 这些信息每会话计算一次并缓存，以防止会话中 GrowthBook 开关翻转或 tool.prompt() 变化
  // 导致序列化的工具数组字节变动。详见 toolSchemaCache.ts。
  //
  // 当存在 inputJSONSchema 时，缓存键会包含它。StructuredOutput 实例共享名称 'StructuredOutput'，
  // 但每次工作流调用都携带不同的 schema —— 仅按名称缓存会返回过时的 schema。
  // MCP 工具也会设置 inputJSONSchema，但每个都有稳定的 schema，因此包含它不会影响缓存稳定性。
  const cacheKey =
    'inputJSONSchema' in tool && tool.inputJSONSchema
      ? `${tool.name}:${jsonStringify(tool.inputJSONSchema)}`
      : tool.name
  const cache = getToolSchemaCache()
  let base = cache.get(cacheKey)
  if (!base) {
    const strictToolsEnabled =
      checkStatsigFeatureGate_CACHED_MAY_BE_STALE('tengu_tool_pear')
    // 如果工具直接提供了 JSON schema 则使用，否则转换 Zod schema
    let input_schema = (
      'inputJSONSchema' in tool && tool.inputJSONSchema
        ? tool.inputJSONSchema
        : zodToJsonSchema(tool.inputSchema)
    ) as Anthropic.Tool.InputSchema

    // 当群组功能未启用时，过滤掉群组相关字段
    if (!isAgentSwarmsEnabled()) {
      input_schema = filterSwarmFieldsFromSchema(tool.name, input_schema)
    }

    base = {
      name: tool.name,
      description: await tool.prompt({
        getToolPermissionContext: options.getToolPermissionContext,
        tools: options.tools,
        agents: options.agents,
        allowedAgentTypes: options.allowedAgentTypes,
      }),
      input_schema,
    }

    // 仅当以下条件满足时才添加 strict：
    // 1. 功能标志启用
    // 2. 工具设置了 strict: true
    // 3. 提供了模型且支持结构化输出
    if (
      strictToolsEnabled &&
      tool.strict === true &&
      options.model &&
      modelSupportsStructuredOutputs(options.model)
    ) {
      base.strict = true
    }

    // 通过每个工具的 API 字段启用细粒度工具流式传输。
    // 如果不启用，API 会在发送 input_json_delta 事件之前缓冲整个工具输入参数，
    // 导致大型工具输入上出现数分钟的卡顿。仅对直接 api.anthropic.com 开放，
    // 代理（LiteLLM 等）和 Bedrock/Vertex 配合 Claude 4.5 会以 400 拒绝此字段。
    if (
      getAPIProvider() === 'firstParty' &&
      isFirstPartyAnthropicBaseUrl() &&
      (getFeatureValue_CACHED_MAY_BE_STALE('tengu_fgts', false) ||
        isEnvTruthy(process.env.CLAUDE_CODE_ENABLE_FINE_GRAINED_TOOL_STREAMING))
    ) {
      base.eager_input_streaming = true
    }

    cache.set(cacheKey, base)
  }

  // 每次请求的叠加：defer_loading 和 cache_control 因调用而异
  const schema: BetaToolWithExtras = {
    name: base.name,
    description: base.description,
    input_schema: base.input_schema,
    ...(base.strict && { strict: true }),
    ...(base.eager_input_streaming && { eager_input_streaming: true }),
  }

  // 如果请求了延迟加载，则添加标记
  if (options.deferLoading) {
    schema.defer_loading = true
  }

  if (options.cacheControl) {
    schema.cache_control = options.cacheControl
  }

  // CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS 是 beta API 形态的紧急开关。
  // 代理网关（ANTHROPIC_BASE_URL → LiteLLM → Bedrock）会拒绝像 defer_loading 这样的字段。
  // 此处的白名单会剥离所有不在基础工具允许列表中的字段，包括未来添加的字段。
  if (isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS)) {
    const allowed = new Set([
      'name',
      'description',
      'input_schema',
      'cache_control',
    ])
    const stripped = Object.keys(schema).filter(k => !allowed.has(k))
    if (stripped.length > 0) {
      logStripOnce(stripped)
      return {
        name: schema.name,
        description: schema.description,
        input_schema: schema.input_schema,
        ...(schema.cache_control && { cache_control: schema.cache_control }),
      }
    }
  }

  // 注意：我们转换为 BetaTool，但额外的字段在运行时仍然存在，并将在 API 请求中序列化。
  return schema as BetaTool
}

let loggedStrip = false
function logStripOnce(stripped: string[]): void {
  if (loggedStrip) return
  loggedStrip = true
  logForDebugging(
    `[betas] 已从工具 schema 中剥离字段：[${stripped.join(', ')}] (CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1)`,
  )
}

/**
 * 记录第一个块的信息，用于分析前缀匹配配置
 */
export function logAPIPrefix(systemPrompt: SystemPrompt): void {
  const [firstSyspromptBlock] = splitSysPromptPrefix(systemPrompt)
  const firstSystemPrompt = firstSyspromptBlock?.text
  logEvent('tengu_sysprompt_block', {
    snippet: firstSystemPrompt?.slice(
      0,
      20,
    ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    length: firstSystemPrompt?.length ?? 0,
    hash: (firstSystemPrompt
      ? createHash('sha256').update(firstSystemPrompt).digest('hex')
      : '') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })
}

/**
 * 按内容类型分割系统提示块，用于 API 匹配和缓存控制。
 *
 * 行为取决于功能标志和选项：
 *
 * 1. 存在 MCP 工具（skipGlobalCacheForSystemPrompt=true）：
 *    返回最多 3 个块，使用组织级缓存：
 *    - 归属头（cacheScope=null）
 *    - 系统提示前缀（cacheScope='org'）
 *    - 其余内容拼接（cacheScope='org'）
 *
 * 2. 全局缓存模式且存在边界标记（仅限第一方）：
 *    返回最多 4 个块：
 *    - 归属头（cacheScope=null）
 *    - 系统提示前缀（cacheScope=null）
 *    - 边界前的静态内容（cacheScope='global'）
 *    - 边界后的动态内容（cacheScope=null）
 *
 * 3. 默认模式（第三方提供商，或缺少边界标记）：
 *    返回最多 3 个块，使用组织级缓存：
 *    - 归属头（cacheScope=null）
 *    - 系统提示前缀（cacheScope='org'）
 *    - 其余内容拼接（cacheScope='org'）
 */
export function splitSysPromptPrefix(
  systemPrompt: SystemPrompt,
  options?: { skipGlobalCacheForSystemPrompt?: boolean },
): SystemPromptBlock[] {
  const useGlobalCacheFeature = shouldUseGlobalCacheScope()
  if (useGlobalCacheFeature && options?.skipGlobalCacheForSystemPrompt) {
    logEvent('tengu_sysprompt_using_tool_based_cache', {
      promptBlockCount: systemPrompt.length,
    })

    // 过滤掉边界标记，返回不带全局作用域的块
    let attributionHeader: string | undefined
    let systemPromptPrefix: string | undefined
    const rest: string[] = []

    for (const prompt of systemPrompt) {
      if (!prompt) continue
      if (prompt === SYSTEM_PROMPT_DYNAMIC_BOUNDARY) continue // 跳过边界
      if (prompt.startsWith('x-anthropic-billing-header')) {
        attributionHeader = prompt
      } else if (CLI_SYSPROMPT_PREFIXES.has(prompt)) {
        systemPromptPrefix = prompt
      } else {
        rest.push(prompt)
      }
    }

    const result: SystemPromptBlock[] = []
    if (attributionHeader) {
      result.push({ text: attributionHeader, cacheScope: null })
    }
    if (systemPromptPrefix) {
      result.push({ text: systemPromptPrefix, cacheScope: 'org' })
    }
    const restJoined = rest.join('\n\n')
    if (restJoined) {
      result.push({ text: restJoined, cacheScope: 'org' })
    }
    return result
  }

  if (useGlobalCacheFeature) {
    const boundaryIndex = systemPrompt.findIndex(
      s => s === SYSTEM_PROMPT_DYNAMIC_BOUNDARY,
    )
    if (boundaryIndex !== -1) {
      let attributionHeader: string | undefined
      let systemPromptPrefix: string | undefined
      const staticBlocks: string[] = []
      const dynamicBlocks: string[] = []

      for (let i = 0; i < systemPrompt.length; i++) {
        const block = systemPrompt[i]
        if (!block || block === SYSTEM_PROMPT_DYNAMIC_BOUNDARY) continue

        if (block.startsWith('x-anthropic-billing-header')) {
          attributionHeader = block
        } else if (CLI_SYSPROMPT_PREFIXES.has(block)) {
          systemPromptPrefix = block
        } else if (i < boundaryIndex) {
          staticBlocks.push(block)
        } else {
          dynamicBlocks.push(block)
        }
      }

      const result: SystemPromptBlock[] = []
      if (attributionHeader)
        result.push({ text: attributionHeader, cacheScope: null })
      if (systemPromptPrefix)
        result.push({ text: systemPromptPrefix, cacheScope: null })
      const staticJoined = staticBlocks.join('\n\n')
      if (staticJoined)
        result.push({ text: staticJoined, cacheScope: 'global' })
      const dynamicJoined = dynamicBlocks.join('\n\n')
      if (dynamicJoined) result.push({ text: dynamicJoined, cacheScope: null })

      logEvent('tengu_sysprompt_boundary_found', {
        blockCount: result.length,
        staticBlockLength: staticJoined.length,
        dynamicBlockLength: dynamicJoined.length,
      })

      return result
    } else {
      logEvent('tengu_sysprompt_missing_boundary_marker', {
        promptBlockCount: systemPrompt.length,
      })
    }
  }
  let attributionHeader: string | undefined
  let systemPromptPrefix: string | undefined
  const rest: string[] = []

  for (const block of systemPrompt) {
    if (!block) continue

    if (block.startsWith('x-anthropic-billing-header')) {
      attributionHeader = block
    } else if (CLI_SYSPROMPT_PREFIXES.has(block)) {
      systemPromptPrefix = block
    } else {
      rest.push(block)
    }
  }

  const result: SystemPromptBlock[] = []
  if (attributionHeader)
    result.push({ text: attributionHeader, cacheScope: null })
  if (systemPromptPrefix)
    result.push({ text: systemPromptPrefix, cacheScope: 'org' })
  const restJoined = rest.join('\n\n')
  if (restJoined) result.push({ text: restJoined, cacheScope: 'org' })
  return result
}

export function appendSystemContext(
  systemPrompt: SystemPrompt,
  context: { [k: string]: string },
): string[] {
  return [
    ...systemPrompt,
    Object.entries(context)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n'),
  ].filter(Boolean)
}

export function prependUserContext(
  messages: Message[],
  context: { [k: string]: string },
): Message[] {
  if (process.env.NODE_ENV === 'test') {
    return messages
  }

  if (Object.entries(context).length === 0) {
    return messages
  }

  return [
    createUserMessage({
      content: `<system-reminder>\n在回答用户问题时，你可以使用以下上下文：\n${Object.entries(
        context,
      )
        .map(([key, value]) => `# ${key}\n${value}`)
        .join('\n')}

      重要提示：此上下文可能与你的任务相关，也可能不相关。除非与你的任务高度相关，否则你不应回应此上下文。\n</system-reminder>\n`,
      isMeta: true,
    }),
    ...messages,
  ]
}

/**
 * 记录关于上下文和系统提示大小的指标
 */
export async function logContextMetrics(
  mcpConfigs: Record<string, ScopedMcpServerConfig>,
  toolPermissionContext: ToolPermissionContext,
): Promise<void> {
  // 如果日志记录被禁用，则提前返回
  if (isAnalyticsDisabled()) {
    return
  }
  const [{ tools: mcpTools }, tools, userContext, systemContext] =
    await Promise.all([
      prefetchAllMcpResources(mcpConfigs),
      getTools(toolPermissionContext),
      getUserContext(),
      getSystemContext(),
    ])
  // 提取各个上下文大小并计算总数
  const gitStatusSize = systemContext.gitStatus?.length ?? 0
  const claudeMdSize = userContext.claudeMd?.length ?? 0

  // 计算总上下文大小
  const totalContextSize = gitStatusSize + claudeMdSize

  // 使用 ripgrep 获取文件计数（为隐私考虑四舍五入到最接近的 10 的幂）
  const currentDir = getCwd()
  const ignorePatternsByRoot = getFileReadIgnorePatterns(toolPermissionContext)
  const normalizedIgnorePatterns = normalizePatternsToPath(
    ignorePatternsByRoot,
    currentDir,
  )
  const fileCount = await countFilesRoundedRg(
    currentDir,
    AbortSignal.timeout(1000),
    normalizedIgnorePatterns,
  )

  // 计算工具指标
  let mcpToolsCount = 0
  let mcpServersCount = 0
  let mcpToolsTokens = 0
  let nonMcpToolsCount = 0
  let nonMcpToolsTokens = 0

  const nonMcpTools = tools.filter(tool => !tool.isMcp)
  mcpToolsCount = mcpTools.length
  nonMcpToolsCount = nonMcpTools.length

  // 从 MCP 工具名称中提取唯一的服务器名称（格式：mcp__servername__toolname）
  const serverNames = new Set<string>()
  for (const tool of mcpTools) {
    const parts = tool.name.split('__')
    if (parts.length >= 3 && parts[1]) {
      serverNames.add(parts[1])
    }
  }
  mcpServersCount = serverNames.size

  // 本地估算工具 token 用于分析（避免每次会话多次 API 调用）
  for (const tool of mcpTools) {
    const schema =
      'inputJSONSchema' in tool && tool.inputJSONSchema
        ? tool.inputJSONSchema
        : zodToJsonSchema(tool.inputSchema)
    mcpToolsTokens += roughTokenCountEstimation(jsonStringify(schema))
  }
  for (const tool of nonMcpTools) {
    const schema =
      'inputJSONSchema' in tool && tool.inputJSONSchema
        ? tool.inputJSONSchema
        : zodToJsonSchema(tool.inputSchema)
    nonMcpToolsTokens += roughTokenCountEstimation(jsonStringify(schema))
  }

  logEvent('tengu_context_size', {
    git_status_size: gitStatusSize,
    claude_md_size: claudeMdSize,
    total_context_size: totalContextSize,
    project_file_count_rounded: fileCount,
    mcp_tools_count: mcpToolsCount,
    mcp_servers_count: mcpServersCount,
    mcp_tools_tokens: mcpToolsTokens,
    non_mcp_tools_count: nonMcpToolsCount,
    non_mcp_tools_tokens: nonMcpToolsTokens,
  })
}

// TODO: 将此逻辑推广到所有工具
export function normalizeToolInput<T extends Tool>(
  tool: T,
  input: z.infer<T['inputSchema']>,
  agentId?: AgentId,
): z.infer<T['inputSchema']> {
  switch (tool.name) {
    case EXIT_PLAN_MODE_V2_TOOL_NAME: {
      // 始终为 ExitPlanModeV2 注入计划内容和文件路径，以便 hooks/SDK 获取计划。
      const plan = getPlan(agentId)
      const planFilePath = getPlanFilePath(agentId)
      // 为 CCR 会话持久化文件快照，确保计划在 pod 回收后仍存在
      void persistFileSnapshotIfRemote()
      return plan !== null ? { ...input, plan, planFilePath } : input
    }
    case BashTool.name: {
      // 上游已验证，不会抛出异常
      const parsed = BashTool.inputSchema.parse(input)
      const { command, timeout, description } = parsed
      const cwd = getCwd()
      let normalizedCommand = command.replace(`cd ${cwd} && `, '')
      if (getPlatform() === 'windows') {
        normalizedCommand = normalizedCommand.replace(
          `cd ${windowsPathToPosixPath(cwd)} && `,
          '',
        )
      }

      // 将 \\; 替换为 \;（find -exec 命令常需要）
      normalizedCommand = normalizedCommand.replace(/\\\\;/g, '\\;')

      // 记录仅回显字符串的命令，以了解 Claude 通过 bash 进行交流的频率
      if (/^echo\s+["']?[^|&;><]*["']?$/i.test(normalizedCommand.trim())) {
        logEvent('tengu_bash_tool_simple_echo', {})
      }

      // 检查 run_in_background（如果设置了 CLAUDE_CODE_DISABLE_BACKGROUND_TASKS，则可能不存在）
      const run_in_background =
        'run_in_background' in parsed ? parsed.run_in_background : undefined

      // 安全：由于输入已通过 .parse() 验证，此转换是安全的。
      return {
        command: normalizedCommand,
        description,
        ...(timeout !== undefined && { timeout }),
        ...(description !== undefined && { description }),
        ...(run_in_background !== undefined && { run_in_background }),
        ...('dangerouslyDisableSandbox' in parsed &&
          parsed.dangerouslyDisableSandbox !== undefined && {
            dangerouslyDisableSandbox: parsed.dangerouslyDisableSandbox,
          }),
      } as z.infer<T['inputSchema']>
    }
    case FileEditTool.name: {
      // 上游已验证，不会抛出异常
      const parsedInput = FileEditTool.inputSchema.parse(input)

      // 这是一个针对 Claude 无法看到的 token 的变通方案
      const { file_path, edits } = normalizeFileEditInput({
        file_path: parsedInput.file_path,
        edits: [
          {
            old_string: parsedInput.old_string,
            new_string: parsedInput.new_string,
            replace_all: parsedInput.replace_all,
          },
        ],
      })

      // 安全：参见 BashTool 分支中的注释
      return {
        replace_all: edits[0]!.replace_all,
        file_path,
        old_string: edits[0]!.old_string,
        new_string: edits[0]!.new_string,
      } as z.infer<T['inputSchema']>
    }
    case FileWriteTool.name: {
      // 上游已验证，不会抛出异常
      const parsedInput = FileWriteTool.inputSchema.parse(input)

      // Markdown 使用两个尾随空格作为硬换行 —— 不应去除。
      const isMarkdown = /\.(md|mdx)$/i.test(parsedInput.file_path)

      // 安全：参见 BashTool 分支中的注释
      return {
        file_path: parsedInput.file_path,
        content: isMarkdown
          ? parsedInput.content
          : stripTrailingWhitespace(parsedInput.content),
      } as z.infer<T['inputSchema']>
    }
    case TASK_OUTPUT_TOOL_NAME: {
      // 规范化来自 AgentOutputTool/BashOutputTool 的旧参数名称
      const legacyInput = input as Record<string, unknown>
      const taskId =
        legacyInput.task_id ?? legacyInput.agentId ?? legacyInput.bash_id
      const timeout =
        legacyInput.timeout ??
        (typeof legacyInput.wait_up_to === 'number'
          ? legacyInput.wait_up_to * 1000
          : undefined)
      // 安全：参见 BashTool 分支中的注释
      return {
        task_id: taskId ?? '',
        block: legacyInput.block ?? true,
        timeout: timeout ?? 30000,
      } as z.infer<T['inputSchema']>
    }
    default:
      return input
  }
}

// 在发送到 API 之前，剥离由 normalizeToolInput 添加的字段
export function normalizeToolInputForAPI<T extends Tool>(
  tool: T,
  input: z.infer<T['inputSchema']>,
): z.infer<T['inputSchema']> {
  switch (tool.name) {
    case EXIT_PLAN_MODE_V2_TOOL_NAME: {
      // 在发送到 API 之前剥离注入的字段（schema 期望空对象）
      if (
        input &&
        typeof input === 'object' &&
        ('plan' in input || 'planFilePath' in input)
      ) {
        const { plan, planFilePath, ...rest } = input as Record<string, unknown>
        return rest as z.infer<T['inputSchema']>
      }
      return input
    }
    case FileEditTool.name: {
      // 剥离从 PR #20357 之前写入的旧会话转录中恢复的合成字段
      if (input && typeof input === 'object' && 'edits' in input) {
        const { old_string, new_string, replace_all, ...rest } =
          input as Record<string, unknown>
        return rest as z.infer<T['inputSchema']>
      }
      return input
    }
    default:
      return input
  }
}