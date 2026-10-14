/**
 * 内存水位管理器。
 *
 * 被 WorkerPool 用于两件事：
 *  - waitForMemory()：派发任务前等待内存回落到安全线，避免在高压下继续堆任务
 *  - tryGC()：任务间主动触发一次 GC（仅在 --expose-gc 下真实生效，否则 no-op）
 *  - getStatus()：把当前内存水位透出给 WorkerPool.getStatus()
 *
 * 水位语义：
 *  - highWaterMark       达到即「偏高」，等待回落
 *  - criticalWaterMark   达到即「危急」，急需等待
 * 单位一律 MB（与 PoolConfig.memoryThresholdMB 保持一致）。
 */

export interface MemoryManagerOptions {
  highWaterMark?: number
  criticalWaterMark?: number
  /** 轮询间隔（ms），默认 250 */
  pollIntervalMs?: number
  /** 单次 waitForMemory 的最长等待（ms），默认 30_000；0 表示不限 */
  maxWaitMs?: number
  /** 测试注入点：返回已用堆内存（字节）。默认 process.memoryUsage().heapUsed */
  heapUsedProvider?: () => number
}

export interface MemoryStatus {
  heapUsedMB: number
  highWaterMark: number
  criticalWaterMark: number
  level: 'ok' | 'high' | 'critical'
}

const DEFAULTS = {
  highWaterMark: 1024,
  criticalWaterMark: 1536,
  pollIntervalMs: 250,
  maxWaitMs: 30_000,
}

export class MemoryManager {
  private readonly highWaterMark: number
  private readonly criticalWaterMark: number
  private readonly pollIntervalMs: number
  private readonly maxWaitMs: number
  private readonly heapUsedProvider: () => number

  constructor(options?: MemoryManagerOptions) {
    const high = options?.highWaterMark ?? DEFAULTS.highWaterMark
    this.highWaterMark = high
    this.criticalWaterMark = options?.criticalWaterMark ?? high * 1.5
    this.pollIntervalMs = options?.pollIntervalMs ?? DEFAULTS.pollIntervalMs
    this.maxWaitMs = options?.maxWaitMs ?? DEFAULTS.maxWaitMs
    this.heapUsedProvider =
      options?.heapUsedProvider ?? (() => process.memoryUsage().heapUsed)
  }

  /** 当前已用堆内存（MB）。 */
  heapUsedMB(): number {
    return this.heapUsedProvider() / (1024 * 1024)
  }

  private level(): MemoryStatus['level'] {
    const mb = this.heapUsedMB()
    if (mb >= this.criticalWaterMark) return 'critical'
    if (mb >= this.highWaterMark) return 'high'
    return 'ok'
  }

  /**
   * 等待内存回落到 highWaterMark 之下。
   *
   * 超过 maxWaitMs 仍未回落则放行（返回 'timeout'），避免永久阻塞派发；
   * maxWaitMs 为 0 表示不设上限。返回最终水位等级以便调用方记录。
   */
  async waitForMemory(): Promise<'ok' | 'timeout'> {
    const started = Date.now()
    while (this.level() !== 'ok') {
      if (this.maxWaitMs > 0 && Date.now() - started >= this.maxWaitMs) {
        return 'timeout'
      }
      await new Promise(resolve => setTimeout(resolve, this.pollIntervalMs))
    }
    return 'ok'
  }

  /**
   * 主动触发 GC。仅在 Node 以 --expose-gc 启动（globalThis.gc 存在）时生效，
   * 否则静默 no-op —— 不能假设运行环境一定暴露 gc。
   */
  tryGC(): boolean {
    const gc = (globalThis as { gc?: () => void }).gc
    if (typeof gc === 'function') {
      gc()
      return true
    }
    return false
  }

  getStatus(): MemoryStatus {
    return {
      heapUsedMB: Math.round(this.heapUsedMB()),
      highWaterMark: this.highWaterMark,
      criticalWaterMark: this.criticalWaterMark,
      level: this.level(),
    }
  }
}
