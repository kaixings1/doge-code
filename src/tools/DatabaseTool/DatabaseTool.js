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
};
