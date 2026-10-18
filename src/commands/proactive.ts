import type { Command } from '../commands.js'
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.js'
import { buildPrompt } from '../skills/bundled/loop.js'

/**
 * /proactive — 官方 /loop 的别名入口。
 *
 * 官方 /loop 与 /proactive 是同一语义（周期性重复运行 prompt，默认 10m，
 * 可省略 interval/prompt），/proactive 只是别名。此处复用 loop skill 的
 * buildPrompt，使 /proactive 命令与 /loop skill 行为完全一致，避免 fork
 * 早期遗留的空泛「自动重复执行任务」prompt 与官方语义脱钩。
 */
const command: Command = {
  type: 'prompt',
  name: 'proactive',
  description: '周期性重复运行 prompt（/loop 的别名，默认 10m）',
  allowedTools: ['Bash(*)'],
  contentLength: 100,
  progressMessage: '正在调度周期性任务',
  source: 'builtin',
  async getPromptForCommand(args: string): Promise<ContentBlockParam[]> {
    return [
      {
        type: 'text',
        text: buildPrompt(args),
      },
    ]
  },
} satisfies Command

export default command
