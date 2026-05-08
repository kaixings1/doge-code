import { feature } from 'bun:bundle'
import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import uniqBy from 'lodash-es/uniqBy.js'
import { dirname } from 'path'
import { getProjectRoot } from '../../bootstrap/state.js'
import {
  builtInCommandNames,
  findCommand,
  getCommands,
  type PromptCommand,
} from '../../commands.js'
import type {
  Tool,
  ToolCallProgress,
  ToolResult,
  ToolUseContext,
  ValidationResult,
} from '../../Tool.js'
import { buildTool, type ToolDef } from '../../Tool.js'
import type { Command } from '../../types/command.js'
import type {
  AssistantMessage,
  AttachmentMessage,
  Message,
  SystemMessage,
  UserMessage,
} from '../../types/message.js'
import { logForDebugging } from '../../utils/debug.js'
import type { PermissionDecision } from '../../utils/permissions/PermissionResult.js'
import { getRuleByContentsForTool } from '../../utils/permissions/permissions.js'
import {
  isOfficialMarketplaceName,
  parsePluginIdentifier,
} from '../../utils/plugins/pluginIdentifier.js'
import { buildPluginCommandTelemetryFields } from '../../utils/telemetry/pluginTelemetry.js'
import { z } from 'zod/v4'
import {
  addInvokedSkill,
  clearInvokedSkillsForAgent,
  getInvokedSkillsForAgent,
  getSessionId,
} from '../../bootstrap/state.js'
import { COMMAND_MESSAGE_TAG } from '../../constants/xml.js'
import type { CanUseToolFn } from '../../hooks/useCanUseTool.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
  logEvent,
} from '../../services/analytics/index.js'
import { getAgentContext } from '../../utils/agentContext.js'
import { errorMessage } from '../../utils/errors.js'
import {
  extractResultText,
  prepareForkedCommandContext,
} from '../../utils/forkedAgent.js'
import { parseFrontmatter } from '../../utils/frontmatterParser.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { createUserMessage, normalizeMessages } from '../../utils/messages.js'
import type { ModelAlias } from '../../utils/model/aliases.js'
import { resolveSkillModelOverride } from '../../utils/model/model.js'
import { recordSkillUsage } from '../../utils/suggestions/skillUsageTracking.js'
import { createAgentId } from '../../utils/uuid.js'
import { runAgent } from '../AgentTool/runAgent.js'
import {
  getToolUseIDFromParentMessage,
  tagMessagesWithToolUseID,
} from '../utils.js'
import { SKILL_TOOL_NAME } from './constants.js'
import { getPrompt } from './prompt.js'
import {
  renderToolResultMessage,
  renderToolUseErrorMessage,
  renderToolUseMessage,
  renderToolUseProgressMessage,
  renderToolUseRejectedMessage,
} from './UI.js'

/**
 * Gets all commands including MCP skills/prompts from AppState.
 * SkillTool needs this because getCommands() only returns local/bundled skills.
 */
async function getAllCommands(context: ToolUseContext): Promise<Command[]> {
  // Only include MCP skills (loadedFrom === 'mcp'), not plain MCP prompts.
  // Before this filter, the model could invoke MCP prompts via SkillTool
  // if it guessed the mcp__server__prompt name — they weren't discoverable
  // but were technically reachable.
  const mcpSkills = context
    .getAppState()
    .mcp.commands.filter(
      cmd => cmd.type === 'prompt' && cmd.loadedFrom === 'mcp',
    )
  if (mcpSkills.length === 0) return getCommands(getProjectRoot())
  const localCommands = await getCommands(getProjectRoot())
  return uniqBy([...localCommands, ...mcpSkills], 'name')
}

// Re-export Progress from centralized types to break import cycles
export type { SkillToolProgress as Progress } from '../../types/tools.js'

import type { SkillToolProgress as Progress } from '../../types/tools.js'

// Conditional require for remote skill modules — static imports here would
// pull in akiBackend.ts (via remoteSkillLoader → akiBackend), which has
// module-level memoize()/lazySchema() consts that survive tree-shaking as
// side-effecting initializers. All usages are inside
// feature('EXPERIMENTAL_SKILL_SEARCH') guards, so remoteSkillModules is
// non-null at every call site.
 
