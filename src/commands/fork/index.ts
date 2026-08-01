import type { Command, LocalJSXCommandContext, LocalCommandResult } from '../../commands.js'
import { isForkSubagentEnabled } from '../../tools/AgentTool/forkSubagent.js'

const HELP = `用法: /fork <任务描述>

在后台派生子代理执行指定任务，完成后通过通知告知结果。
子代理继承当前对话上下文和系统提示词，直接使用工具完成任务。

示例:
  /fork 分析项目架构并生成文档
  /fork 搜索所有 TODO 并汇总
  /fork 重构 utils/ 目录下的函数`

const fork = {
  type: 'local',
  name: 'fork',
  description: '分支子代理 — 在后台派生子代理执行任务，完成后通知',
  argumentHint: '<任务描述>',
  isEnabled: () => isForkSubagentEnabled(),
  supportsNonInteractive: false,
  load: () =>
    import('../../tools/AgentTool/AgentTool.js').then(m => ({
      call: async (
        args: string,
        context: LocalJSXCommandContext,
      ): Promise<LocalCommandResult> => {
        const prompt = args.trim()
        if (!prompt) {
          return { type: 'text', value: HELP }
        }

        try {
          const toolUseContext = context as Record<string, unknown>
          const result = await (m.AgentTool as Record<string, unknown>).call(
            {
              prompt,
              description: prompt.length > 50 ? prompt.slice(0, 50) + '…' : prompt,
            },
            toolUseContext,
            async (_name: string, _input: unknown) => true,
            undefined,
          )

          if (result && typeof result === 'object' && 'data' in result) {
            const data = result.data as Record<string, unknown>
            if (data.status === 'async_launched') {
              return {
                type: 'text',
                value:
                  `分支子代理已启动（ID: ${data.agentId}）\n` +
                  `描述: ${data.description}\n` +
                  `完成后将收到 <task-notification> 通知。\n` +
                  `输出文件: ${data.outputFile}`,
              }
            }
            return {
              type: 'text',
              value: data.message || `分支子代理已完成:\n${prompt}`,
            }
          }

          return {
            type: 'text',
            value: `分支子代理已启动: ${prompt}`,
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          if (msg.includes('Fork 在 Fork 工作器内部')) {
            return {
              type: 'text',
              value: '分支子代理中不能再分支。请直接使用工具完成任务。',
            }
          }
          return {
            type: 'text',
            value: `分支子代理启动失败: ${msg}`,
          }
        }
      },
    })),
} satisfies Command

export default fork
