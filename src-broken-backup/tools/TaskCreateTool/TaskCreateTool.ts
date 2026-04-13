import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../../Tool.js'
import {
  executeTaskCreatedHooks,
  getTaskCreatedHookMessage,
} from '../../../utils/hooks.js'
import { lazySchema } from '../../../utils/lazySchema.js'
import {
  createTask,
  deleteTask,
  getTaskListId,
  isTodoV2Enabled,
} from '../../../utils/tasks.js'
import { getAgentName, getTeamName } from '../../../utils/teammate.js'
import { TASK_CREATE_TOOL_NAME } from './constants.js'
import { DESCRIPTION, getPrompt } from './prompt.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    subject: z.string().describe('任务的简短标）),
    description: z.string().describe('需要做什）),
    activeForm: z
      .string()
      .optional()
      .describe(
        '进行中时）spinner 中显示的现在进行时（例如“运行测试”）',
      ),
    metadata: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('附加到任务的任意元数）),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    task: z.object({
      id: z.string(),
      subject: z.string(),
    }),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

export const TaskCreateTool = buildTool({
  name: TASK_CREATE_TOOL_NAME,
  searchHint: '在任务列表中创建任务',
  maxResultSizeChars: 100_000,
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return getPrompt()
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  userFacingName() {
    return 'TaskCreate'
  },
  shouldDefer: true,
  isEnabled() {
    return isTodoV2Enabled()
  },
  isConcurrencySafe() {
    return true
  },
  toAutoClassifierInput(input) {
    return input.subject
  },
  renderToolUseMessage() {
    return null
  },
  async call({ subject, description, activeForm, metadata }, context) {
    const taskId = await createTask(getTaskListId(), {
      subject,
      description,
      activeForm,
      status: 'pending',
      owner: undefined,
      blocks: [],
      blockedBy: [],
      metadata,
    })

    const blockingErrors: string[] = []
    const generator = executeTaskCreatedHooks(
      taskId,
      subject,
      description,
      getAgentName(),
      getTeamName(),
      undefined,
      context?.abortController?.signal,
      undefined,
      context,
    )
    for await (const result of generator) {
      if (result.blockingError) {
        blockingErrors.push(getTaskCreatedHookMessage(result.blockingError))
      }
    }

    if (blockingErrors.length > 0) {
      await deleteTask(getTaskListId(), taskId)
      throw new Error(blockingErrors.join('\n'))
    }

    // 创建任务时自动展开任务列表
    context.setAppState(prev => {
      if (prev.expandedView === 'tasks') return prev
      return { ...prev, expandedView: 'tasks' as const }
    })

    return {
      data: {
        task: {
          id: taskId,
          subject,
        },
      },
    }
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    const { task } = content as Output
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: `任务 #${task.id} 创建成功）{task.subject}`,
    }
  },
} satisfies ToolDef<InputSchema, Output>)