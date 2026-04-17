import { feature } from 'bun:bundle'
import { writeFile } from 'fs/promises'
import { z } from 'zod/v4'
import {
  getAllowedChannels,
  hasExitedPlanModeInSession,
  setHasExitedPlanMode,
  setNeedsAutoModeExitAttachment,
  setNeedsPlanModeExitAttachment,
} from '../../bootstrap/state.js'
import { logEvent } from '../../services/analytics/index.js'
import type { AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS } from '../../services/analytics/metadata.js'
import {
  buildTool,
  type Tool,
  type ToolDef,
  toolMatchesName,
} from '../../Tool.js'
import { formatAgentId, generateRequestId } from '../../utils/agentId.js'
import { isAgentSwarmsEnabled } from '../../utils/agentSwarmsEnabled.js'
import { logForDebugging } from '../../utils/debug.js'
import {
  findInProcessTeammateTaskId,
  setAwaitingPlanApproval,
} from '../../utils/inProcessTeammateHelpers.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { logError } from '../../utils/log.js'
import {
  getPlan,
  getPlanFilePath,
  persistFileSnapshotIfRemote,
} from '../../utils/plans.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import {
  getAgentName,
  getTeamName,
  isPlanModeRequired,
  isTeammate,
} from '../../utils/teammate.js'
import { writeToMailbox } from '../../utils/teammateMailbox.js'
import { AGENT_TOOL_NAME } from '../AgentTool/constants.js'
import { TEAM_CREATE_TOOL_NAME } from '../TeamCreateTool/constants.js'
import { EXIT_PLAN_MODE_V2_TOOL_NAME } from './constants.js'
import { EXIT_PLAN_MODE_V2_TOOL_PROMPT } from './prompt.js'
import {
  renderToolResultMessage,
  renderToolUseMessage,
  renderToolUseRejectedMessage,
} from './UI.js'

 
const autoModeStateModule = feature('TRANSCRIPT_CLASSIFIER')
  ? (require('../../utils/permissions/autoModeState.js') as typeof import('../../utils/permissions/autoModeState.js'))
  : null
const permissionSetupModule = feature('TRANSCRIPT_CLASSIFIER')
  ? (require('../../utils/permissions/permissionSetup.js') as typeof import('../../utils/permissions/permissionSetup.js'))
  : null
 

/**
 * 基于提示语的权限请求模式定义。
 * 用于在退出计划模式时，Claude 请求语义化权限。
 */
const allowedPromptSchema = lazySchema(() =>
  z.object({
    tool: z.enum(['Bash']).describe('该提示语适用的工具'),
    prompt: z
      .string()
      .describe(
        '动作的语义化描述，例如 "运行测试"、"安装依赖"',
      ),
  }),
)

export type AllowedPrompt = z.infer<ReturnType<typeof allowedPromptSchema>>

const inputSchema = lazySchema(() =>
  z
    .strictObject({
      // 计划中请求的基于提示语的权限
      allowedPrompts: z
        .array(allowedPromptSchema())
        .optional()
        .describe(
          '实现计划所需的基于提示语的权限。这些描述的是动作类别，而非具体的命令。',
        ),
    })
    .passthrough(),
)
type InputSchema = ReturnType<typeof inputSchema>

/**
 * 面向 SDK 的输入模式 - 包含了由 normalizeToolInput 注入的字段。
 * 内部 inputSchema 不包含这些字段，因为计划是从磁盘读取的，
 * 但 SDK/钩子看到的是经过规范化处理、包含计划和文件路径的版本。
 */
export const _sdkInputSchema = lazySchema(() =>
  inputSchema().extend({
    plan: z
      .string()
      .optional()
      .describe('计划内容（由 normalizeToolInput 从磁盘注入）'),
    planFilePath: z
      .string()
      .optional()
      .describe('计划文件路径（由 normalizeToolInput 注入）'),
  }),
)

