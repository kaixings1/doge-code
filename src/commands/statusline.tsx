import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/index.mjs';
import type { Command } from '../commands.js';
import { AGENT_TOOL_NAME } from '../tools/AgentTool/constants.js';
const statusline = {
  type: 'prompt',
  description: "设置 Claude Code 的状态栏 UI",
  contentLength: 0,
  // Dynamic content
  aliases: [],
  name: 'statusline',
  progressMessage: '正在设置状态栏',
  allowedTools: [AGENT_TOOL_NAME, 'Read(~/**)', 'Edit(~/.claude/settings.json)'],
  source: 'builtin',
  disableNonInteractive: true,
  async getPromptForCommand(args): Promise<ContentBlockParam[]> {
    const prompt = args.trim() || 'Configure my statusLine from my shell PS1 configuration';
    return [{
      type: 'text',
      text: `创建一个 ${AGENT_TOOL_NAME}，subagent_type 为 "statusline-setup"，提示词为 "${prompt}"`
    }];
  }
} satisfies Command;
export default statusline;
