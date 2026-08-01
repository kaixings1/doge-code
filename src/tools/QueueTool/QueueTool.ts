import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'

const inputSchema = lazySchema(() =>
  z.object({
    action: z.enum(['push', 'pop', 'list', 'clear', 'stats']).describe('队列操作'),
    queue: z.string().describe('队列名称'),
    job: z.string().optional().describe('要推送的任务'),
  }),
)

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean().describe('操作是否成功'),
    jobs: z.array(z.string()).optional().describe('任务列表'),
    stats: z.record(z.number()).optional().describe('队列统计'),
    message: z.string().optional().describe('结果消息'),
  }),
)

export type Output = z.infer<ReturnType<typeof outputSchema>>

// 内存队列存储
interface QueueEntry {
  id: string
  payload: string
  enqueuedAt: number
}

const queueStore = new Map<string, QueueEntry[]>()

function getQueue(name: string): QueueEntry[] {
  const queue = queueStore.get(name)
  if (!queue) {
    queueStore.set(name, [])
    return queueStore.get(name)!
  }
  return queue
}

function generateJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export const QueueTool = buildTool({
  name: 'queue',
  description: async () => '管理任务队列和作业处理（push/pop/list/clear/stats）',
  callOn: 'manual',
  async prompt() {
    return '使用 queue 工具管理任务队列。'
  },
  get inputSchema() {
    return inputSchema()
  },
  get outputSchema() {
    return outputSchema()
  },
  userFacingName() {
    return 'queue'
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
    const queue = (input as Record<string, unknown>)?.queue ?? ''
    return `Queue: ${action} ${queue}`
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: (content as Record<string, unknown>).message || 'Queue operation completed',
    }
  },
  async call({ action, queue, job }) {
    const q = getQueue(queue)

    switch (action) {
      case 'push': {
        if (!job) {
          return { data: { success: false, message: 'push 操作需要 job 参数' } as Output }
        }
        const entry: QueueEntry = { id: generateJobId(), payload: job, enqueuedAt: Date.now() }
        q.push(entry)
        return { data: { success: true, message: `已入队: ${entry.id}` } as Output }
      }
      case 'pop': {
        const entry = q.shift()
        if (!entry) {
          return { data: { success: true, message: `队列 "${queue}" 为空` } as Output }
        }
        return { data: { success: true, jobs: [entry.payload], message: `已出队: ${entry.id}` } as Output }
      }
      case 'list': {
        return {
          data: {
            success: true,
            jobs: q.map(e => e.payload),
          } as Output,
        }
      }
      case 'clear': {
        q.length = 0
        return { data: { success: true, message: `队列 "${queue}" 已清空` } as Output }
      }
      case 'stats': {
        const allQueues: Record<string, QueueEntry[]> = {}
        for (const [name, entries] of queueStore) {
          allQueues[name] = entries
        }
        const stats: Record<string, number> = {}
        for (const [name, entries] of allQueues) {
          stats[name] = entries.length
        }
        return {
          data: {
            success: true,
            stats: {
              queueCount: Object.keys(allQueues).length,
              totalJobs: q.length,
              ...stats,
            },
          } as Output,
        }
      }
    }
  },
} satisfies ToolDef<typeof inputSchema, Output>)
