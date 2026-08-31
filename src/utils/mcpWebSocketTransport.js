import { JSONRPCMessageSchema, } from '@modelcontextprotocol/sdk/types.js';
import { toError } from './errors.js';
import { jsonParse, jsonStringify } from './slowOperations.js';
// WebSocket readyState constants (same for both native and ws)
const WS_CONNECTING = 0;
const WS_OPEN = 1;
export class WebSocketTransport {
    constructor(ws) {
        this.ws = ws;
        this.started = false;
        this.isBun = typeof Bun !== 'undefined';
        // Bun (native WebSocket) event handlers
        this.onBunMessage = (event) => {
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
        this.onBunError = () => {
            this.handleError(new Error('WebSocket error'));
        };
        this.onBunClose = () => {
            this.handleCloseCleanup();
        };
        // Node (ws package) event handlers
        this.onNodeMessage = (data) => {
            try {
                const messageObj = jsonParse(data.toString('utf-8'));
                const message = JSONRPCMessageSchema.parse(messageObj);
                this.onmessage?.(message);
            }
            catch (error) {
                this.handleError(error);
            }
        };
        this.onNodeError = (error) => {
            this.handleError(error);
        };
        this.onNodeClose = () => {
            this.handleCloseCleanup();
        };
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
    // Shared error handler
    handleError(error) {
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