export const outputSchema = lazySchema(() =>
  z.object({
    plan: z
      .string()
      .nullable()
      .describe('向用户展示的计划内容'),
    isAgent: z.boolean(),
    filePath: z
      .string()
      .optional()
      .describe('计划保存的文件路径'),
    hasTaskTool: z
      .boolean()
      .optional()
      .describe('当前上下文中是否可用 Agent 工具'),
    planWasEdited: z
      .boolean()
      .optional()
      .describe(
        '当用户在 CCR 网页界面或通过 Ctrl+G 编辑了计划时为真；用于决定是否在 tool_result 中回显计划内容',
      ),
    awaitingLeaderApproval: z
      .boolean()
      .optional()
      .describe(
        '当协作者已向团队负责人发送计划审批请求时为真',
      ),
    requestId: z
      .string()
      .optional()
      .describe('计划审批请求的唯一标识符'),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

export const ExitPlanModeV2Tool: Tool<InputSchema, Output> = buildTool({
  name: EXIT_PLAN_MODE_V2_TOOL_NAME,
  searchHint: '提交计划审批并开始编码（仅计划模式）',
  maxResultSizeChars: 100_000,
  async description() {
    return '提示用户退出计划模式并开始编码'
  },
  async prompt() {
    return EXIT_PLAN_MODE_V2_TOOL_PROMPT
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  userFacingName() {
    return ''
  },
  shouldDefer: true,
  isEnabled() {
    // 当 --channels 激活时，用户很可能在 Telegram/Discord 上，
    // 而不是盯着终端界面。计划审批对话框会卡住。
    // 此处的开关与 EnterPlanMode 中的对应开关保持一致，以避免计划模式成为陷阱。
    if (
      (feature('KAIROS') || feature('KAIROS_CHANNELS')) &&
      getAllowedChannels().length > 0
    ) {
      return false
    }
    return true
  },
  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return false // 现在会写入磁盘
  },
  requiresUserInteraction() {
    // 对于所有协作者，均不需要本地用户交互：
    // - 若 isPlanModeRequired() 为真：团队负责人通过邮箱审批
    // - 否则：本地直接退出，无需审批（自愿计划模式）
    if (isTeammate()) {
      return false
    }
    // 对于非协作者，退出计划模式需要用户确认
    return true
  },
  async validateInput(_input, { getAppState, options }) {
    // 协作者的 AppState 可能显示负责人的模式（runAgent.ts 在 acceptEdits/bypassPermissions/auto 中跳过了覆盖）；
    // isPlanModeRequired() 才是真正的判断依据。
    if (isTeammate()) {
      return { result: true }
    }
    // 延迟工具列表无论当前模式如何都会公布此工具，
    // 以便模型在计划获批后（紧凑/清理后产生的新增量）能够调用它。
    // 在 checkPermissions 之前拒绝调用，以避免显示审批对话框。
    const mode = getAppState().toolPermissionContext.mode
    if (mode !== 'plan') {
      logEvent('tengu_exit_plan_mode_called_outside_plan', {
        model:
          options.mainLoopModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        mode: mode as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        hasExitedPlanModeInSession: hasExitedPlanModeInSession(),
      })
      return {
        result: false,
        message:
          '您当前不在计划模式中。此工具仅用于在编写计划后退出计划模式。如果您的计划已获批准，请直接继续实现。',
        errorCode: 1,
      }
    }
    return { result: true }
  },
  async checkPermissions(input, context) {
    // 对于所有协作者，绕过权限界面以避免发送 permission_request。
    // call() 方法会处理相应的行为：
    // - 若 isPlanModeRequired() 为真：向负责人发送 plan_approval_request
    // - 否则：本地退出计划模式（自愿计划模式）
    if (isTeammate()) {
      return {
        behavior: 'allow' as const,
        updatedInput: input,
      }
    }

    // 对于非协作者，退出计划模式需要用户确认
    return {
      behavior: 'ask' as const,
      message: '退出计划模式？',
      updatedInput: input,
    }
  },
  renderToolUseMessage,
  renderToolResultMessage,
  renderToolUseRejectedMessage,
  async call(input, context) {
    const isAgent = !!context.agentId

    const filePath = getPlanFilePath(context.agentId)
    // CCR 网页界面可能通过 permissionResult.updatedInput 发送编辑后的计划。
    // queryHelpers.ts 会完全替换 finalInput，因此当 CCR 发送 {}（无编辑）时，
    // input.plan 为 undefined -> 回退到磁盘读取。内部 inputSchema 省略了
    // `plan`（通常由 normalizeToolInput 注入），因此此处做了类型收窄。
    const inputPlan =
      'plan' in input && typeof input.plan === 'string' ? input.plan : undefined
    const plan = inputPlan ?? getPlan(context.agentId)

    // 同步磁盘，以便 VerifyPlanExecution / Read 能看到编辑内容。之后重新快照：
    // 另一个 persistFileSnapshotIfRemote 调用（位于 api.ts）在 normalizeToolInput 中、
    // 权限检查之前运行 —— 它捕获的是旧计划。
    if (inputPlan !== undefined && filePath) {
      await writeFile(filePath, inputPlan, 'utf-8').catch(e => logError(e))
      void persistFileSnapshotIfRemote()
    }

    // 检查是否为需要负责人审批的协作者
    if (isTeammate() && isPlanModeRequired()) {
      // 对于 plan_mode_required 的协作者，计划是必需的
      if (!plan) {
        throw new Error(
          `未在 ${filePath} 找到计划文件。请在调用 ExitPlanMode 之前将计划写入此文件。`,
        )
      }
      const agentName = getAgentName() || 'unknown'
      const teamName = getTeamName()
      const requestId = generateRequestId(
        'plan_approval',
        formatAgentId(agentName, teamName || 'default'),
      )

      const approvalRequest = {
        type: 'plan_approval_request',
        from: agentName,
        timestamp: new Date().toISOString(),
        planFilePath: filePath,
        planContent: plan,
        requestId,
      }

      await writeToMailbox(
        'team-lead',
        {
          from: agentName,
          text: jsonStringify(approvalRequest),
          timestamp: new Date().toISOString(),
        },
        teamName,
      )

      // 更新任务状态以显示等待审批（针对进程内协作者）
      const appState = context.getAppState()
      const agentTaskId = findInProcessTeammateTaskId(agentName, appState)
      if (agentTaskId) {
        setAwaitingPlanApproval(agentTaskId, context.setAppState, true)
      }

      return {
        data: {
          plan,
          isAgent: true,
          filePath,
          awaitingLeaderApproval: true,
          requestId,
        },
      }
    }

    // 注意：后台验证钩子是在 REPL.tsx 中、上下文清理之后通过 registerPlanVerificationHook() 注册的。
    // 在此处注册会在上下文清理时被清除。

    // 确保退出计划模式时更改模式。
    // 这处理了权限流程未设置模式的情况（例如，当 PermissionRequest 钩子自动批准而未提供 updatedPermissions 时）。
    const appState = context.getAppState()
    // 在调用 setAppState 之前计算功能开关关闭时的回退方案，以便通知用户。
    // 熔断防御：如果 prePlanMode 是类似自动模式的，但功能开关现已关闭（熔断或设置禁用），
    // 则恢复为 'default'。否则，ExitPlanMode 会绕过熔断器直接调用 setAutoModeActive(true)。
    let gateFallbackNotification: string | null = null
    if (feature('TRANSCRIPT_CLASSIFIER')) {
      const prePlanRaw = appState.toolPermissionContext.prePlanMode ?? 'default'
      if (
        prePlanRaw === 'auto' &&
        !(permissionSetupModule?.isAutoModeGateEnabled() ?? false)
      ) {
        const reason =
          permissionSetupModule?.getAutoModeUnavailableReason() ??
          'circuit-breaker'
        gateFallbackNotification =
          permissionSetupModule?.getAutoModeUnavailableNotification(reason) ??
          '自动模式不可用'
        logForDebugging(
          `[自动模式开关 @ ExitPlanModeV2Tool] prePlanMode=${prePlanRaw} ` +
            `但开关已关闭（原因=${reason}）—— 退出计划时回退至默认模式`,
          { level: 'warn' },
        )
      }
    }
    if (gateFallbackNotification) {
      context.addNotification?.({
        key: 'auto-mode-gate-plan-exit-fallback',
        text: `计划退出 → 默认模式 · ${gateFallbackNotification}`,
        priority: 'immediate',
        color: 'warning',
        timeoutMs: 10000,
      })
    }

    context.setAppState(prev => {
      if (prev.toolPermissionContext.mode !== 'plan') return prev
      setHasExitedPlanMode(true)
      setNeedsPlanModeExitAttachment(true)
      let restoreMode = prev.toolPermissionContext.prePlanMode ?? 'default'
      if (feature('TRANSCRIPT_CLASSIFIER')) {
        if (
          restoreMode === 'auto' &&
          !(permissionSetupModule?.isAutoModeGateEnabled() ?? false)
        ) {
          restoreMode = 'default'
        }
        const finalRestoringAuto = restoreMode === 'auto'
        // 捕获恢复前的状态 —— isAutoModeActive() 是权威信号
        // （prePlanMode/strippedDangerousRules 在 transitionPlanAutoMode 中途停用时已过时）。
        const autoWasUsedDuringPlan =
          autoModeStateModule?.isAutoModeActive() ?? false
        autoModeStateModule?.setAutoModeActive(finalRestoringAuto)
        if (autoWasUsedDuringPlan && !finalRestoringAuto) {
          setNeedsAutoModeExitAttachment(true)
        }
      }
      // 如果要恢复到非自动模式且权限曾被剥离（无论是从自动模式进入计划，还是 shouldPlanUseAutoMode 导致的），
      // 则恢复它们。如果恢复到自动模式，则保持剥离状态。
      const restoringToAuto = restoreMode === 'auto'
      let baseContext = prev.toolPermissionContext
      if (restoringToAuto) {
        baseContext =
          permissionSetupModule?.stripDangerousPermissionsForAutoMode(
            baseContext,
          ) ?? baseContext
      } else if (prev.toolPermissionContext.strippedDangerousRules) {
        baseContext =
          permissionSetupModule?.restoreDangerousPermissions(baseContext) ??
          baseContext
      }
      return {
        ...prev,
        toolPermissionContext: {
          ...baseContext,
          mode: restoreMode,
          prePlanMode: undefined,
        },
      }
    })

    const hasTaskTool =
      isAgentSwarmsEnabled() &&
      context.options.tools.some(t => toolMatchesName(t, AGENT_TOOL_NAME))

    return {
      data: {
        plan,
        isAgent,
        filePath,
        hasTaskTool: hasTaskTool || undefined,
        planWasEdited: inputPlan !== undefined || undefined,
      },
    }
  },
  mapToolResultToToolResultBlockParam(
    {
      isAgent,
      plan,
      filePath,
      hasTaskTool,
      planWasEdited,
      awaitingLeaderApproval,
      requestId,
    },
    toolUseID,
  ) {
    // 处理协作者等待负责人审批的情况
    if (awaitingLeaderApproval) {
      return {
        type: 'tool_result',
        content: `您的计划已提交给团队负责人审批。

计划文件：${filePath}

**接下来会发生什么：**
1. 等待团队负责人审核您的计划
2. 您将在收件箱中收到批准/拒绝消息
3. 如果获批，您可以继续实现
4. 如果被拒，请根据反馈完善计划

**重要：** 在收到批准之前请勿继续。请查看收件箱中的回复。

请求 ID：${requestId}`,
        tool_use_id: toolUseID,
      }
    }

    if (isAgent) {
      return {
        type: 'tool_result',
        content:
          '用户已批准计划。现在不需要您做任何操作。请回复"ok"',
        tool_use_id: toolUseID,
      }
    }

    // 处理空计划的情况
    if (!plan || plan.trim() === '') {
      return {
        type: 'tool_result',
        content: '用户已批准退出计划模式。您现在可以继续。',
        tool_use_id: toolUseID,
      }
    }

    const teamHint = hasTaskTool
      ? `\n\n如果该计划可以分解为多个独立的任务，请考虑使用 ${TEAM_CREATE_TOOL_NAME} 工具创建团队并并行处理工作。`
      : ''

    // 始终包含计划内容 —— Ultraplan CCR 流程中的 extractApprovedPlan()
    // 会解析 tool_result 以获取本地 CLI 的计划文本。
    // 标记已编辑的计划，以便模型知晓用户做了修改。
    const planLabel = planWasEdited
      ? '已批准的计划（用户已编辑）'
      : '已批准的计划'

    return {
      type: 'tool_result',
      content: `用户已批准您的计划。您现在可以开始编码。如适用，请先更新任务列表。

您的计划已保存到：${filePath}
实现过程中如有需要可以参考。${teamHint}

## ${planLabel}：
${plan}`,
      tool_use_id: toolUseID,
    }
  },
} satisfies ToolDef<InputSchema, Output>)