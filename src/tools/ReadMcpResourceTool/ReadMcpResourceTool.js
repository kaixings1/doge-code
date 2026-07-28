import { ReadResourceResultSchema, } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod/v4';
import { ensureConnectedClient } from '../../services/mcp/client.js';
import { buildTool } from '../../Tool.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { getBinaryBlobSavedMessage, persistBinaryContent, } from '../../utils/mcpOutputStorage.js';
import { jsonStringify } from '../../utils/slowOperations.js';
import { isOutputLineTruncated } from '../../utils/terminal.js';
import { DESCRIPTION, PROMPT } from './prompt.js';
import { renderToolResultMessage, renderToolUseMessage, userFacingName, } from './UI.js';
export const inputSchema = lazySchema(() => z.object({
    server: z.string().describe('MCP 服务器名称'),
    uri: z.string().describe('要读取的资源 URI'),
}));
export const outputSchema = lazySchema(() => z.object({
    contents: z.array(z.object({
        uri: z.string().describe('资源 URI'),
        mimeType: z.string().optional().describe('内容的 MIME 类型'),
        text: z.string().optional().describe('资源的文本内容'),
        blobSavedTo: z
            .string()
            .optional()
            .describe('二进制 blob 内容保存的路径'),
    })),
}));
export const ReadMcpResourceTool = buildTool({
    isConcurrencySafe() {
        return true;
    },
    isReadOnly() {
        return true;
    },
    toAutoClassifierInput(input) {
        return `${input.server} ${input.uri}`;
    },
    shouldDefer: true,
    name: 'ReadMcpResourceTool',
    searchHint: '按 URI 读取特定 MCP 资源',
    maxResultSizeChars: 100_000,
    async description() {
        return DESCRIPTION;
    },
    async prompt() {
        return PROMPT;
    },
    get inputSchema() {
        return inputSchema();
    },
    get outputSchema() {
        return outputSchema();
    },
    async call(input, { options: { mcpClients } }) {
        const { server: serverName, uri } = input;
        const client = mcpClients.find(client => client.name === serverName);
        if (!client) {
            throw new Error(`未找到服务器 "${serverName}"。可用服务器：${mcpClients.map(c => c.name).join(', ')}`);
        }
        if (client.type !== 'connected') {
            throw new Error(`服务器 "${serverName}" 未连接`);
        }
        if (!client.capabilities?.resources) {
            throw new Error(`服务器 "${serverName}" 不支持资源`);
        }
        const connectedClient = await ensureConnectedClient(client);
        const result = (await connectedClient.client.request({
            method: 'resources/read',
            params: { uri },
        }, ReadResourceResultSchema));
        // Intercept any blob fields: decode, write raw bytes to disk with a
        // mime-derived extension, and replace with a path. Otherwise the base64
        // would be stringified straight into the context.
        const contents = await Promise.all(result.contents.map(async (c, i) => {
            if ('text' in c) {
                return { uri: c.uri, mimeType: c.mimeType, text: c.text };
            }
            if (!('blob' in c) || typeof c.blob !== 'string') {
                return { uri: c.uri, mimeType: c.mimeType };
            }
            const persistId = `mcp-resource-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`;
            const persisted = await persistBinaryContent(Buffer.from(c.blob, 'base64'), c.mimeType, persistId);
            if ('error' in persisted) {
                return {
                    uri: c.uri,
                    mimeType: c.mimeType,
                    text: `Binary content could not be saved to disk: ${persisted.error}`,
                };
            }
            return {
                uri: c.uri,
                mimeType: c.mimeType,
                blobSavedTo: persisted.filepath,
                text: getBinaryBlobSavedMessage(persisted.filepath, c.mimeType, persisted.size, `[Resource from ${serverName} at ${c.uri}] `),
            };
        }));
        return {
            data: { contents },
        };
    },
    renderToolUseMessage,
    userFacingName,
    renderToolResultMessage,
    isResultTruncated(output) {
        return isOutputLineTruncated(jsonStringify(output));
    },
    mapToolResultToToolResultBlockParam(content, toolUseID) {
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: jsonStringify(content),
        };
    },
});
//# sourceMappingURL=ReadMcpResourceTool.js.map