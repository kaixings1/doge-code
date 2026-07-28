import { JSONRPCMessageSchema, } from '@modelcontextprotocol/sdk/types.js';
import { logForDiagnosticsNoPII } from './diagLogs.js';
import { toError } from './errors.js';
import { jsonParse, jsonStringify } from './slowOperations.js';
// WebSocket readyState constants (same for both native and ws)
const WS_CONNECTING = 0;
const WS_OPEN = 1;
export class WebSocketTransport {
    ws;
    started = false;
    opened;
    isBun = typeof Bun !== 'undefined';
    constructor(ws) {
        this.ws = ws;
        this.opened = new Promise((resolve, reject) => {
            if (this.ws.readyState === WS_OPEN) {
                resolve();
            }
            else if (this.isBun) {
                const nws = this.ws;
                const onOpen = () => {
                    nws.removeEventListener('open', onOpen);
                    nws.removeEventListener('error', onError);
                    resolve();
                };
                const onError = (event) => {
                    nws.removeEventListener('open', onOpen);
                    nws.removeEventListener('error', onError);
                    logForDiagnosticsNoPII('error', 'mcp_websocket_connect_fail');
                    reject(event);
                };
                nws.addEventListener('open', onOpen);
                nws.addEventListener('error', onError);
            }
            else {
                const nws = this.ws;
                nws.on('open', () => {
                    resolve();
                });
                nws.on('error', error => {
                    logForDiagnosticsNoPII('error', 'mcp_websocket_connect_fail');
                    reject(error);
                });
            }
        });
        // Attach persistent event handlers
        if (this.isBun) {
            const nws = this.ws;
            nws.addEventListener('message', this.onBunMessage);
            nws.addEventListener('error', this.onBunError);
            nws.addEventListener('close', this.onBunClose);
        }
        else {
            const nws = this.ws;
            nws.on('message', this.onNodeMessage);
            nws.on('error', this.onNodeError);
            nws.on('close', this.onNodeClose);
        }
    }
    onclose;
    onerror;
    onmessage;
    // Bun (native WebSocket) event handlers
    onBunMessage = (event) => {
        try {
            const data = typeof event.data === 'string' ? event.data : String(event.data);
            const messageObj = jsonParse(data);
            const message = JSONRPCMessageSchema.parse(messageObj);
            this.onmessage?.(message);
        }
        catch (error) {
            this.handleError(error);
        }
    };
    onBunError = () => {
        this.handleError(new Error('WebSocket error'));
    };
    onBunClose = () => {
        this.handleCloseCleanup();
    };
    // Node (ws package) event handlers
    onNodeMessage = (data) => {
        try {
            const messageObj = jsonParse(data.toString('utf-8'));
            const message = JSONRPCMessageSchema.parse(messageObj);
            this.onmessage?.(message);
        }
        catch (error) {
            this.handleError(error);
        }
    };
    onNodeError = (error) => {
        this.handleError(error);
    };
    onNodeClose = () => {
        this.handleCloseCleanup();
    };
    // Shared error handler
    handleError(error) {
        logForDiagnosticsNoPII('error', 'mcp_websocket_message_fail');
        this.onerror?.(toError(error));
    }
    // Shared close handler with listener cleanup
    handleCloseCleanup() {
        this.onclose?.();
        // Clean up listeners after close
        if (this.isBun) {
            const nws = this.ws;
            nws.removeEventListener('message', this.onBunMessage);
            nws.removeEventListener('error', this.onBunError);
            nws.removeEventListener('close', this.onBunClose);
        }
        else {
            const nws = this.ws;
            nws.off('message', this.onNodeMessage);
            nws.off('error', this.onNodeError);
            nws.off('close', this.onNodeClose);
        }
    }
    /**
     * Starts listening for messages on the WebSocket.
     */
    async start() {
        if (this.started) {
            throw new Error('Start can only be called once per transport.');
        }
        await this.opened;
        if (this.ws.readyState !== WS_OPEN) {
            logForDiagnosticsNoPII('error', 'mcp_websocket_start_not_opened');
            throw new Error('WebSocket 未打开。无法启动传输层。');
        }
        this.started = true;
        // Unlike stdio, WebSocket connections are typically already established when the transport is created.
        // No explicit connection action needed here, just attaching listeners.
    }
    /**
     * Closes the WebSocket connection.
     */
    async close() {
        if (this.ws.readyState === WS_OPEN ||
            this.ws.readyState === WS_CONNECTING) {
            this.ws.close();
        }
        // Ensure listeners are removed even if close was called externally or connection was already closed
        this.handleCloseCleanup();
    }
    /**
     * Sends a JSON-RPC message over the WebSocket connection.
     */
    async send(message) {
        if (this.ws.readyState !== WS_OPEN) {
            logForDiagnosticsNoPII('error', 'mcp_websocket_send_not_opened');
            throw new Error('WebSocket 未打开。无法发送消息。');
        }
        const json = jsonStringify(message);
        try {
            if (this.isBun) {
                // Native WebSocket.send() is synchronous (no callback)
                this.ws.send(json);
            }
            else {
                await new Promise((resolve, reject) => {
                    ;
                    this.ws.send(json, error => {
                        if (error) {
                            reject(error);
                        }
                        else {
                            resolve();
                        }
                    });
                });
            }
        }
        catch (error) {
            this.handleError(error);
            throw error;
        }
    }
}
//# sourceMappingURL=mcpWebSocketTransport.js.map