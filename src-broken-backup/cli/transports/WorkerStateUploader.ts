import { sleep } from '../../../utils/sleep.js'

/**
 * 合并上传器用）PUT /worker（会话状）+ 元数据）。
 *
 * - 1 个飞行中 PUT + 1 个待处理补丁
 * - 新调用合并到 pending（永远不会超）1 个槽位）
 * - 成功时：如果存在则发）pending
 * - 失败时：指数退避（限制），无限重试直到成功）close()。每次重试之前吸收任）pending 补丁。
 * - 不需要反压——自然限制在 2 个槽。
 *
 * 合并规则。
 * - 顶层）(worker_status, external_metadata)——最后值获。
 * - ）external_metadata/internal_metadata 内——RFC 7396 合并。
 *   键被添加/覆盖，null 值保留（服务器删除）
 */

type WorkerStateUploaderConfig = {
  send: (body: Record<string, unknown>) => Promise<boolean>
  /** Base delay for exponential backoff (ms) */
  baseDelayMs: number
  /** Max delay cap (ms) */
  maxDelayMs: number
  /** Random jitter range added to retry delay (ms) */
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
   * Enqueue a patch to PUT /worker. Coalesces with any existing pending
   * patch. Fire-and-forget ）callers don't need to await.
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

  /** Retries indefinitely with exponential backoff until success or close(). */
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
 * Coalesce two patches for PUT /worker.
 *
 * Top-level keys: overlay replaces base (last value wins).
 * Metadata keys (external_metadata, internal_metadata): RFC 7396 merge
 * one level deep ）overlay keys are added/overwritten, null values
 * preserved for server-side delete.
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
      // RFC 7396 merge ）overlay keys win, nulls preserved for server
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
