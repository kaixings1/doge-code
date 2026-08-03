import { logForDebugging } from '../utils/debug.js'
import { BridgeFatalError } from './bridgeApi.js'
import type { BridgeApiClient } from './types.js'

/**
 * 仅限 Ant 环境的故障注入，用于手动测试桥接恢复路径。
 *
 * 此功能针对的真实故障模式（BQ 2026-03-12，7 天窗口）：
 *   poll 404 not_found_error   — 每周 147K 会话，卡死在 onEnvironmentLost 门控
 *   ws_closed 1002/1006        — 每周 22K 会话，关闭后出现僵尸轮询
 *   register 瞬态故障          — 残留问题：doReconnect 过程中的网络抖动
 *
 * 用法：在 Remote Control 连接状态下，从 REPL 执行 /bridge-kick <子命令>，
 * 然后 tail debug.log 观察恢复机制的反应。
 *
 * 模块级状态是有意为之：每个 REPL 进程只有一个桥接实例，
 * /bridge-kick 斜杠命令没有其他方式可以触及 initBridgeCore 闭包内的内容，
 * 而 teardown 会清空该槽位。
 */

/** 将在下一次匹配的 API 调用时注入的一次性故障。 */
type BridgeFault = {
  method:
    | 'pollForWork'
    | 'registerBridgeEnvironment'
    | 'reconnectSession'
    | 'heartbeatWork'
  /** 致命错误会经 handleErrorStatus → BridgeFatalError 处理。
   *  瞬态错误表现为普通的 axios 拒绝（5xx / 网络错误）。
   *  恢复代码会区分两者：致命 → 拆除，瞬态 → 重试/退避。 */
  kind: 'fatal' | 'transient'
  status: number
  errorType?: string
  /** 剩余注入次数。每次消费时递减；减到 0 时移除。 */
  count: number
}

export type BridgeDebugHandle = {
  /** 直接调用传输层的永久关闭处理器。用于测试 ws_closed → reconnectEnvironmentWithSession 升级路径（#22148）。 */
  fireClose: (code: number) => void
  /** 调用 reconnectEnvironmentWithSession() —— 与 SIGUSR2 相同，但可以从斜杠命令调用。 */
  forceReconnect: () => void
  /** 为接下来 N 次对指定 API 方法的调用排队一个故障。 */
  injectFault: (fault: BridgeFault) => void
  /** 中止容量满时的睡眠，使得注入的 poll 故障立即生效，而不是最多 10 分钟后。 */
  wakePollLoop: () => void
  /** 用于 debug.log 中 grep 的环境/会话 ID。 */
  describe: () => string
}

let debugHandle: BridgeDebugHandle | null = null
const faultQueue: BridgeFault[] = []

export function registerBridgeDebugHandle(h: BridgeDebugHandle): void {
  debugHandle = h
}

export function clearBridgeDebugHandle(): void {
  debugHandle = null
  faultQueue.length = 0
}

export function getBridgeDebugHandle(): BridgeDebugHandle | null {
  return debugHandle
}

export function injectBridgeFault(fault: BridgeFault): void {
  faultQueue.push(fault)
  logForDebugging(
    `[bridge:debug] 已排队故障：${fault.method} ${fault.kind}/${fault.status}${fault.errorType ? `/${fault.errorType}` : ''} ×${fault.count}`,
  )
}

/**
 * 包装 BridgeApiClient，使得每次调用前先检查故障队列。
 * 如果存在匹配的故障，则抛出指定错误，不再调用真实客户端。
 * 其他情况全部委托给真实客户端。
 *
 * 仅在 USER_TYPE === 'ant' 时调用 —— 外部构建中零开销。
 */
export function wrapApiForFaultInjection(
  api: BridgeApiClient,
): BridgeApiClient {
  function consume(method: BridgeFault['method']): BridgeFault | null {
    const idx = faultQueue.findIndex(f => f.method === method)
    if (idx === -1) return null
    const fault = faultQueue[idx]!
    fault.count--
    if (fault.count <= 0) faultQueue.splice(idx, 1)
    return fault
  }

  function throwFault(fault: BridgeFault, context: string): never {
    logForDebugging(
      `[bridge:debug] 正在向 ${context} 注入 ${fault.kind} 故障：status=${fault.status} errorType=${fault.errorType ?? 'none'}`,
    )
    if (fault.kind === 'fatal') {
      throw new BridgeFatalError(
        `[注入] ${context} ${fault.status}`,
        fault.status,
        fault.errorType,
      )
    }
    // 瞬态：模拟 axios 拒绝（5xx / 网络错误）。错误本身没有 .status 属性 ——
    // catch 块正是通过这一点来区分。
    throw new Error(`[注入瞬态故障] ${context} ${fault.status}`)
  }

  return {
    ...api,
    async pollForWork(envId, secret, signal, reclaimMs) {
      const f = consume('pollForWork')
      if (f) throwFault(f, 'Poll')
      return api.pollForWork(envId, secret, signal, reclaimMs)
    },
    async registerBridgeEnvironment(config) {
      const f = consume('registerBridgeEnvironment')
      if (f) throwFault(f, 'Registration')
      return api.registerBridgeEnvironment(config)
    },
    async reconnectSession(envId, sessionId) {
      const f = consume('reconnectSession')
      if (f) throwFault(f, 'ReconnectSession')
      return api.reconnectSession(envId, sessionId)
    },
    async heartbeatWork(envId, workId, token) {
      const f = consume('heartbeatWork')
      if (f) throwFault(f, 'Heartbeat')
      return api.heartbeatWork(envId, workId, token)
    },
  }
}
