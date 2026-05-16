import { jsonStringify } from '../../utils/slowOperations.js'

/**
 * 串行有序事件上传器，支持批处理、重试和背压。
 *
 * - enqueue() 将事件添加到待处理缓冲区
 * - 同一时间最多 1 个 POST 在飞行中
 * - 每次 POST 最多清空 maxBatchSize 个项目
 * - 飞行中时新事件会持续累积
 * - 失败时：指数退避（钳制），无限重试直到成功或 close()
 *   — 除非设置了 maxConsecutiveFailures，此时失败的批次被丢弃，
 *   清空继续前进
 * - flush() 阻塞直到待处理队列为空，并在需要时触发清空
 * - 背压：当达到 maxQueueSize 时 enqueue() 阻塞
 */

/**
 * 从 config.send() 抛出，使上传器在重试前等待服务器提供的时长
 *（例如携带 Retry-After 的 429）。设置 retryAfterMs 后，
 * 它会覆盖该次尝试的指数退避 — 钳制在 [baseDelayMs, maxDelayMs]
 * 并添加抖动，使得行为不当的服务器既不能热循环也不能阻塞客户端，
 * 且共享速率限制的多个会话不会同时涌出。没有 retryAfterMs 时，
 * 行为与任何其他抛出的错误相同（指数退避）。
 */
export class RetryableError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message)
  }
}

type SerialBatchEventUploaderConfig<T> = {
  /** 每次 POST 的最大项目数（1 = 无批处理） */
  maxBatchSize: number
  /**
   * 每次 POST 的最大序列化字节数。第一个项目始终进入，无论大小；
   * 后续项目仅在累积 JSON 字节数不超过此值时进入。
   * Undefined = 无字节限制（仅计数批处理）。
   */
  maxBatchBytes?: number
  /** enqueue() 阻塞前的最大待处理项目数 */
  maxQueueSize: number
  /** 实际的 HTTP 调用 — 调用者控制负载格式 */
  send: (batch: T[]) => Promise<void>
  /** 指数退避的基础延迟（毫秒） */
  baseDelayMs: number
  /** 最大延迟上限（毫秒） */
  maxDelayMs: number
  /** 添加到重试延迟的随机抖动范围（毫秒） */
  jitterMs: number
  /**
   * 连续 send() 失败这么多次后，丢弃失败的批次并
   * 以新的失败预算继续处理下一个待处理项目。
   * Undefined = 无限重试（默认）。
   */
  maxConsecutiveFailures?: number
  /** 当批次因达到 maxConsecutiveFailures 被丢弃时调用。 */
  onBatchDropped?: (batchSize: number, failures: number) => void
}

export class SerialBatchEventUploader<T> {
  private pending: T[] = []
  private pendingAtClose = 0
  private draining = false
  private closed = false
  private backpressureResolvers: Array<() => void> = []
  private sleepResolve: (() => void) | null = null
  private flushResolvers: Array<() => void> = []
  private droppedBatches = 0
  private readonly config: SerialBatchEventUploaderConfig<T>

  constructor(config: SerialBatchEventUploaderConfig<T>) {
    this.config = config
  }

  /**
   * 通过 maxConsecutiveFailures 丢弃的批次的单调递增计数。调用者
   * 可以在 flush() 之前快照并在之后比较以检测静默丢弃
   *（即使批次被丢弃，flush() 也会正常解析）。
   */
  get droppedBatchCount(): number {
    return this.droppedBatches
  }

  /**
   * 待处理队列深度。close() 后返回关闭时的计数 —
   * close() 会清空队列，但关闭诊断可能在此之后读取此值。
   */
  get pendingCount(): number {
    return this.closed ? this.pendingAtClose : this.pending.length
  }

  /**
   * 将事件添加到待处理缓冲区。如果有空间则立即返回。
   * 如果缓冲区已满则阻塞（等待）— 调用者暂停直到清空释放空间。
   */
  async enqueue(events: T | T[]): Promise<void> {
    if (this.closed) return
    const items = Array.isArray(events) ? events : [events]
    if (items.length === 0) return

    // 背压：等待直到有空间
    while (
      this.pending.length + items.length > this.config.maxQueueSize &&
      !this.closed
    ) {
      await new Promise<void>(resolve => {
        this.backpressureResolvers.push(resolve)
      })
    }

    if (this.closed) return
    this.pending.push(...items)
    void this.drain()
  }

