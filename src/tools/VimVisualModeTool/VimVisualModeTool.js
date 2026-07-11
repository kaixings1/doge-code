import { z } from 'zod';
export const VimVisualModeTool = {
    name: 'vim-visual-mode',
    description: '模式 (v/V) for text selection',
    callOn: 'always',
    input: z.object({
        mode: z.enum(['visual', 'line']).describe('Visual mode type'),
        selection: z.string().optional().describe('Text to select'),
    }),
    output: z.object({
        active: z.boolean().describe('Whether visual mode is active'),
        mode: z.string().describe('Current mode'),
        selected: z.string().optional().describe('Selected text'),
    }),
    exec: async ({ mode, selection }) => {
        return {
            active: true,
            mode,
            selected: selection,
        };
    },
};
