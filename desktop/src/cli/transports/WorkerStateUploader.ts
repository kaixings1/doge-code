import { sleep } from '../../utils/sleep.js'

/**
 * PUT /worker（会话状态 + 元数据）的合并上传器。
 *
 * - 1 个飞行中 PUT + 1 个待处理补丁
 * - 新调用合并到待处理中（永远不会超过 1 个槽位）
 * - 成功时：发送待处理补丁（如果存在）
 * - 失败时：指数退避（钳制），无限重试直到成功或 close()。
 *   每次重试前吸收任何待处理补丁。
 * - 无需背压 — 自然限制在 2 个槽位
 *
 * 合并规则：
 * - 顶级键（worker_status, external_metadata）— 后值获胜
 * - 在 external_metadata / internal_metadata 内部 — RFC 7396 合并：
 *   键被添加/覆盖，null 值保留（服务器删除）
 */

type WorkerStateUploaderConfig = {
  send: (body: Record<string, unknown>) => Promise<boolean>
  /** 指数退避的基础延迟（毫秒） */
  baseDelayMs: number
  /** 最大延迟上限（毫秒） */
  maxDelayMs: number
  /** 添加到重试延迟的随机抖动范围（毫秒） */
  jitterMs: number
}

export class WorkerStateUploader {
  private inflight: Promise<void> | null = null
  private pending: Record<string, unknown> | null = null
  private closed = false
  private readonly config: WorkerStateUploaderConfig

  constructor(config: WorkerStateUploaderConfig) {
    this.config = config
  }

  /**
   * 将补丁排队到 PUT /worker。与任何现有的待处理补丁合并。
   * 即发即弃 — 调用者无需等待。
   */
  enqueue(patch: Record<string, unknown>): void {
    if (this.closed) return
    this.pending = this.pending ? coalescePatches(this.pending, patch) : patch
    void this.drain()
  }

  close(): void {
    this.closed = true
    this.pending = null
  }

  private async drain(): Promise<void> {
    if (this.inflight || this.closed) return
    if (!this.pending) return

    const payload = this.pending
    this.pending = null

    this.inflight = this.sendWithRetry(payload).then(() => {
      this.inflight = null
      if (this.pending && !this.closed) {
        void this.drain()
      }
    })
  }

  /** 使用指数退避无限重试，直到成功或 close()。 */
  private async sendWithRetry(payload: Record<string, unknown>): Promise<void> {
    let current = payload
    let failures = 0
    while (!this.closed) {
      const ok = await this.config.send(current)
      if (ok) return

      failures++
      await sleep(this.retryDelay(failures))

      // Absorb any patches that arrived during the retry
      if (this.pending && !this.closed) {
        current = coalescePatches(current, this.pending)
        this.pending = null
      }
    }
  }

  private retryDelay(failures: number): number {
    const exponential = Math.min(
      this.config.baseDelayMs * 2 ** (failures - 1),
      this.config.maxDelayMs,
    )
    const jitter = Math.random() * this.config.jitterMs
    return exponential + jitter
  }
}

/**
 * 合并两个用于 PUT /worker 的补丁。
 *
 * 顶级键：overlay 替换 base（后值获胜）。
 * 元数据键（external_metadata, internal_metadata）：RFC 7396 合并
 * 深度一层 — overlay 的键被添加/覆盖，null 值保留用于服务端删除。
 */
function coalescePatches(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...base }

  for (const [key, value] of Object.entries(overlay)) {
    if (
      (key === 'external_metadata' || key === 'internal_metadata') &&
      merged[key] &&
      typeof merged[key] === 'object' &&
      typeof value === 'object' &&
      value !== null
    ) {
      // RFC 7396 合并 — overlay 的键获胜，null 保留供服务端使用
      merged[key] = {
        ...(merged[key] as Record<string, unknown>),
        ...(value as Record<string, unknown>),
      }
    } else {
      merged[key] = value
    }
  }

  return merged
}
