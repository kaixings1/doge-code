import { logForDebugging } from '../utils/debug.js';
import { BridgeFatalError } from './bridgeApi.js';
let debugHandle = null;
const faultQueue = [];
export function registerBridgeDebugHandle(h) {
    debugHandle = h;
}
export function clearBridgeDebugHandle() {
    debugHandle = null;
    faultQueue.length = 0;
}
export function getBridgeDebugHandle() {
    return debugHandle;
}
export function injectBridgeFault(fault) {
    faultQueue.push(fault);
    logForDebugging(`[bridge:debug] 已排队故障：${fault.method} ${fault.kind}/${fault.status}${fault.errorType ? `/${fault.errorType}` : ''} ×${fault.count}`);
}
/**
 * 包装 BridgeApiClient，使得每次调用前先检查故障队列。
 * 如果存在匹配的故障，则抛出指定错误，不再调用真实客户端。
 * 其他情况全部委托给真实客户端。
 *
 * 仅在 USER_TYPE === 'ant' 时调用 —— 外部构建中零开销。
 */
export function wrapApiForFaultInjection(api) {
    function consume(method) {
        const idx = faultQueue.findIndex(f => f.method === method);
        if (idx === -1)
            return null;
        const fault = faultQueue[idx];
        fault.count--;
        if (fault.count <= 0)
            faultQueue.splice(idx, 1);
        return fault;
    }
    function throwFault(fault, context) {
        logForDebugging(`[bridge:debug] 正在向 ${context} 注入 ${fault.kind} 故障：status=${fault.status} errorType=${fault.errorType ?? 'none'}`);
        if (fault.kind === 'fatal') {
            throw new BridgeFatalError(`[注入] ${context} ${fault.status}`, fault.status, fault.errorType);
        }
        // 瞬态：模拟 axios 拒绝（5xx / 网络错误）。错误本身没有 .status 属性 ——
        // catch 块正是通过这一点来区分。
        throw new Error(`[注入瞬态故障] ${context} ${fault.status}`);
    }
    return {
        ...api,
        async pollForWork(envId, secret, signal, reclaimMs) {
            const f = consume('pollForWork');
            if (f)
                throwFault(f, 'Poll');
            return api.pollForWork(envId, secret, signal, reclaimMs);
        },
        async registerBridgeEnvironment(config) {
            const f = consume('registerBridgeEnvironment');
            if (f)
                throwFault(f, 'Registration');
            return api.registerBridgeEnvironment(config);
        },
        async reconnectSession(envId, sessionId) {
            const f = consume('reconnectSession');
            if (f)
                throwFault(f, 'ReconnectSession');
            return api.reconnectSession(envId, sessionId);
        },
        async heartbeatWork(envId, workId, token) {
            const f = consume('heartbeatWork');
            if (f)
                throwFault(f, 'Heartbeat');
            return api.heartbeatWork(envId, workId, token);
        },
    };
}
