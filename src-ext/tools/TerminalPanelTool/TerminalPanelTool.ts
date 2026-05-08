import { Tool } from '../../Tool';
import { z } from 'zod';

const TerminalPanelTool: Tool = {
  name: 'terminal-panel',
  description: 'Manage terminal panel for output display',
  callOn: 'manual',
  input: z.object({
    action: z.enum(['show', 'hide', 'focus', 'blur']).describe('Action to perform'),
    content: z.string().optional().describe('Content to display'),
  }),
  output: z.object({
    visible: z.boolean().describe('Whether panel is visible'),
    focused: z.boolean().describe('Whether panel is focused'),
    message: z.string().optional().describe('Status message'),
  }),
  exec: async ({ action, content }) => {
    return {
      visible: action !== 'hide',
      focused: action === 'focus',
      message: `Terminal panel ${action} completed`,
    };
  },
};

export default TerminalPanelTool;
