/**
 * State machine for gating message writes during an initial flush.
 *
 * When a bridge session starts, historical messages are flushed to the
 * server via a single HTTP POST. During that flush, new messages must
 * be queued to prevent them from arriving at the server interleaved
 * with the historical messages.
 *
 * Lifecycle:
 *   start() → enqueue() returns true, items are queued
 *   end()   → returns queued items for draining, enqueue() returns false
 *   drop()  → discards queued items (permanent transport close)
 *   deactivate() → clears active flag without dropping items
 *                   (transport replacement — new transport will drain)
 */
export class FlushGate {
    _active = false;
    _pending = [];
    get active() {
        return this._active;
    }
    get pendingCount() {
        return this._pending.length;
    }
    /** Mark flush as in-progress. enqueue() will start queuing items. */
    start() {
        this._active = true;
    }
    /**
     * End the flush and return any queued items for draining.
     * Caller is responsible for sending the returned items.
     */
    end() {
        this._active = false;
        return this._pending.splice(0);
    }
    /**
     * If flush is active, queue the items and return true.
     * If flush is not active, return false (caller should send directly).
     */
    enqueue(...items) {
        if (!this._active)
            return false;
        this._pending.push(...items);
        return true;
    }
    /**
     * Discard all queued items (permanent transport close).
     * Returns the number of items dropped.
     */
    drop() {
        this._active = false;
        const count = this._pending.length;
        this._pending.length = 0;
        return count;
    }
    /**
     * Clear the active flag without dropping queued items.
     * Used when the transport is replaced (onWorkReceived) — the new
     * transport's flush will drain the pending items.
     */
    deactivate() {
        this._active = false;
    }
}
