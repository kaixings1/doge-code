/**
 * Synchronous state machine for the query lifecycle, compatible with
 * React's `useSyncExternalStore`.
 *
 * Three states:
 *   idle        → no query, safe to dequeue and process
 *   dispatching → an item was dequeued, async chain hasn't reached onQuery yet
 *   running     → onQuery called tryStart(), query is executing
 *
 * Transitions:
 *   idle → dispatching  (reserve)
 *   dispatching → running  (tryStart)
 *   idle → running  (tryStart, for direct user submissions)
 *   running → idle  (end / forceEnd)
 *   dispatching → idle  (cancelReservation, when processQueueIfReady fails)
 *
 * `isActive` returns true for both dispatching and running, preventing
 * re-entry from the queue processor during the async gap.
 *
 * Usage with React:
 *   const queryGuard = useRef(new QueryGuard()).current
 *   const isQueryActive = useSyncExternalStore(
 *     queryGuard.subscribe,
 *     queryGuard.getSnapshot,
 *   )
 */
import { createSignal } from './signal.js'

export class QueryGuard {
  private _status: 'idle' | 'dispatching' | 'running' | 'pending-idle' = 'idle'
  private _generation = 0
  private _changed = createSignal()
  private _pendingIdleTimer: ReturnType<typeof setTimeout> | null = null
  // Generation captured when end() was called — used by tryStart to detect
  // "same work continuation" vs "new query after idle".
  private _endedGeneration = 0

  /**
   * Grace period after end() before the guard truly becomes idle.
   * If tryStart() fires within this window, the guard snaps back to
   * running without ever reporting idle to subscribers — preventing
   * the tab-status icon from flashing green between tool-loop turns.
   */
  static PENDING_IDLE_GRACE_MS = 500

  /**
   * Reserve the guard for queue processing. Transitions idle → dispatching.
   * Returns false if not idle (another query or dispatch in progress).
   */
  reserve(): boolean {
    if (this._status !== 'idle') return false
    this._status = 'dispatching'
    this._notify()
    return true
  }

  /**
   * Cancel a reservation when processQueueIfReady had nothing to process.
   * Transitions dispatching → idle.
   */
  cancelReservation(): void {
    if (this._status !== 'dispatching') return
    this._status = 'idle'
    this._notify()
  }

  /**
   * Start a query. Returns the generation number on success,
   * or null if a query is already running (concurrent guard).
   * Accepts transitions from both idle (direct user submit)
   * and dispatching (queue processor path).
   *
   * If called during the pending-idle grace period for the SAME generation,
   * cancels the pending timer and resumes running without emitting an
   * idle snapshot — keeps the status icon from flashing green.
   */
  tryStart(): number | null {
    if (this._status === 'running') return null

    // Resume from pending-idle: same work continuation (tool loop).
    if (this._status === 'pending-idle' && this._generation === this._endedGeneration) {
      this._clearPendingIdle()
      this._status = 'running'
      this._notify()
      return this._generation
    }

    this._status = 'running'
    ++this._generation
    this._notify()
    return this._generation
  }

  /**
   * End a query. Returns true if this generation is still current
   * (meaning the caller should perform cleanup). Returns false if a
   * newer query has started (stale finally block from a cancelled query).
   *
   * Instead of immediately transitioning to idle, enters a brief
   * 'pending-idle' grace period. If no tryStart() arrives within
   * PENDING_IDLE_GRACE_MS, the guard transitions to idle. This prevents
   * the tab-status indicator from flashing green during rapid tool-loop
   * turn boundaries where the next onQuery follows within milliseconds.
   */
  end(generation: number): boolean {
    if (this._generation !== generation) return false
    if (this._status !== 'running') return false
    this._endedGeneration = generation
    this._status = 'pending-idle'
    this._notify()
    // Schedule the actual idle transition; tryStart() can cancel this.
    this._pendingIdleTimer = setTimeout(() => {
      this._pendingIdleTimer = null
      if (this._status === 'pending-idle') {
        this._status = 'idle'
        this._notify()
      }
    }, QueryGuard.PENDING_IDLE_GRACE_MS)
    return true
  }

  /**
   * Force-end the current query regardless of generation.
   * Used by onCancel where any running query should be terminated.
   * Increments generation so stale finally blocks from the cancelled
   * query's promise rejection will see a mismatch and skip cleanup.
   */
  forceEnd(): void {
    if (this._status === 'idle') return
    this._clearPendingIdle()
    this._status = 'idle'
    ++this._generation
    this._notify()
  }

  /**
   * Is the guard active (dispatching or running)?
   * Always synchronous — not subject to React state batching delays.
   *
   * 'pending-idle' reports as active so subscribers (tab icon) don't
   * see a transient idle state during tool-loop gaps.
   */
  get isActive(): boolean {
    return this._status !== 'idle'
  }

  get generation(): number {
    return this._generation
  }

  // --
  // useSyncExternalStore interface

  /** Subscribe to state changes. Stable reference — safe as useEffect dep. */
  subscribe = this._changed.subscribe

  /**
   * Snapshot for useSyncExternalStore. Returns `isActive`.
   *
   * 'pending-idle' returns true so the tab icon stays orange during
   * brief gaps between tool-loop turns. React's useSyncExternalStore
   * only re-renders when the snapshot changes, so the grace period
   * is invisible to the UI unless the gap exceeds PENDING_IDLE_GRACE_MS.
   */
  getSnapshot = (): boolean => {
    return this._status !== 'idle'
  }

  private _notify(): void {
    this._changed.emit()
  }

  private _clearPendingIdle(): void {
    if (this._pendingIdleTimer !== null) {
      clearTimeout(this._pendingIdleTimer)
      this._pendingIdleTimer = null
    }
  }
}
