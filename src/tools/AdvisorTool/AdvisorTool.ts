import { z } from 'zod';

export const AdvisorTool = {
  name: 'advisor',
  description: 'AI 顾问工具，用于代码分析和建议（实验性）',
  callOn: 'manual',
  input: z.object({
    query: z.string().optional().describe('向顾问提出的查询问题'),
    focus: z.enum(['code', 'architecture', 'performance', 'security']).optional().describe('关注领域'),
  }),
  output: z.object({
    advice: z.string().describe('顾问建议'),
    suggestions: z.array(z.string()).describe('建议列表'),
    confidence: z.number().describe('置信度 (0-1)'),
  }),

  exec: async ({ query, focus = 'code' }: { query?: string; focus?: string }) => {
    return {
      advice: '顾问分析完成',
      suggestions: [],
      confidence: 0.8,
    };
  },

  // 以下为必须实现的 Tool 方法（复制到所有类似文件中，按需修改名称和描述）
  isEnabled: () => true,
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,
  checkPermissions: (input: any, _ctx?: any) =>
    Promise.resolve({ behavior: 'allow', updatedInput: input }),
  toAutoClassifierInput: () => '',
  userFacingName: () => 'advisor', // 改为对应的工具名

  renderToolUseMessage: (input: any) => `Advisor: ${input?.query ?? '分析'}`,
  mapToolResultToToolResultBlockParam: (content: any, toolUseID: string) => ({
    tool_use_id: toolUseID,
    type: 'tool_result',
    content: content.advice || '顾问分析完成',
  }),
  prompt: async () => 'Use the advisor tool for code analysis and suggestions.',
  description: async () => 'AI 顾问工具，用于代码分析和建议（实验性）',
  call: async (args: any, context: any, canUseTool: any, parentMessage: any, onProgress: any) => {
    const result = await this.exec(args);
    return { data: result };
  },
};