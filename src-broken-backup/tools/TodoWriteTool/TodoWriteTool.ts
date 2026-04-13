import { feature } from 'bun:bundle'
import { z } from 'zod/v4'
import { getSessionId } from '../../../bootstrap/state.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../../services/analytics/growthbook.js'
import { buildTool, type ToolDef } from '../../../Tool.js'
import { lazySchema } from '../../../utils/lazySchema.js'
import { isTodoV2Enabled } from '../../../utils/tasks.js'
import { TodoListSchema } from '../../../utils/todo/types.js'
import { VERIFICATION_AGENT_TYPE } from '../AgentTool/constants.js'
import { TODO_WRITE_TOOL_NAME } from './constants.js'
import { DESCRIPTION, PROMPT } from './prompt.js'

// 输入模式
const inputSchema = lazySchema(() =>
  z.strictObject({
    todos: TodoListSchema().describe('更新后的待办列表'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

// 输出模式
const outputSchema = lazySchema(() =>
  z.object({
    oldTodos: TodoListSchema().describe('更新前的待办列表'),
    newTodos: TodoListSchema().describe('更新后的待办列表'),
    verificationNudgeNeeded: z.boolean().optional(),  // 是否需要验证提。
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

export const TodoWriteTool = buildTool({
  name: TODO_WRITE_TOOL_NAME,
  searchHint: '管理会话任务清单',
  maxResultSizeChars: 100_000,
  strict: true,
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return PROMPT
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
    return !isTodoV2Enabled()
  },
  toAutoClassifierInput(input) {
    return `${input.todos.length} 项任务`
  },
  async checkPermissions(input) {
    // 待办操作不需要权限检。
    return { behavior: 'allow', updatedInput: input }
  },
  renderToolUseMessage() {
    return null
  },
  async call({ todos }, context) {
    const appState = context.getAppState()
    const todoKey = context.agentId ?? getSessionId()
    const oldTodos = appState.todos[todoKey] ?? []
    const allDone = todos.every(_ => _.status === 'completed')
    const newTodos = allDone ? [] : todos

    // 结构性提示：如果主线程代理正要关闭一个包）3 项以上任务的列表。
    // 且其中没有一项是验证步骤，则在工具结果末尾追加一个提醒。
    // 该提醒在循环退出的确切时刻触发（“当最后一项任务关闭时，循环退出”）。
    let verificationNudgeNeeded = false
    if (
      feature('VERIFICATION_AGENT') &&
      getFeatureValue_CACHED_MAY_BE_STALE('tengu_hive_evidence', false) &&
      !context.agentId &&
      allDone &&
      todos.length >= 3 &&
      !todos.some(t => /verif/i.test(t.content))
    ) {
      verificationNudgeNeeded = true
    }

    context.setAppState(prev => ({
      ...prev,
      todos: {
        ...prev.todos,
        [todoKey]: newTodos,
      },
    }))

    return {
      data: {
        oldTodos,
        newTodos: todos,
        verificationNudgeNeeded,
      },
    }
  },
  mapToolResultToToolResultBlockParam({ verificationNudgeNeeded }, toolUseID) {
    const base = `待办事项已成功修改。请继续使用待办事项列表跟踪进度。`
    const nudge = verificationNudgeNeeded
      ? `\n\n注意：您刚刚关闭）3 项以上的任务，且其中没有一项是验证步骤。在撰写最终总结之前，请生成验证代理（subagent_type="${VERIFICATION_AGENT_TYPE}"）。您不能通过在总结中列出注意事项来自行判定为“部分完成”——只有验证代理才能做出裁决。`
      : ''
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: base + nudge,
    }
  },
} satisfies ToolDef<InputSchema, Output>)