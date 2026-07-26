import type { Command } from '../../commands.js';

const code_review_assistant = {
  type: 'local',
  name: 'code-review-assistant',
  description: '代码审查助手',
  load: () => import('./code_review_assistant.js'),
} satisfies Command;

export default code_review_assistant;