const remoteSkillModules = feature('EXPERIMENTAL_SKILL_SEARCH')
  ? {
      ...(require('../../services/skillSearch/remoteSkillState.js') as typeof import('../../services/skillSearch/remoteSkillState.js')),
      ...(require('../../services/skillSearch/remoteSkillLoader.js') as typeof import('../../services/skillSearch/remoteSkillLoader.js')),
      ...(require('../../services/skillSearch/telemetry.js') as typeof import('../../services/skillSearch/telemetry.js')),
      ...(require('../../services/skillSearch/featureCheck.js') as typeof import('../../services/skillSearch/featureCheck.js')),
    }
  : null
 

/**
 * Executes a skill in a forked sub-agent context.
 * This runs the skill prompt in an isolated agent with its own token budget.
 */
async function executeForkedSkill(
  command: Command & { type: 'prompt' },
  commandName: string,
  args: string | undefined,
  context: ToolUseContext,
  canUseTool: CanUseToolFn,
  parentMessage: AssistantMessage,
  onProgress?: ToolCallProgress<Progress>,
): Promise<ToolResult<Output>> {
  const startTime = Date.now()
  const agentId = createAgentId()
  const isBuiltIn = builtInCommandNames().has(commandName)
  const isOfficialSkill = isOfficialMarketplaceSkill(command)
  const isBundled = command.source === 'bundled'
  const forkedSanitizedName =
    isBuiltIn || isBundled || isOfficialSkill ? commandName : 'custom'

  const wasDiscoveredField =
    feature('EXPERIMENTAL_SKILL_SEARCH') &&
    remoteSkillModules!.isSkillSearchEnabled()
      ? {
          was_discovered:
            context.discoveredSkillNames?.has(commandName) ?? false,
        }
      : {}
  const pluginMarketplace = command.pluginInfo
    ? parsePluginIdentifier(command.pluginInfo.repository).marketplace
    : undefined
  const queryDepth = context.queryTracking?.depth ?? 0
  const parentAgentId = getAgentContext()?.agentId
  logEvent('tengu_skill_tool_invocation', {
    command_name:
      forkedSanitizedName as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    // _PROTO_skill_name routes to the privileged skill_name BQ column
    // (unredacted, all users); command_name stays in additional_metadata as
    // the redacted variant for general-access dashboards.
    _PROTO_skill_name:
      commandName as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
    execution_context:
      'fork' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    invocation_trigger: (queryDepth > 0
      ? 'nested-skill'
      : 'claude-proactive') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    query_depth: queryDepth,
    ...(parentAgentId && {
      parent_agent_id:
        parentAgentId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    }),
    ...wasDiscoveredField,
    ...(process.env.USER_TYPE === 'ant' && {
      skill_name:
        commandName as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      skill_source:
        command.source as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      ...(command.loadedFrom && {
        skill_loaded_from:
          command.loadedFrom as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      }),
      ...(command.kind && {
        skill_kind:
          command.kind as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      }),
    }),
    ...(command.pluginInfo && {
      // _PROTO_* routes to PII-tagged plugin_name/marketplace_name BQ columns
      // (unredacted, all users); plugin_name/plugin_repository stay in
      // additional_metadata as redacted variants.
      _PROTO_plugin_name: command.pluginInfo.pluginManifest
        .name as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
      ...(pluginMarketplace && {
        _PROTO_marketplace_name:
          pluginMarketplace as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
      }),
      plugin_name: (isOfficialSkill
        ? command.pluginInfo.pluginManifest.name
        : 'third-party') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      plugin_repository: (isOfficialSkill
        ? command.pluginInfo.repository
        : 'third-party') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      ...buildPluginCommandTelemetryFields(command.pluginInfo),
    }),
  })

  const { modifiedGetAppState, baseAgent, promptMessages, skillContent } =
    await prepareForkedCommandContext(command, args || '', context)

  // Merge skill's effort into the agent definition so runAgent applies it
  const agentDefinition =
    command.effort !== undefined
      ? { ...baseAgent, effort: command.effort }
      : baseAgent

  // Collect messages from the forked agent
  const agentMessages: Message[] = []

  logForDebugging(
    `SkillTool executing forked skill ${commandName} with agent ${agentDefinition.agentType}`,
  )

  try {
    // Run the sub-agent
    for await (const message of runAgent({
      agentDefinition,
      promptMessages,
      toolUseContext: {
        ...context,
        getAppState: modifiedGetAppState,
      },
      canUseTool,
      isAsync: false,
      querySource: 'agent:custom',
      model: command.model as ModelAlias | undefined,
      availableTools: context.options.tools,
      override: { agentId },
    })) {
      agentMessages.push(message)

      // Report progress for tool uses (like AgentTool does)
      if (
        (message.type === 'assistant' || message.type === 'user') &&
        onProgress
      ) {
        const normalizedNew = normalizeMessages([message])
        for (const m of normalizedNew) {
          const hasToolContent = m.message.content.some(
            c => c.type === 'tool_use' || c.type === 'tool_result',
          )
          if (hasToolContent) {
            onProgress({
              toolUseID: `skill_${parentMessage.message.id}`,
              data: {
                message: m,
                type: 'skill_progress',
                prompt: skillContent,
                agentId,
              },
            })
          }
        }
      }
    }

    const resultText = extractResultText(
      agentMessages,
      'Skill execution completed',
    )
    // Release message memory after extracting result
    agentMessages.length = 0

    const durationMs = Date.now() - startTime
    logForDebugging(
      `SkillTool forked skill ${commandName} completed in ${durationMs}ms`,
    )

    return {
      data: {
        success: true,
        commandName,
        status: 'forked',
        agentId,
        result: resultText,
      },
    }
  } finally {
    // Release skill content from invokedSkills state
    clearInvokedSkillsForAgent(agentId)
  }
}

