import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { exec } from '../../utils/Shell.js'
import { schedule } from 'node:timers/promises'

const inputSchema = lazySchema(() =>
  z.object({
    action: z.enum(['add', 'list', 'remove', 'run']).describe('cron 操作'),
    schedule: z.string().optional().describe('cron 时间表（5 字段格式）'),
    command: z.string().optional().describe('要运行的命令'),
    name: z.string().optional().describe('任务名称'),
  }),
)

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean().describe('操作是否成功'),
    jobs: z.array(z.string()).optional().describe('cron 任务列表'),
    message: z.string().optional().describe('结果消息'),
  }),
)

export type Output = z.infer<ReturnType<typeof outputSchema>>

interface CronJob {
  id: string
  name: string
  schedule: string
  command: string
  createdAt: string
}

const cronStore = new Map<string, CronJob>()

function generateCronId(): string {
  return `cron_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

export const CronTool = buildTool({
  name: 'cron',
  description: async () => '管理定时任务（add/list/remove/run）',
  callOn: 'manual',
  async prompt() {
    return '使用 cron 工具管理定时任务。'
  },
  get inputSchema() {
    return inputSchema()
  },
  get outputSchema() {
    return outputSchema()
  },
  userFacingName() {
    return 'cron'
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
    const command = (input as Record<string, unknown>)?.command
    return `Cron: ${action}${command ? ` (${command.substring(0, 30)})` : ''}`
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    const msg = (content as Record<string, unknown>).message || 'Cron 操作完成'
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: msg,
    }
  },
  async call({ action, schedule: cronSchedule, command, name }) {
    switch (action) {
      case 'add': {
        if (!cronSchedule || !command) {
          return { data: { success: false, message: 'add 操作需要 schedule 和 command 参数' } as Output }
        }
        const jobName = name || `job_${Date.now()}`
        const id = generateCronId()
        cronStore.set(id, {
          id,
          name: jobName,
          schedule: cronSchedule,
          command,
          createdAt: new Date().toISOString(),
        })
        return {
          data: {
            success: true,
            message: `已添加定时任务 "${jobName}" (${cronSchedule}): ${command}`,
          } as Output,
        }
      }
      case 'list': {
        const jobs = Array.from(cronStore.values()).map(
          j => `${j.name} | ${j.schedule} | ${j.command}`,
        )
        return {
          data: {
            success: true,
            jobs,
            message: `共 ${jobs.length} 个定时任务`,
          } as Output,
        }
      }
      case 'remove': {
        if (!name) {
          return { data: { success: false, message: 'remove 操作需要 name 参数' } as Output }
        }
        let removed = false
        for (const [id, job] of cronStore) {
          if (job.name === name) {
            cronStore.delete(id)
            removed = true
            break
          }
        }
        return {
          data: {
            success: removed,
            message: removed ? `定时任务 "${name}" 已删除` : `未找到定时任务 "${name}"`,
          } as Output,
        }
      }
      case 'run': {
        if (!name && !command) {
          return { data: { success: false, message: 'run 操作需要 name 或 command 参数' } as Output }
        }
        const targetCommand = command || (name ? cronStore.get(name)?.command : undefined)
        if (!targetCommand) {
          return { data: { success: false, message: '未找到要执行的命令' } as Output }
        }
        try {
          const result = await exec(targetCommand, new AbortController().signal, 'bash', { timeout: 120000 })
          return {
            data: {
              success: result.code === 0,
              message: result.code === 0 ? `执行成功` : `执行失败: ${result.stderr}`,
            } as Output,
          }
        } catch (err) {
          return {
            data: {
              success: false,
              message: `执行失败: ${err instanceof Error ? err.message : String(err)}`,
            } as Output,
          }
        }
      }
    }
  },
} satisfies ToolDef<typeof inputSchema, Output>)
