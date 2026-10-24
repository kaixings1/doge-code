import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import {
  executeTaskCreatedHooks,
  getTaskCreatedHookMessage,
} from '../../utils/hooks.js'
import { lazySchema } from '../../utils/lazySchema.js'
import {
  blockTask,
  createTask,
  deleteTask,
  getTaskListId,
  isTodoV2Enabled,
} from '../../utils/tasks.js'
import { getAgentName, getTeamName } from '../../utils/teammate.js'
import { TASK_CREATE_TOOL_NAME } from './constants.js'
import { DESCRIPTION, getPrompt } from './prompt.js'

const inputSchema = lazySchema(() =>
  z.object({
    subject: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional().describe('需要完成什么'),
    activeForm: z
      .string()
      .optional()
      .describe('进行中时在 spinner 中显示的现在进行时形式（如"运行测试"）'),
    metadata: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('附加到任务的任意元数据'),
    owner: z.string().optional().describe('任务负责人（智能体名称）'),
    blocks: z.array(z.string()).optional().describe('此任务阻塞的任务 ID'),
    blockedBy: z.array(z.string()).optional().describe('阻塞此任务的任务 ID'),
  })
    .strict()
    .refine(data => data.subject || data.name, {
      message: '缺少必需参数 `subject`',
      path: ['subject'],
    })
    .transform(data => ({
      ...data,
      subject: data.subject ?? data.name,
    })),
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
    return '创建任务'
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
  async call(
    { subject, description, activeForm, metadata, owner, blocks, blockedBy },
    context,
  ) {
    const taskId = await createTask(getTaskListId(), {
      subject,
      description,
      activeForm,
      status: 'pending',
      owner,
      blocks: [],
      blockedBy: [],
      metadata,
    })

    // 创建时声明的依赖要真正落地：blocks / blockedBy 都走 blockTask，
    // 由它同步维护反向边，避免出现单向悬空引用。
    for (const blockedId of blocks ?? []) {
      await blockTask(getTaskListId(), taskId, blockedId)
    }
    for (const blockerId of blockedBy ?? []) {
      await blockTask(getTaskListId(), blockerId, taskId)
    }

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

    // Auto-expand task list when creating tasks
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
      content: `Task #${task.id} created successfully: ${task.subject}`,
    }
  },
} satisfies ToolDef<InputSchema, Output>)
