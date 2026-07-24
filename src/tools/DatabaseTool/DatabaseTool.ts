import { z } from 'zod';

export const DatabaseTool = {
  name: 'database',
  description: '数据库操作 (SQL, NoSQL)',
  callOn: 'manual',
  input: z.object({
    operation: z.enum(['query', 'insert', 'update', 'delete', 'migrate']).describe('数据库操作'),
    connection: z.string().optional().describe('连接字符串或名称'),
    sql: z.string().optional().describe('SQL 查询语句'),
  }),
  output: z.object({
    success: z.boolean().describe('操作是否成功'),
    rows: z.number().optional().describe('受影响的行数'),
    data: z.array(z.record(z.unknown)).optional().describe('查询结果'),
  }),

  exec: async ({ operation, connection, sql }) => {
    return {
      success: true,
      rows: 0,
      data: [],
    };
  },

  // Tool 接口默认安全实现
  isEnabled: () => true,
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,
  checkPermissions: (input, _ctx) =>
    Promise.resolve({ behavior: 'allow', updatedInput: input }),
  toAutoClassifierInput: () => '',
  userFacingName: () => 'database',

  renderToolUseMessage: (input) => `Database: ${input?.operation ?? '?'} ${input?.sql ? `(${input.sql.substring(0, 30)})` : ''}`,
  mapToolResultToToolResultBlockParam: (content, toolUseID) => ({
    tool_use_id: toolUseID,
    type: 'tool_result',
    content: content.success ? `操作成功${content.rows ? `，影响行数 ${content.rows}` : ''}` : '操作失败',
  }),
  prompt: async () => '使用 database 工具进行数据库操作。',
  description: async () => '数据库操作 (SQL, NoSQL)',
  call: async (args, context, canUseTool, parentMessage, onProgress) => {
    const result = await this.exec(args);
    return { data: result };
  },
};