import { CCRClient } from '../cli/transports/ccrClient.js';
import { SSETransport } from '../cli/transports/SSETransport.js';
import { logForDebugging } from '../utils/debug.js';
import { errorMessage } from '../utils/errors.js';
import { updateSessionIngressAuthToken } from '../utils/sessionIngressAuth.js';
import { registerWorker } from './workSecret.js';
/**
 * v1 adapter: HybridTransport already has the full surface (it extends
 * WebSocketTransport which has setOnConnect + getStateLabel). This is a
 * no-op wrapper that exists only so replBridge's `transport` variable
 * has a single type.
 */
export function createV1ReplTransport(hybrid) {
    return {
        write: msg => hybrid.write(msg),
        writeBatch: msgs => hybrid.writeBatch(msgs),
        close: () => hybrid.close(),
        isConnectedStatus: () => hybrid.isConnectedStatus(),
        getStateLabel: () => hybrid.getStateLabel(),
        setOnData: cb => hybrid.setOnData(cb),
        setOnClose: cb => hybrid.setOnClose(cb),
        setOnConnect: cb => hybrid.setOnConnect(cb),
        connect: () => void hybrid.connect(),
        // v1 Session-Ingress WS doesn't use SSE sequence numbers; replay
        // semantics are different. Always return 0 so the seq-num carryover
        // logic in replBridge is a no-op for v1.
        getLastSequenceNum: () => 0,
        get droppedBatchCount() {
            return hybrid.droppedBatchCount;
        },
        reportState: () => { },
        reportMetadata: () => { },
        reportDelivery: () => { },
        flush: () => Promise.resolve(),
    };
}
/**
 * v2 adapter: wrap SSETransport (reads) + CCRClient (writes, heartbeat,
 * state, delivery tracking).
 *
 * Auth: v2 endpoints validate the JWT's session_id claim (register_worker.go:32)
 * and worker role (environment_auth.py:856). OAuth tokens have neither.
 * This is the inverse of the v1 replBridge path, which deliberately uses OAuth.
 * The JWT is refreshed when the poll loop re-dispatches work — the caller
 * invokes createV2ReplTransport again with the fresh token.
 *
 * Registration happens here (not in the caller) so the entire v2 handshake
 * is one async step. registerWorker failure propagates — replBridge will
 * catch it and stay on the poll loop.
 */
