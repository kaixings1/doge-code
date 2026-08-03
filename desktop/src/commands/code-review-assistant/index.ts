import type { Command } from '../../commands.js';

const code_review_assistant = {
  type: 'local-jsx',
  name: 'code-review-assistant',
  description: '智能代码审查助手（AI 审查 git diff）',
  aliases: ['/code-review-assistant', '/code-review', '/cr'],
  arguments: [
    {
      name: '--mode',
      description: '审查模式: comprehensive / security / quality / performance',
      required: false,
    },
    {
      name: '--json',
      description: 'JSON 格式输出',
      required: false,
    },
    {
      name: '--context',
      description: '显示上下文代码',
      required: false,
    },
    {
      name: 'help',
      description: '显示帮助',
      required: false,
    },
  ],
  supportsNonInteractive: true,
  load: () => import('./codeReviewAssistant.ts'),
} satisfies Command;

export default code_review_assistant;
