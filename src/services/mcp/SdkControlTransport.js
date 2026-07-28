/**
 * SDK MCP Transport Bridge
 *
 * This file implements a transport bridge that allows MCP servers running in the SDK process
 * to communicate with the Claude Code CLI process through control messages.
 *
 * ## Architecture Overview
 *
 * Unlike regular MCP servers that run as separate processes, SDK MCP servers run in-process
 * within the SDK. This requires a special transport mechanism to bridge communication between:
 * - The CLI process (where the MCP client runs)
 * - The SDK process (where the SDK MCP server runs)
 *
 * ## Message Flow
 *
 * ### CLI → SDK (via SdkControlClientTransport)
 * 1. CLI's MCP Client calls a tool → sends JSONRPC request to SdkControlClientTransport
 * 2. Transport wraps the message in a control request with server_name and request_id
 * 3. Control request is sent via stdout to the SDK process
 * 4. SDK's StructuredIO receives the control response and routes it back to the transport
 * 5. Transport unwraps the response and returns it to the MCP Client
 *
 * ### SDK → CLI (via SdkControlServerTransport)
 * 1. Query receives control request with MCP message and calls transport.onmessage
 * 2. MCP server processes the message and calls transport.send() with response
 * 3. Transport calls sendMcpMessage callback with the response
 * 4. Query's callback resolves the pending promise with the response
 * 5. Query returns the response to complete the control request
 *
 * ## Key Design Points
 *
 * - SdkControlClientTransport: StructuredIO tracks pending requests
 * - SdkControlServerTransport: Query tracks pending requests
 * - The control request wrapper includes server_name to route to the correct SDK server
 * - The system supports multiple SDK MCP servers running simultaneously
 * - Message IDs are preserved through the entire flow for proper correlation
 */
/**
 * CLI-side transport for SDK MCP servers.
 *
 * This transport is used in the CLI process to bridge communication between:
 * - The CLI's MCP Client (which wants to call tools on SDK MCP servers)
 * - The SDK process (where the actual MCP server runs)
 *
 * It converts MCP protocol messages into control requests that can be sent
 * through stdout/stdin to the SDK process.
 */
export class SdkControlClientTransport {
    serverName;
    sendMcpMessage;
    isClosed = false;
    onclose;
    onerror;
    onmessage;
    constructor(serverName, sendMcpMessage) {
        this.serverName = serverName;
        this.sendMcpMessage = sendMcpMessage;
    }
    async start() { }
    async send(message) {
        if (this.isClosed) {
            throw new Error('传输已关闭');
        }
        // Send the message and wait for the response
        const response = await this.sendMcpMessage(this.serverName, message);
        // Pass the response back to the MCP client
        if (this.onmessage) {
            this.onmessage(response);
        }
    }
    async close() {
        if (this.isClosed) {
            return;
        }
        this.isClosed = true;
        this.onclose?.();
    }
}
/**
 * SDK-side transport for SDK MCP servers.
 *
 * This transport is used in the SDK process to bridge communication between:
 * - Control requests coming from the CLI (via stdin)
 * - The actual MCP server running in the SDK process
 *
 * It acts as a simple pass-through that forwards messages to the MCP server
 * and sends responses back via a callback.
 *
 * Note: Query handles all request/response correlation and async flow.
 */
export class SdkControlServerTransport {
    sendMcpMessage;
    isClosed = false;
    constructor(sendMcpMessage) {
        this.sendMcpMessage = sendMcpMessage;
    }
    onclose;
    onerror;
    onmessage;
    async start() { }
    async send(message) {
        if (this.isClosed) {
            throw new Error('传输已关闭');
        }
        // Simply pass the response back through the callback
        this.sendMcpMessage(message);
    }
    async close() {
        if (this.isClosed) {
            return;
        }
        this.isClosed = true;
        this.onclose?.();
    }
}
//# sourceMappingURL=SdkControlTransport.js.map