  /**
   * 阻塞直到所有待处理事件已发送。
   * 用于轮次边界和优雅关闭。
   */
  flush(): Promise<void> {
    if (this.pending.length === 0 && !this.draining) {
      return Promise.resolve()
    }
    void this.drain()
    return new Promise<void>(resolve => {
      this.flushResolvers.push(resolve)
    })
  }

  /**
   * 丢弃待处理事件并停止处理。
   * 解析所有被阻塞的 enqueue() 和 flush() 调用者。
   */
  close(): void {
    if (this.closed) return
    this.closed = true
    this.pendingAtClose = this.pending.length
    this.pending = []
    this.sleepResolve?.()
    this.sleepResolve = null
    for (const resolve of this.backpressureResolvers) resolve()
    this.backpressureResolvers = []
    for (const resolve of this.flushResolvers) resolve()
    this.flushResolvers = []
  }

  /**
   * 清空循环。同一时间最多运行一个实例（由 this.draining 保护）。
   * 串行发送批次。失败时退避并无限重试。
   */
  private async drain(): Promise<void> {
    if (this.draining || this.closed) return
    this.draining = true
    let failures = 0

    try {
      while (this.pending.length > 0 && !this.closed) {
        const batch = this.takeBatch()
        if (batch.length === 0) continue

        try {
          await this.config.send(batch)
          failures = 0
        } catch (err) {
          failures++
          if (
            this.config.maxConsecutiveFailures !== undefined &&
            failures >= this.config.maxConsecutiveFailures
          ) {
            this.droppedBatches++
            this.config.onBatchDropped?.(batch.length, failures)
            failures = 0
            this.releaseBackpressure()
            continue
          }
          // 将失败的批次重新排队到前面。使用 concat（单次
          // 分配）而不是 unshift(...batch)，后者会移动每个
          // pending 项目 batch.length 次。只在失败路径上触发。
          this.pending = batch.concat(this.pending)
          const retryAfterMs =
            err instanceof RetryableError ? err.retryAfterMs : undefined
          await this.sleep(this.retryDelay(failures, retryAfterMs))
          continue
        }

        // 如果空间打开，释放背压等待者
        this.releaseBackpressure()
      }
    } finally {
      this.draining = false
      // 如果队列为空，通知 flush 等待者
      if (this.pending.length === 0) {
        for (const resolve of this.flushResolvers) resolve()
        this.flushResolvers = []
      }
    }
  }

  /**
   * 从待处理队列中取出下一个批次。同时遵循 maxBatchSize 和
   * maxBatchBytes。第一个项目始终被取出；后续项目仅在
   * 添加它们后累积 JSON 大小不超过 maxBatchBytes 时取出。
   *
   * 不可序列化的项目（BigInt、循环引用、抛出 toJSON）被
   * 原地丢弃 — 它们永远无法发送，留在 pending[0] 会污染队列
   * 并导致 flush() 永远挂起。
   */
  private takeBatch(): T[] {
    const { maxBatchSize, maxBatchBytes } = this.config
    if (maxBatchBytes === undefined) {
      return this.pending.splice(0, maxBatchSize)
    }
    let bytes = 0
    let count = 0
    while (count < this.pending.length && count < maxBatchSize) {
      let itemBytes: number
      try {
        itemBytes = Buffer.byteLength(jsonStringify(this.pending[count]))
      } catch {
        this.pending.splice(count, 1)
        continue
      }
      if (count > 0 && bytes + itemBytes > maxBatchBytes) break
      bytes += itemBytes
      count++
    }
    return this.pending.splice(0, count)
  }

  private retryDelay(failures: number, retryAfterMs?: number): number {
    const jitter = Math.random() * this.config.jitterMs
    if (retryAfterMs !== undefined) {
      // 在服务器的提示之上添加抖动，防止当
      // 多个会话共享速率限制并收到相同的
      // Retry-After 时出现雷击。先钳制，然后扩展 — 与
      // 指数路径的形状相同（有效天花板是 maxDelayMs + jitterMs）。
      const clamped = Math.max(
        this.config.baseDelayMs,
        Math.min(retryAfterMs, this.config.maxDelayMs),
      )
      return clamped + jitter
    }
    const exponential = Math.min(
      this.config.baseDelayMs * 2 ** (failures - 1),
      this.config.maxDelayMs,
    )
    return exponential + jitter
  }

  private releaseBackpressure(): void {
    const resolvers = this.backpressureResolvers
    this.backpressureResolvers = []
    for (const resolve of resolvers) resolve()
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => {
      this.sleepResolve = resolve
      setTimeout(
        (self, resolve) => {
          self.sleepResolve = null
          resolve()
        },
        ms,
        this,
        resolve,
      )
    })
  }
}
