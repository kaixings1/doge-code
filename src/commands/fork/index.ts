import type { Command, LocalJSXCommandContext, LocalCommandResult } from '../../commands.js'
import { isForkSubagentEnabled } from '../../tools/AgentTool/forkSubagent.js'

const fork = {
  type: 'local',
  name: 'fork',
  description: '分支子代理 — 在后台派生子代理执行任务，完成后通知',
  argumentHint: '<任务描述>',
  isEnabled: () => isForkSubagentEnabled(),
  supportsNonInteractive: false,
  load: () => Promise.resolve({
    call: async (args: string, context: LocalJSXCommandContext): Promise<LocalCommandResult> => {
      const prompt = args.trim()
      if (!prompt) {
        return {
          type: 'text',
          value: '用法: /fork <任务描述>\n\n在后台派生子代理执行指定任务，完成后通过通知告知结果。'
        }
      }

      try {
        const { AgentTool } = await import('../../tools/AgentTool/AgentTool.js')
        const agentToolInstance = new (AgentTool as any)()

        const result = await agentToolInstance.call(
          {
            prompt,
            description: prompt.slice(0, 50),
          },
          context as any,
          context.canUseTool,
          undefined,
        )

        if (result && typeof result === 'object' && 'data' in result) {
          const data = result.data as any
          if (data.status === 'async_launched') {
            return {
              type: 'text',
              value: `分支子代理已启动（ID: ${data.agentId}）\n描述: ${data.description}\n完成后将收到通知。\n输出文件: ${data.outputFile}`,
            }
          }
          return {
            type: 'text',
            value: data.message || `分支子代理已完成: ${prompt}`,
          }
        }

        return {
          type: 'text',
          value: `分支子代理已启动: ${prompt}`,
        }
      } catch (e) {
        return {
          type: 'text',
          value: `分支子代理启动失败: ${e instanceof Error ? e.message : String(e)}`,
        }
      }
    }
  })
} satisfies Command

export default fork
