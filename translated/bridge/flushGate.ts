/**
 * 在初始刷新期间拦截消息写入的状态机。
 *
 * 当桥接会话启动时，历史消息将通过一次HTTP POST刷新到服务器端。
 * 刷新过程中必须缓存新消息以防止与历史消息交错到达服务器。
 *
 * 生命周期：
 *   start() → 允许入队操作并返回true，此时开始缓存消息
 *   end()   → 返回缓存的消息用于排空，入队操作返回false
 *   drop()  → 永久丢弃缓存的消息（永久传输关闭）
 *   deactivate() → 不丢弃缓存消息的情况下清除活动标志
 *                   （传输替换 — 新传输将负责排空）
 */
export class FlushGate<T> {
  private _active = false
  private _pending: T[] = []

  get active(): boolean {
    return this._active
  }

  get pendingCount(): number {
    return this._pending.length
  }

  /** 标记刷新操作正在进行中。入队操作将开始缓存消息 */
  start(): void {
    this._active = true
  }

  /**
   * 结束刷新并返回所有缓存的消息用于排空。
   * 调用者需负责发送这些返回的消息。
   */
  end(): T[] {
    this._active = false
    return this._pending.splice(0)
  }

  /**
   * 若刷新操作激活，则将消息放入队列并返回true。
   * 若未激活则返回false（调用者应直接发送）。
   */
  enqueue(...items: T[]): boolean {
    if (!this._active) return false
    this._pending.push(...items)
    return true
  }

  /**
   * 永久丢弃所有缓存的消息。
   * 返回被丢弃的消息数量。
   */
  drop(): number {
    this._active = false
    const count = this._pending.length
    this._pending.length = 0
    return count
  }

  /**
   * 清除活动标志但不丢弃缓存消息。
   * 用于当传输被替换时（onWorkReceived事件）——
   * 新传输的刷新操作将负责排空这些待处理的消息。
   */
  deactivate(): void {
    this._active = false
  }
}