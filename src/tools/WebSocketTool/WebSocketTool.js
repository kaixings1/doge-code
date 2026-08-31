import { z } from 'zod/v4';
import { buildTool } from '../../Tool.js';
import { lazySchema } from '../../utils/lazySchema.js';
const inputSchema = lazySchema(() => z.object({
    url: z.string().url().describe('WebSocket 地址 (ws:// 或 wss://)'),
    action: z.enum(['connect', 'send', 'close', 'listen', 'status']).describe('WebSocket 操作'),
    message: z.string().optional().describe('要发送的消息（connect 时为初始消息）'),
    timeout: z.number().optional().describe('监听超时时间（毫秒）'),
    headers: z.record(z.string()).optional().describe('连接头信息'),
}));
const outputSchema = lazySchema(() => z.object({
    connected: z.boolean().describe('是否已连接'),
    data: z.string().optional().describe('接收到的数据'),
    message: z.string().optional().describe('状态消息'),
    connectionId: z.string().optional().describe('连接 ID'),
    latencyMs: z.number().optional().describe('延迟（毫秒）'),
}));
const MAX_CONNECTIONS = 10;
const MAX_MESSAGES_PER_CONNECTION = 200;
const connectionStore = new Map();
let connCounter = 0;
function getConnection(id) {
    return connectionStore.get(id);
}
function createConnectionId() {
    return `ws_${++connCounter}_${Date.now().toString(36)}`;
}
export const WebSocketTool = buildTool({
    name: 'websocket',
    description: async () => 'WebSocket 客户端（连接/发送/监听/关闭/状态）',
    callOn: 'manual',
    async prompt() {
        return '使用 websocket 工具进行 WebSocket 实时通信。';
    },
    get inputSchema() {
        return inputSchema();
    },
    get outputSchema() {
        return outputSchema();
    },
    userFacingName() {
        return 'websocket';
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
        const action = input?.action ?? '?';
        const url = input?.url ?? '';
        return `WebSocket: ${action} ${url}`;
    },
    mapToolResultToToolResultBlockParam(content, toolUseID) {
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: content.message || 'WebSocket operation completed',
        };
    },
    async call({ url, action, message, timeout = 5000, headers }) {
        switch (action) {
            case 'connect': {
                if (connectionStore.size >= MAX_CONNECTIONS) {
                    return { data: { connected: false, message: `连接数已达上限 (${MAX_CONNECTIONS})` } };
                }
                const connId = createConnectionId();
                return new Promise((resolve) => {
                    try {
                        // 动态导入 WebSocket 以兼容不同环境
                        import('ws').then((wsModule) => {
                            const WebSocketClient = wsModule.default || wsModule;
                            const ws = new WebSocketClient(url, { headers: headers });
                            const connection = {
                                id: connId,
                                url,
                                ws,
                                connected: false,
                                messages: [],
                                connectedAt: 0,
                            };
                            const timeoutHandle = setTimeout(() => {
                                try {
                                    ws.close();
                                }
                                catch { /* ignore */ }
                                connectionStore.delete(connId);
                                resolve({
                                    data: {
                                        connected: false,
                                        connectionId: connId,
                                        message: `连接超时 (${timeout}ms)`,
                                    },
                                });
                            }, timeout);
                            ws.on('open', () => {
                                clearTimeout(timeoutHandle);
                                connection.connected = true;
                                connection.connectedAt = Date.now();
                                connectionStore.set(connId, connection);
                                resolve({
                                    data: {
                                        connected: true,
                                        connectionId: connId,
                                        message: `已连接到 ${url}`,
                                    },
                                });
                                if (message) {
                                    try {
                                        ws.send(message);
                                    }
                                    catch { /* ignore */ }
                                }
                            });
                            ws.on('message', (data) => {
                                const text = typeof data === 'string' ? data : data.toString('utf-8');
                                connection.messages.push(text);
                                if (connection.messages.length > MAX_MESSAGES_PER_CONNECTION) {
                                    connection.messages.shift();
                                }
                            });
                            ws.on('error', (err) => {
                                clearTimeout(timeoutHandle);
                                connectionStore.delete(connId);
                                resolve({
                                    data: {
                                        connected: false,
                                        connectionId: connId,
                                        message: `连接错误: ${err.message}`,
                                    },
                                });
                            });
                            ws.on('close', () => {
                                connection.connected = false;
                            });
                        }).catch(() => {
                            // 如果 ws 包不可用，提供回退方案
                            clearTimeout(timeoutHandle);
                            resolve({
                                data: {
                                    connected: false,
                                    connectionId: connId,
                                    message: `WebSocket 客户端不可用，请安装 ws 包 (bun add ws)`,
                                },
                            });
                        });
                    }
                    catch {
                        resolve({
                            data: {
                                connected: false,
                                connectionId: connId,
                                message: '❌ 错误: WebSocket 连接失败',
                            },
                        });
                    }
                });
            }
            case 'send': {
                if (!url) {
                    return { data: { connected: false, message: 'send 需要 url 参数' } };
                }
                // 查找匹配的连接
                const matching = Array.from(connectionStore.values()).find(c => c.url === url || c.id === url);
                if (!matching) {
                    return { data: { connected: false, message: `未找到连接到 ${url} 的 WebSocket 连接，请先 connect` } };
                }
                if (!message) {
                    return { data: { connected: true, message: 'send 需要 message 参数' } };
                }
                try {
                    const ws = matching.ws;
                    ws.send(message);
                    return {
                        data: {
                            connected: true,
                            connectionId: matching.id,
                            message: `消息已发送到 ${url} (${message.length} 字符)`,
                        },
                    };
                }
                catch {
                    return { data: { connected: false, message: '发送失败' } };
                }
            }
            case 'listen': {
                if (!url) {
                    return { data: { connected: false, message: 'listen 需要 url 参数' } };
                }
                const matching = Array.from(connectionStore.values()).find(c => c.url === url || c.id === url);
                if (!matching) {
                    return { data: { connected: false, message: `未找到连接，请先 connect` } };
                }
                await new Promise(r => setTimeout(r, Math.min(timeout, 3000)));
                const recentMessages = matching.messages.slice(-10);
                return {
                    data: {
                        connected: matching.connected,
                        connectionId: matching.id,
                        data: recentMessages.join('\n') || '(无消息)',
                        message: `监听 ${Math.min(timeout, 3000)}ms，收到 ${recentMessages.length} 条消息`,
                    },
                };
            }
            case 'status': {
                const connections = Array.from(connectionStore.values()).map(c => ({
                    id: c.id,
                    url: c.url,
                    connected: c.connected,
                    messages: c.messages.length,
                    uptimeMs: c.connectedAt ? Date.now() - c.connectedAt : 0,
                }));
                return {
                    data: {
                        connected: connectionStore.size > 0,
                        message: connectionStore.size > 0
                            ? `${connectionStore.size} 个活跃连接:\n${connections.map(c => `  ${c.id}: ${c.url} (${c.connected ? '已连接' : '断开'}, ${c.messages} msgs)`).join('\n')}`
                            : '无活跃 WebSocket 连接',
                    },
                };
            }
            case 'close': {
                if (!url) {
                    return { data: { connected: false, message: 'close 需要 url 或 connectionId' } };
                }
                const toClose = Array.from(connectionStore.entries()).filter(([, c]) => c.url === url || c.id === url);
                if (toClose.length === 0) {
                    return { data: { connected: false, message: `未找到匹配的连接` } };
                }
                for (const [id, conn] of toClose) {
                    try {
                        conn.ws.close();
                    }
                    catch { /* ignore */ }
                    connectionStore.delete(id);
                }
                return {
                    data: {
                        connected: false,
                        message: `已关闭 ${toClose.length} 个连接`,
                    },
                };
            }
        }
    },
});