export const inputSchema = lazySchema(() =>
  z.object({
    skill: z
      .string()
      .describe('技能名称。例如："commit"、"review-pr" 或 "pdf"'),
    args: z.string().optional().describe('技能的可选参数'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

export const outputSchema = lazySchema(() => {
  // 内联技能的输出模式（默认）
  const inlineOutputSchema = z.object({
    success: z.boolean().describe('技能是否有效'),
    commandName: z.string().describe('技能名称'),
    allowedTools: z
      .array(z.string())
      .optional()
      .describe('此技能允许使用的工具'),
    model: z.string().optional().describe('模型覆盖（如果指定）'),
    status: z.literal('inline').optional().describe('执行状态'),
  })

  // 分支技能的输出模式
  const forkedOutputSchema = z.object({
    success: z.boolean().describe('技能是否成功完成'),
    commandName: z.string().describe('技能名称'),
    status: z.literal('forked').describe('执行状态'),
    agentId: z
      .string()
      .describe('执行技能的子代理 ID'),
    result: z.string().describe('分支技能执行的结果'),
  })

  return z.union([inlineOutputSchema, forkedOutputSchema])
})
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.input<OutputSchema>

export const SkillTool: Tool<InputSchema, Output, Progress> = buildTool({
  name: SKILL_TOOL_NAME,
  searchHint: '调用斜杠命令技能',
  maxResultSizeChars: 100_000,
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },

  description: async ({ skill }) => `执行技能：${skill}`,

  prompt: async () => getPrompt(getProjectRoot()),

  // Only one skill/command should run at a time, since the tool expands the
  // command into a full prompt that Claude must process before continuing.
  // Skill-coach needs the skill name to avoid false-positive "you could have
  // used skill X" suggestions when X was actually invoked. Backseat classifies
  // downstream tool calls from the expanded prompt, not this wrapper, so the
  // name alone is sufficient — it just records that the skill fired.
  toAutoClassifierInput: ({ skill }) => skill ?? '',

  async validateInput({ skill }, context): Promise<ValidationResult> {
    // 技能只有技能名称，没有参数
    const trimmed = skill.trim()
    if (!trimmed) {
      return {
        result: false,
        message: `无效的技能格式：${skill}`,
        errorCode: 1,
      }
    }

    // 如果存在，移除前导斜杠（为了兼容性）
    const hasLeadingSlash = trimmed.startsWith('/')
    if (hasLeadingSlash) {
      logEvent('tengu_skill_tool_slash_prefix', {})
    }
    const normalizedCommandName = hasLeadingSlash
      ? trimmed.substring(1)
      : trimmed

    // 远程规范技能处理（仅限 ant 用户实验性）。在本地命令查找之前拦截
    // `_canonical_<slug>` 名称，因为远程技能不在本地命令注册表中。
    if (
      feature('EXPERIMENTAL_SKILL_SEARCH') &&
      process.env.USER_TYPE === 'ant'
    ) {
      const slug = remoteSkillModules!.stripCanonicalPrefix(
        normalizedCommandName,
      )
      if (slug !== null) {
        const meta = remoteSkillModules!.getDiscoveredRemoteSkill(slug)
        if (!meta) {
          return {
            result: false,
            message: `远程技能 ${slug} 未在此会话中发现。请先使用 DiscoverSkills 查找远程技能。`,
            errorCode: 6,
          }
        }
        // 已发现的远程技能 — 有效。加载在 call() 中进行。
        return { result: true }
      }
    }

    // 获取可用命令（包括 MCP 技能）
    const commands = await getAllCommands(context)

    // 检查命令是否存在
    const foundCommand = findCommand(normalizedCommandName, commands)
    if (!foundCommand) {
      return {
        result: false,
        message: `未知技能：${normalizedCommandName}`,
        errorCode: 2,
      }
    }

    // 防循环保护：检查此技能是否已在当前会话中被调用过。
    // 如果是，拒绝调用以防止无限循环。
    const invokedSkills = getInvokedSkillsForAgent(null) // null = 主会话
    const skillKey = `:${normalizedCommandName}`
    const alreadyInvoked = invokedSkills.has(skillKey)

    if (alreadyInvoked) {
      return {
        result: false,
        message: `技能 "${normalizedCommandName}" 已在此会话中加载并激活。请勿再次调用 — 请按照技能的指示直接操作。如果你发现自己重复此调用，说明你陷入了循环。请停止并继续技能的实际工作流程。`,
        errorCode: 7,
      }
    }

    // 检查命令是否禁用了模型调用
    if (foundCommand.disableModelInvocation) {
      return {
        result: false,
        message: `技能 ${normalizedCommandName} 无法与 ${SKILL_TOOL_NAME} 工具一起使用，因为禁用了模型调用`,
        errorCode: 4,
      }
    }

    // 检查命令是否是基于提示的命令
    if (foundCommand.type !== 'prompt') {
      return {
        result: false,
        message: `技能 ${normalizedCommandName} 不是基于提示的技能`,
        errorCode: 5,
      }
    }

    return { result: true }
  },

  async checkPermissions(
    { skill, args },
    context,
  ): Promise<PermissionDecision> {
    // 技能只有技能名称，没有参数
    const trimmed = skill.trim()

    // 如果存在，移除前导斜杠（为了兼容性）
    const commandName = trimmed.startsWith('/') ? trimmed.substring(1) : trimmed

    const appState = context.getAppState()
    const permissionContext = appState.toolPermissionContext

    // 查找命令对象以作为元数据传递
    const commands = await getAllCommands(context)
    const commandObj = findCommand(commandName, commands)

    // 检查规则是否与技能匹配的辅助函数
    // 通过去除前导斜杠来规范化两个输入以实现一致匹配
    const ruleMatches = (ruleContent: string): boolean => {
      // 通过去除前导斜杠来规范化规则内容
      const normalizedRule = ruleContent.startsWith('/')
        ? ruleContent.substring(1)
        : ruleContent

      // 检查精确匹配（使用规范化的 commandName）
      if (normalizedRule === commandName) {
        return true
      }
      // 检查前缀匹配（例如，"review:*" 匹配 "review-pr 123"）
      if (normalizedRule.endsWith(':*')) {
        const prefix = normalizedRule.slice(0, -2) // 移除 ':*'
        return commandName.startsWith(prefix)
      }
      return false
    }

    // 检查拒绝规则
    const denyRules = getRuleByContentsForTool(
      permissionContext,
      SkillTool as Tool,
      'deny',
    )
    for (const [ruleContent, rule] of denyRules.entries()) {
      if (ruleMatches(ruleContent)) {
        return {
          behavior: 'deny',
          message: `技能执行被权限规则阻止`,
          decisionReason: {
            type: 'rule',
            rule,
          },
        }
      }
    }

    // 远程规范技能是仅限 ant 用户的实验性功能 — 自动授权。
    // 放在拒绝循环之后，以便用户配置的 Skill(_canonical_:*) 拒绝规则能够生效
    // （与下面的安全属性自动允许模式相同）。
    // 技能本身是规范的/策划的，不是用户编写的。
    if (
      feature('EXPERIMENTAL_SKILL_SEARCH') &&
      process.env.USER_TYPE === 'ant'
    ) {
      const slug = remoteSkillModules!.stripCanonicalPrefix(commandName)
      if (slug !== null) {
        return {
          behavior: 'allow',
          updatedInput: { skill, args },
          decisionReason: undefined,
        }
      }
    }

    // 检查允许规则
    const allowRules = getRuleByContentsForTool(
      permissionContext,
      SkillTool as Tool,
      'allow',
    )
    for (const [ruleContent, rule] of allowRules.entries()) {
      if (ruleMatches(ruleContent)) {
        return {
          behavior: 'allow',
          updatedInput: { skill, args },
          decisionReason: {
            type: 'rule',
            rule,
          },
        }
      }
    }

    // 自动允许仅使用安全属性的技能。
    // 这是一个允许列表：如果技能有任何不在此集合中的属性且具有有意义的值，
    // 则需要权限。这确保了未来添加的新属性默认需要权限。
    if (
      commandObj?.type === 'prompt' &&
      skillHasOnlySafeProperties(commandObj)
    ) {
      return {
        behavior: 'allow',
        updatedInput: { skill, args },
        decisionReason: undefined,
      }
    }

    // 为精确技能和前缀准备建议
    // 使用规范化的 commandName（无前导斜杠）以实现一致的规则
    const suggestions = [
      // 精确技能建议
      {
        type: 'addRules' as const,
        rules: [
          {
            toolName: SKILL_TOOL_NAME,
            ruleContent: commandName,
          },
        ],
        behavior: 'allow' as const,
        destination: 'localSettings' as const,
      },
      // 前缀建议以允许任何参数
      {
        type: 'addRules' as const,
        rules: [
          {
            toolName: SKILL_TOOL_NAME,
            ruleContent: `${commandName}:*`,
          },
        ],
        behavior: 'allow' as const,
        destination: 'localSettings' as const,
      },
    ]

    // 默认行为：询问用户是否允许
    return {
      behavior: 'ask',
      message: `执行技能：${commandName}`,
      decisionReason: undefined,
      suggestions,
      updatedInput: { skill, args },
      metadata: commandObj ? { command: commandObj } : undefined,
    }
  },

  async call(
    { skill, args },
    context,
    canUseTool,
    parentMessage,
    onProgress?,
  ): Promise<ToolResult<Output>> {
    // At this point, validateInput has already confirmed:
    // - Skill format is valid
    // - Skill exists
    // - Skill can be loaded
    // - Skill doesn't have disableModelInvocation
    // - Skill is a prompt-based skill

    // Skills are just names, with optional arguments
    const trimmed = skill.trim()

    // Remove leading slash if present (for compatibility)
    const commandName = trimmed.startsWith('/') ? trimmed.substring(1) : trimmed

    // DOUBLE-CHECK anti-loop protection: Even if validateInput passed, re-check
    // here because addInvokedSkill is called inside processPromptSlashCommand,
    // which runs AFTER validateInput. This catches loops that slip through.
    const invokedSkills = getInvokedSkillsForAgent(null) // null = main session
    const skillKey = `:${commandName}`
    const alreadyInvoked = invokedSkills.has(skillKey)

    if (alreadyInvoked) {
      throw new Error(
        `Skill "${commandName}" is already loaded. Do not call SkillTool again for the same skill. Follow the skill's instructions directly.`,
      )
    }

    // Remote canonical skill execution (ant-only experimental). Intercepts
    // `_canonical_<slug>` before local command lookup — loads SKILL.md from
    // AKI/GCS (with local cache), injects content directly as a user message.
    // Remote skills are declarative markdown so no slash-command expansion
    // (no !command substitution, no $ARGUMENTS interpolation) is needed.
    if (
      feature('EXPERIMENTAL_SKILL_SEARCH') &&
      process.env.USER_TYPE === 'ant'
    ) {
      const slug = remoteSkillModules!.stripCanonicalPrefix(commandName)
      if (slug !== null) {
        return executeRemoteSkill(slug, commandName, parentMessage, context)
      }
    }

    const commands = await getAllCommands(context)
    const command = findCommand(commandName, commands)

    // Track skill usage for ranking
    recordSkillUsage(commandName)

    // Check if skill should run as a forked sub-agent
    if (command?.type === 'prompt' && command.context === 'fork') {
      return executeForkedSkill(
        command,
        commandName,
        args,
        context,
        canUseTool,
        parentMessage,
        onProgress,
      )
    }

    // Process the skill with optional args
    const { processPromptSlashCommand } = await import(
      'src/utils/processUserInput/processSlashCommand.js'
    )
    const processedCommand = await processPromptSlashCommand(
      commandName,
      args || '', // Pass args if provided
      commands,
      context,
    )

    if (!processedCommand.shouldQuery) {
      throw new Error('命令处理失败')
    }

    // Extract metadata from the command
    const allowedTools = processedCommand.allowedTools || []
    const model = processedCommand.model
    const effort = command?.type === 'prompt' ? command.effort : undefined

    const isBuiltIn = builtInCommandNames().has(commandName)
    const isBundled = command?.type === 'prompt' && command.source === 'bundled'
    const isOfficialSkill =
      command?.type === 'prompt' && isOfficialMarketplaceSkill(command)
    const sanitizedCommandName =
      isBuiltIn || isBundled || isOfficialSkill ? commandName : 'custom'

    const wasDiscoveredField =
      feature('EXPERIMENTAL_SKILL_SEARCH') &&
      remoteSkillModules!.isSkillSearchEnabled()
        ? {
            was_discovered:
              context.discoveredSkillNames?.has(commandName) ?? false,
          }
        : {}
    const pluginMarketplace =
      command?.type === 'prompt' && command.pluginInfo
        ? parsePluginIdentifier(command.pluginInfo.repository).marketplace
        : undefined
    const queryDepth = context.queryTracking?.depth ?? 0
    const parentAgentId = getAgentContext()?.agentId
    logEvent('tengu_skill_tool_invocation', {
      command_name:
        sanitizedCommandName as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      // _PROTO_skill_name routes to the privileged skill_name BQ column
      // (unredacted, all users); command_name stays in additional_metadata as
      // the redacted variant for general-access dashboards.
      _PROTO_skill_name:
        commandName as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
      execution_context:
        'inline' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      invocation_trigger: (queryDepth > 0
        ? 'nested-skill'
        : 'claude-proactive') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      query_depth: queryDepth,
      ...(parentAgentId && {
        parent_agent_id:
          parentAgentId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      }),
      ...wasDiscoveredField,
      ...(process.env.USER_TYPE === 'ant' && {
        skill_name:
          commandName as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        ...(command?.type === 'prompt' && {
          skill_source:
            command.source as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        }),
        ...(command?.loadedFrom && {
          skill_loaded_from:
            command.loadedFrom as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        }),
        ...(command?.kind && {
          skill_kind:
            command.kind as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        }),
      }),
      ...(command?.type === 'prompt' &&
        command.pluginInfo && {
          _PROTO_plugin_name: command.pluginInfo.pluginManifest
            .name as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
          ...(pluginMarketplace && {
            _PROTO_marketplace_name:
              pluginMarketplace as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
          }),
          plugin_name: (isOfficialSkill
            ? command.pluginInfo.pluginManifest.name
            : 'third-party') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          plugin_repository: (isOfficialSkill
            ? command.pluginInfo.repository
            : 'third-party') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          ...buildPluginCommandTelemetryFields(command.pluginInfo),
        }),
    })

    // Get the tool use ID from the parent message for linking newMessages
    const toolUseID = getToolUseIDFromParentMessage(
      parentMessage,
      SKILL_TOOL_NAME,
    )

    // Tag user messages with sourceToolUseID so they stay transient until this tool resolves
    const newMessages = tagMessagesWithToolUseID(
      processedCommand.messages.filter(
        (m): m is UserMessage | AttachmentMessage | SystemMessage => {
          if (m.type === 'progress') {
            return false
          }
          // Filter out command-message since SkillTool handles display
          if (m.type === 'user' && 'message' in m) {
            const content = m.message.content
            if (
              typeof content === 'string' &&
              content.includes(`<${COMMAND_MESSAGE_TAG}>`)
            ) {
              return false
            }
          }
          return true
        },
      ),
      toolUseID,
    )

    logForDebugging(
      `SkillTool returning ${newMessages.length} newMessages for skill ${commandName}`,
    )

    // Note: addInvokedSkill and registerSkillHooks are called inside
    // processPromptSlashCommand (via getMessagesForPromptSlashCommand), so
    // calling them again here would double-register hooks and rebuild
    // skillContent redundantly.

    // Return success with newMessages and contextModifier
    return {
      data: {
        success: true,
        commandName,
        allowedTools: allowedTools.length > 0 ? allowedTools : undefined,
        model,
      },
      newMessages,
      contextModifier(ctx) {
        let modifiedContext = ctx

        // Update allowed tools if specified
        if (allowedTools.length > 0) {
          // Capture the current getAppState to chain modifications properly
          const previousGetAppState = modifiedContext.getAppState
          modifiedContext = {
            ...modifiedContext,
            getAppState() {
              // Use the previous getAppState, not the closure's context.getAppState,
              // to properly chain context modifications
              const appState = previousGetAppState()
              return {
                ...appState,
                toolPermissionContext: {
                  ...appState.toolPermissionContext,
                  alwaysAllowRules: {
                    ...appState.toolPermissionContext.alwaysAllowRules,
                    command: [
                      ...new Set([
                        ...(appState.toolPermissionContext.alwaysAllowRules
                          .command || []),
                        ...allowedTools,
                      ]),
                    ],
                  },
                },
              }
            },
          }
        }

        // Carry [1m] suffix over — otherwise a skill with `model: opus` on an
        // opus[1m] session drops the effective window to 200K and trips autocompact.
        if (model) {
          modifiedContext = {
            ...modifiedContext,
            options: {
              ...modifiedContext.options,
              mainLoopModel: resolveSkillModelOverride(
                model,
                ctx.options.mainLoopModel,
              ),
            },
          }
        }

        // Override effort level if skill specifies one
        if (effort !== undefined) {
          const previousGetAppState = modifiedContext.getAppState
          modifiedContext = {
            ...modifiedContext,
            getAppState() {
              const appState = previousGetAppState()
              return {
                ...appState,
                effortValue: effort,
              }
            },
          }
        }

        return modifiedContext
      },
    }
  },

  mapToolResultToToolResultBlockParam(
    result: Output,
    toolUseID: string,
  ): ToolResultBlockParam {
    // Handle forked skill result
    if ('status' in result && result.status === 'forked') {
      return {
        type: 'tool_result' as const,
        tool_use_id: toolUseID,
        content: `Skill "${result.commandName}" completed (forked execution).\n\nResult:\n${result.result}`,
      }
    }

    // Inline skill result (default)
    return {
      type: 'tool_result' as const,
      tool_use_id: toolUseID,
      content: `Launching skill: ${result.commandName}`,
    }
  },

  renderToolResultMessage,
  renderToolUseMessage,
  renderToolUseProgressMessage,
  renderToolUseRejectedMessage,
  renderToolUseErrorMessage,
} satisfies ToolDef<InputSchema, Output, Progress>)

// Allowlist of PromptCommand property keys that are safe and don't require permission.
// If a skill has any property NOT in this set with a meaningful value, it requires
// permission. This ensures new properties added to PromptCommand in the future
// default to requiring permission until explicitly reviewed and added here.
const SAFE_SKILL_PROPERTIES = new Set([
  // PromptCommand properties
  'type',
  'progressMessage',
  'contentLength',
  'argNames',
  'model',
  'effort',
  'source',
  'pluginInfo',
  'disableNonInteractive',
  'skillRoot',
  'context',
  'agent',
  'getPromptForCommand',
  'frontmatterKeys',
  // CommandBase properties
  'name',
  'description',
  'hasUserSpecifiedDescription',
  'isEnabled',
  'isHidden',
  'aliases',
  'isMcp',
  'argumentHint',
  'whenToUse',
  'paths',
  'version',
  'disableModelInvocation',
  'userInvocable',
  'loadedFrom',
  'immediate',
  'userFacingName',
])

function skillHasOnlySafeProperties(command: Command): boolean {
  for (const key of Object.keys(command)) {
    if (SAFE_SKILL_PROPERTIES.has(key)) {
      continue
    }
    // Property not in safe allowlist - check if it has a meaningful value
    const value = (command as Record<string, unknown>)[key]
    if (value === undefined || value === null) {
      continue
    }
    if (Array.isArray(value) && value.length === 0) {
      continue
    }
    if (
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0
    ) {
      continue
    }
    return false
  }
  return true
}

function isOfficialMarketplaceSkill(command: PromptCommand): boolean {
  if (command.source !== 'plugin' || !command.pluginInfo?.repository) {
    return false
  }
  return isOfficialMarketplaceName(
    parsePluginIdentifier(command.pluginInfo.repository).marketplace,
  )
}

/**
 * Extract URL scheme for telemetry. Defaults to 'gs' for unrecognized schemes
 * since the AKI backend is the only production path and the loader throws on
 * unknown schemes before we reach telemetry anyway.
 */
function extractUrlScheme(url: string): 'gs' | 'http' | 'https' | 's3' {
  if (url.startsWith('gs://')) return 'gs'
  if (url.startsWith('https://')) return 'https'
  if (url.startsWith('http://')) return 'http'
  if (url.startsWith('s3://')) return 's3'
  return 'gs'
}

/**
 * Load a remote canonical skill and inject its SKILL.md content into the
 * conversation. Unlike local skills (which go through processPromptSlashCommand
 * for !command / $ARGUMENTS expansion), remote skills are declarative markdown
 * — we wrap the content directly in a user message.
 *
 * The skill is also registered with addInvokedSkill so it survives compaction
 * (same as local skills).
 *
 * Only called from within a feature('EXPERIMENTAL_SKILL_SEARCH') guard in
 * call() — remoteSkillModules is non-null here.
 */
async function executeRemoteSkill(
  slug: string,
  commandName: string,
  parentMessage: AssistantMessage,
  context: ToolUseContext,
): Promise<ToolResult<Output>> {
  const { getDiscoveredRemoteSkill, loadRemoteSkill, logRemoteSkillLoaded } =
    remoteSkillModules!

  // validateInput already confirmed this slug is in session state, but we
  // re-fetch here to get the URL. If it's somehow gone (e.g., state cleared
  // mid-session), fail with a clear error rather than crashing.
  const meta = getDiscoveredRemoteSkill(slug)
  if (!meta) {
    throw new Error(
      `Remote skill ${slug} was not discovered in this session. Use DiscoverSkills to find remote skills first.`,
    )
  }

  const urlScheme = extractUrlScheme(meta.url)
  let loadResult
  try {
    loadResult = await loadRemoteSkill(slug, meta.url)
  } catch (e) {
    const msg = errorMessage(e)
    logRemoteSkillLoaded({
      slug,
      cacheHit: false,
      latencyMs: 0,
      urlScheme,
      error: msg,
    })
    throw new Error(`加载远程技能 ${slug} 失败：${msg}`)
  }

  const {
    cacheHit,
    latencyMs,
    skillPath,
    content,
    fileCount,
    totalBytes,
    fetchMethod,
  } = loadResult

  logRemoteSkillLoaded({
    slug,
    cacheHit,
    latencyMs,
    urlScheme,
    fileCount,
    totalBytes,
    fetchMethod,
  })

  // Remote skills are always model-discovered (never in static skill_listing),
  // so was_discovered is always true. is_remote lets BQ queries separate
  // remote from local invocations without joining on skill name prefixes.
  const queryDepth = context.queryTracking?.depth ?? 0
  const parentAgentId = getAgentContext()?.agentId
  logEvent('tengu_skill_tool_invocation', {
    command_name:
      'remote_skill' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    // _PROTO_skill_name routes to the privileged skill_name BQ column
    // (unredacted, all users); command_name stays in additional_metadata as
    // the redacted variant.
    _PROTO_skill_name:
      commandName as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
    execution_context:
      'remote' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    invocation_trigger: (queryDepth > 0
      ? 'nested-skill'
      : 'claude-proactive') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    query_depth: queryDepth,
    ...(parentAgentId && {
      parent_agent_id:
        parentAgentId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    }),
    was_discovered: true,
    is_remote: true,
    remote_cache_hit: cacheHit,
    remote_load_latency_ms: latencyMs,
    ...(process.env.USER_TYPE === 'ant' && {
      skill_name:
        commandName as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      remote_slug:
        slug as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    }),
  })

  recordSkillUsage(commandName)

  logForDebugging(
    `SkillTool loaded remote skill ${slug} (cacheHit=${cacheHit}, ${latencyMs}ms, ${content.length} chars)`,
  )

  // Strip YAML frontmatter (---\nname: x\n---) before prepending the header
  // (matches loadSkillsDir.ts:333). parseFrontmatter returns the original
  // content unchanged if no frontmatter is present.
  const { content: bodyContent } = parseFrontmatter(content, skillPath)

  // Inject base directory header + ${CLAUDE_SKILL_DIR}/${CLAUDE_SESSION_ID}
  // substitution (matches loadSkillsDir.ts) so the model can resolve relative
  // refs like ./schemas/foo.json against the cache dir.
  const skillDir = dirname(skillPath)
  const normalizedDir =
    process.platform === 'win32' ? skillDir.replace(/\\/g, '/') : skillDir
  let finalContent = `Base directory for this skill: ${normalizedDir}\n\n${bodyContent}`
  finalContent = finalContent.replace(/\$\{CLAUDE_SKILL_DIR\}/g, normalizedDir)
  finalContent = finalContent.replace(
    /\$\{CLAUDE_SESSION_ID\}/g,
    getSessionId(),
  )

  // Register with compaction-preservation state. Use the cached file path so
  // post-compact restoration knows where the content came from. Must use
  // finalContent (not raw content) so the base directory header and
  // ${CLAUDE_SKILL_DIR} substitutions survive compaction — matches how local
  // skills store their already-transformed content via processSlashCommand.
  addInvokedSkill(
    commandName,
    skillPath,
    finalContent,
    getAgentContext()?.agentId ?? null,
  )

  // Direct injection — wrap SKILL.md content in a meta user message. Matches
  // the shape of what processPromptSlashCommand produces for simple skills.
  const toolUseID = getToolUseIDFromParentMessage(
    parentMessage,
    SKILL_TOOL_NAME,
  )
  return {
    data: { success: true, commandName, status: 'inline' },
    newMessages: tagMessagesWithToolUseID(
      [createUserMessage({ content: finalContent, isMeta: true })],
      toolUseID,
    ),
  }
}
