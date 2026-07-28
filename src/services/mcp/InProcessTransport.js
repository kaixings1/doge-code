/**
 * In-process linked transport pair for running an MCP server and client
 * in the same process without spawning a subprocess.
 *
 * `send()` on one side delivers to `onmessage` on the other.
 * `close()` on either side calls `onclose` on both.
 */
class InProcessTransport {
    peer;
    closed = false;
    onclose;
    onerror;
    onmessage;
    /** @internal */
    _setPeer(peer) {
        this.peer = peer;
    }
    async start() { }
    async send(message) {
        if (this.closed) {
            throw new Error('传输已关闭');
        }
        // Deliver to the other side asynchronously to avoid stack depth issues
        // with synchronous request/response cycles
        queueMicrotask(() => {
            this.peer?.onmessage?.(message);
        });
    }
    async close() {
        if (this.closed) {
            return;
        }
        this.closed = true;
        this.onclose?.();
        // Close the peer if it hasn't already closed
        if (this.peer && !this.peer.closed) {
            this.peer.closed = true;
            this.peer.onclose?.();
        }
    }
}
/**
 * Creates a pair of linked transports for in-process MCP communication.
 * Messages sent on one transport are delivered to the other's `onmessage`.
 *
 * @returns [clientTransport, serverTransport]
 */
export function createLinkedTransportPair() {
    const a = new InProcessTransport();
    const b = new InProcessTransport();
    a._setPeer(b);
    b._setPeer(a);
    return [a, b];
}
//# sourceMappingURL=InProcessTransport.js.map