export async function createV2ReplTransport(opts) {
    const { sessionUrl, ingressToken, sessionId, initialSequenceNum, getAuthToken, } = opts;
    // Auth header builder. If getAuthToken is provided, read from it
    // (per-instance, multi-session safe). Otherwise write ingressToken to
    // the process-wide env var (legacy single-session path — CCRClient's
    // default getAuthHeaders reads it via getSessionIngressAuthHeaders).
    let getAuthHeaders;
    if (getAuthToken) {
        getAuthHeaders = () => {
            const token = getAuthToken();
            if (!token)
                return {};
            return { Authorization: `Bearer ${token}` };
        };
    }
    else {
        // CCRClient.request() and SSETransport.connect() both read auth via
        // getSessionIngressAuthHeaders() → this env var. Set it before either
        // touches the network.
        updateSessionIngressAuthToken(ingressToken);
    }
    const epoch = opts.epoch ?? (await registerWorker(sessionUrl, ingressToken));
    logForDebugging(`[bridge:repl] CCR v2: 工作器 sessionId=${sessionId} epoch=${epoch}${opts.epoch !== undefined ? ' (来自 /bridge)' : ' (通过 registerWorker)'}`);
    // Derive SSE stream URL. Same logic as transportUtils.ts:26-33 but
    // starting from an http(s) base instead of a --sdk-url that might be ws://.
    const sseUrl = new URL(sessionUrl);
    sseUrl.pathname = sseUrl.pathname.replace(/\/$/, '') + '/worker/events/stream';
    const sse = new SSETransport(sseUrl, {}, sessionId, undefined, initialSequenceNum, getAuthHeaders);
    let onCloseCb;
    const ccr = new CCRClient(sse, new URL(sessionUrl), {
        getAuthHeaders,
        heartbeatIntervalMs: opts.heartbeatIntervalMs,
        heartbeatJitterFraction: opts.heartbeatJitterFraction,
        // Default is process.exit(1) — correct for spawn-mode children. In-process,
        // that kills the REPL. Close instead: replBridge's onClose wakes the poll
        // loop, which picks up the server's re-dispatch (with fresh epoch).
        onEpochMismatch: () => {
            logForDebugging('[bridge:repl] CCR v2: epoch superseded (409) — closing for poll-loop recovery');
            // Close resources in a try block so the throw always executes.
            // If ccr.close() or sse.close() throw, we still need to unwind
            // the caller (request()) — otherwise handleEpochMismatch's `never`
            // return type is violated at runtime and control falls through.
            try {
                ccr.close();
                sse.close();
                onCloseCb?.(4090);
            }
            catch (closeErr) {
                logForDebugging(`[bridge:repl] CCR v2: error during epoch-mismatch cleanup: ${errorMessage(closeErr)}`, { level: 'error' });
            }
            // Don't return — the calling request() code continues after the 409
            // branch, so callers see the logged warning and a false return. We
            // throw to unwind; the uploaders catch it as a send failure.
            throw new Error('epoch 已被替代');
        },
    });
    // CCRClient's constructor wired sse.setOnEvent → reportDelivery('received').
    // remoteIO.ts additionally sends 'processing'/'processed' via
    // setCommandLifecycleListener, which the in-process query loop fires. This
    // transport's only caller (replBridge/daemonBridge) has no such wiring — the
    // daemon's agent child is a separate process (ProcessTransport), and its
    // notifyCommandLifecycle calls fire with listener=null in its own module
    // scope. So events stay at 'received' forever, and reconnectSession re-queues
    // them on every daemon restart (observed: 21→24→25 phantom prompts as
    // "user sent a new message while you were working" system-reminders).
    //
    // Fix: ACK 'processed' immediately alongside 'received'. The window between
    // SSE receipt and transcript-write is narrow (queue → SDK → child stdin →
    // model); a crash there loses one prompt vs. the observed N-prompt flood on
    // every restart. Overwrite the constructor's wiring to do both — setOnEvent
    // replaces, not appends (SSETransport.ts:658).
    sse.setOnEvent(event => {
        ccr.reportDelivery(event.event_id, 'received');
        ccr.reportDelivery(event.event_id, 'processed');
    });
    // Both sse.connect() and ccr.initialize() are deferred to connect() below.
    // replBridge's calling order is newTransport → setOnConnect → setOnData →
    // setOnClose → connect(), and both calls need those callbacks wired first:
    // sse.connect() opens the stream (events flow to onData/onClose immediately),
    // and ccr.initialize().then() fires onConnectCb.
    //
    // onConnect fires once ccr.initialize() resolves. Writes go via
    // CCRClient HTTP POST (SerialBatchEventUploader), not SSE, so the
    // write path is ready the moment workerEpoch is set. SSE.connect()
    // awaits its read loop and never resolves — don't gate on it.
    // The SSE stream opens in parallel (~30ms) and starts delivering
    // inbound events via setOnData; outbound doesn't need to wait for it.
    let onConnectCb;
    let ccrInitialized = false;
    let closed = false;
    return {
        write(msg) {
            return ccr.writeEvent(msg);
        },
        async writeBatch(msgs) {
            // SerialBatchEventUploader already batches internally (maxBatchSize=100);
            // sequential enqueue preserves order and the uploader coalesces.
            // Check closed between writes to avoid sending partial batches after
            // transport teardown (epoch mismatch, SSE drop).
            for (const m of msgs) {
                if (closed)
                    break;
                await ccr.writeEvent(m);
            }
            // Ensure all enqueued events are actually sent before returning.
            // Without this, multiple commands can race and appear as unexecuted
            // JSON packets because HTTP POSTs are async and may not complete in order.
            if (!closed)
                await ccr.flush();
        },
        close() {
            closed = true;
            ccr.close();
            sse.close();
        },
        isConnectedStatus() {
            // Write-readiness, not read-readiness — replBridge checks this
            // before calling writeBatch. SSE open state is orthogonal.
            return ccrInitialized;
        },
        getStateLabel() {
            // SSETransport doesn't expose its state string; synthesize from
            // what we can observe. replBridge only uses this for debug logging.
            if (sse.isClosedStatus())
                return 'closed';
            if (sse.isConnectedStatus())
                return ccrInitialized ? 'connected' : 'init';
            return 'connecting';
        },
        setOnData(cb) {
            sse.setOnData(cb);
        },
        setOnClose(cb) {
            onCloseCb = cb;
            // SSE reconnect-budget exhaustion fires onClose(undefined) — map to
            // 4092 so ws_closed telemetry can distinguish it from HTTP-status
            // closes (SSETransport:280 passes response.status). Stop CCRClient's
            // heartbeat timer before notifying replBridge. (sse.close() doesn't
            // invoke this, so the epoch-mismatch path above isn't double-firing.)
            sse.setOnClose(code => {
                ccr.close();
                cb(code ?? 4092);
            });
        },
        setOnConnect(cb) {
            onConnectCb = cb;
        },
        getLastSequenceNum() {
            return sse.getLastSequenceNum();
        },
        // v2 write path (CCRClient) doesn't set maxConsecutiveFailures — no drops.
        droppedBatchCount: 0,
        reportState(state) {
            ccr.reportState(state);
        },
        reportMetadata(metadata) {
            ccr.reportMetadata(metadata);
        },
        reportDelivery(eventId, status) {
            ccr.reportDelivery(eventId, status);
        },
        flush() {
            return ccr.flush();
        },
        connect() {
            // Outbound-only: skip the SSE read stream entirely — no inbound
            // events to receive, no delivery ACKs to send. Only the CCRClient
            // write path (POST /worker/events) and heartbeat are needed.
            if (!opts.outboundOnly) {
                // Fire-and-forget — SSETransport.connect() awaits readStream()
                // (the read loop) and only resolves on stream close/error. The
                // spawn-mode path in remoteIO.ts does the same void discard.
                void sse.connect();
            }
            void ccr.initialize(epoch).then(() => {
                ccrInitialized = true;
                logForDebugging(`[bridge:repl] v2 transport ready for writes (epoch=${epoch}, sse=${sse.isConnectedStatus() ? 'open' : 'opening'})`);
                onConnectCb?.();
            }, (err) => {
                logForDebugging(`[bridge:repl] CCR v2 initialize failed: ${errorMessage(err)}`, { level: 'error' });
                // Close transport resources and notify replBridge via onClose
                // so the poll loop can retry on the next work dispatch.
                // Without this callback, replBridge never learns the transport
                // failed to initialize and sits with transport === null forever.
                ccr.close();
                sse.close();
                onCloseCb?.(4091); // 4091 = init failure, distinguishable from 4090 epoch mismatch
            });
        },
    };
}
