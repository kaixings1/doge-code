import { z } from 'zod/v4';
import { buildTool } from '../../Tool.js';
import { lazySchema } from '../../utils/lazySchema.js';
const inputSchema = lazySchema(() => z.object({
    query: z.string().describe('搜索查询'),
    server: z.string().optional().describe('指定的 MCP 服务器'),
}));
const outputSchema = lazySchema(() => z.object({
    results: z.array(z.object({
        name: z.string(),
        server: z.string(),
        description: z.string(),
    })).describe('搜索结果'),
    count: z.number().describe('结果数量'),
}));
export const McpToolSearchTool = buildTool({
    name: 'mcp-tool-search',
    description: async () => '搜索 MCP 服务器上的可用工具',
    callOn: 'manual',
    async prompt() {
        return '使用 mcp-tool-search 工具搜索 MCP 服务器上的工具。';
    },
    get inputSchema() {
        return inputSchema();
    },
    get outputSchema() {
        return outputSchema();
    },
    userFacingName() {
        return 'mcp-tool-search';
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
        const query = input?.query ?? '?';
        return `MCP Tool Search: ${query}`;
    },
    mapToolResultToToolResultBlockParam(content, toolUseID) {
        const count = content.count ?? 0;
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: `Found ${count} MCP tools`,
        };
    },
    async call({ query, server }, context) {
        try {
            const allTools = context.getAppState().mcp.tools;
            const queryLower = query.toLowerCase();
            let results = [];
            if (server) {
                const serverTools = allTools.filter(t => t.mcpInfo?.serverName === server && (t.name.toLowerCase().includes(queryLower) ||
                    (t.description || '').toLowerCase().includes(queryLower)));
                results = serverTools.map(t => ({
                    name: t.name,
                    server: t.mcpInfo?.serverName || server,
                    description: t.description || '',
                }));
            }
            else {
                results = allTools
                    .filter(t => t.name.toLowerCase().includes(queryLower) ||
                    (t.description || '').toLowerCase().includes(queryLower))
                    .map(t => ({
                    name: t.name,
                    server: t.mcpInfo?.serverName || 'unknown',
                    description: t.description || '',
                }));
            }
            return {
                data: {
                    results,
                    count: results.length,
                },
            };
        }
        catch {
            return {
                data: {
                    results: [],
                    count: 0,
                },
            };
        }
    },
});
//# sourceMappingURL=McpToolSearchTool.js.map