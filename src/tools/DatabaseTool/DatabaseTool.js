import { z } from 'zod/v4';
import { buildTool } from '../../Tool.js';
import { lazySchema } from '../../utils/lazySchema.js';
const inputSchema = lazySchema(() => z.object({
    operation: z.enum(['query', 'insert', 'update', 'delete', 'migrate']).describe('数据库操作'),
    connection: z.string().optional().describe('连接字符串或名称（如 sqlite:app.db）'),
    sql: z.string().optional().describe('SQL 查询语句'),
    values: z.array(z.unknown()).optional().describe('insert/update 的参数值'),
    params: z.array(z.string()).optional().describe('SQL 占位符参数'),
}));
const outputSchema = lazySchema(() => z.object({
    success: z.boolean().describe('操作是否成功'),
    rowsAffected: z.number().optional().describe('受影响的行数'),
    data: z.array(z.record(z.unknown())).optional().describe('查询结果'),
    columns: z.array(z.string()).optional().describe('查询结果的列名'),
    lastInsertId: z.number().optional().describe('最后插入的 ID（SQLite）'),
    message: z.string().describe('操作结果消息'),
    error: z.string().optional().describe('错误信息'),
}));
const connectionStore = new Map();
function getConnection(connStr) {
    const key = connStr || ':memory:';
    const conn = connectionStore.get(key);
    if (!conn) {
        if (!connStr)
            return null;
        const isSqlite = connStr.startsWith('sqlite:') || connStr.endsWith('.db') || connStr.endsWith('.sqlite');
        const resolved = {
            name: key,
            type: isSqlite ? 'sqlite' : 'sqlite',
            path: isSqlite ? connStr.replace(/^sqlite:/, '') : connStr,
        };
        connectionStore.set(key, resolved);
        try {
            const Database = require('better-sqlite3');
            const db = new Database(resolved.path);
            return { db, conn: resolved };
        }
        catch {
            connectionStore.delete(key);
            return null;
        }
    }
    try {
        const Database = require('better-sqlite3');
        const db = new Database(conn.path);
        return { db, conn };
    }
    catch {
        return null;
    }
}
function executeQuery(db, sql, params) {
    const trimmed = sql.trim();
    const upper = trimmed.toUpperCase();
    const isSelect = upper.startsWith('SELECT') || upper.startsWith('PRAGMA') || upper.startsWith('EXPLAIN');
    if (isSelect) {
        const stmt = db.prepare(trimmed);
        const rows = stmt.all(...(params ?? []));
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
        return { rows: rows, columns, rowsAffected: 0 };
    }
    else {
        const stmt = db.prepare(trimmed);
        const result = stmt.run(...(params ?? []));
        return { rows: [], columns: [], rowsAffected: result.changes };
    }
}
export const DatabaseTool = buildTool({
    name: 'database',
    description: async () => '数据库操作（SQLite，支持 query/insert/update/delete/migrate）',
    callOn: 'manual',
    async prompt() {
        return '使用 database 工具操作 SQLite 数据库。';
    },
    get inputSchema() {
        return inputSchema();
    },
    get outputSchema() {
        return outputSchema();
    },
    userFacingName() {
        return 'database';
    },
    isEnabled() {
        return true;
    },
    toAutoClassifierInput() {
        return '';
    },
    async checkPermissions(input) {
        return { behavior: 'allow', updatedInput: input };
    },
    renderToolUseMessage(input) {
        const op = input?.operation ?? '?';
        const sql = input?.sql;
        return `Database: ${op}${sql ? ` ${sql.substring(0, 30)}` : ''}`;
    },
    mapToolResultToToolResultBlockParam(content, toolUseID) {
        const msg = content.message || '操作完成';
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: msg,
        };
    },
    async call({ operation, connection, sql, values, params }) {
        if (!sql) {
            return {
                data: {
                    success: false,
                    message: '请提供 SQL 语句',
                    error: 'missing sql',
                },
            };
        }
        let dbResult = null;
        try {
            dbResult = getConnection(connection);
            if (!dbResult) {
                return {
                    data: {
                        success: false,
                        message: '无法连接到数据库，请确认 connection 参数',
                        error: 'connection failed',
                    },
                };
            }
            const { db } = dbResult;
            if (operation === 'migrate') {
                const createTableSql = sql;
                db.exec(createTableSql);
                return {
                    data: {
                        success: true,
                        rowsAffected: 0,
                        message: `迁移完成: ${sql.substring(0, 100)}`,
                    },
                };
            }
            const result = executeQuery(db, sql, params || values);
            const success = true;
            if (operation === 'insert') {
                const lastId = db.prepare('SELECT last_insert_rowid() as id').get().id;
                return {
                    data: {
                        success,
                        rowsAffected: result.rowsAffected,
                        lastInsertId: lastId,
                        message: `已插入 ${result.rowsAffected} 行，ID: ${lastId}`,
                    },
                };
            }
            if (operation === 'update' || operation === 'delete') {
                return {
                    data: {
                        success,
                        rowsAffected: result.rowsAffected,
                        message: `${operation} 完成，影响 ${result.rowsAffected} 行`,
                    },
                };
            }
            return {
                data: {
                    success,
                    rowsAffected: result.rowsAffected,
                    data: result.rows,
                    columns: result.columns,
                    message: `查询返回 ${result.rows.length} 行`,
                },
            };
        }
        catch (err) {
            return {
                data: {
                    success: false,
                    message: `数据库操作失败: ${err instanceof Error ? err.message : String(err)}`,
                    error: err instanceof Error ? err.message : String(err),
                },
            };
        }
    },
});
//# sourceMappingURL=DatabaseTool.js.map