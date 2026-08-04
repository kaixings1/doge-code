import type { Command } from '../commands.js'
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.js'

const command: Command = {
  type: 'prompt',
  name: 'proactive',
  description: '自动重复执行任务',
  allowedTools: ['Bash(*)'],
  contentLength: 100,
  progressMessage: '正在执行循环任务',
  source: 'builtin',
  async getPromptForCommand(args: string): Promise<ContentBlockParam[]> {
    const promptText = `## 任务：循环执行

用户想要持续运行一个任务，定期重复执行直到满足条件。

### 参数
${args || '未指定参数，执行默认循环任务'}

### 规则
1. 执行用户要求的任务
2. 完成后等待评估是否需要继续
3. 如果任务完成或条件满足，停止循环
4. 如果任务未完成，继续执行
5. 循环之间的延迟由任务性质决定`

    return [
      {
        type: 'text',
        text: promptText,
      },
    ]
  },
} satisfies Command

export default command
