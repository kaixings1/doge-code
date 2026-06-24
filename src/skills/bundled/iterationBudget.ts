/**
 * Iteration Budget — per-agent iteration counter
 *
 * Inspired by Hermes Agent's IterationBudget.
 *
 * Each agent (parent or subagent) gets its own budget.
 *   - parent: default 90 max iterations
 *   - subagent: default 50 max iterations
 *   - Some operations (e.g. execute_code) can refund their iteration
 *     so they don't eat into the budget.
 *
 * Thread-safe via mutex pattern.
 */

export class IterationBudget {
  private _used = 0
  private _locked = false

  constructor(
    public readonly maxTotal: number,
    public readonly name: string = 'agent',
  ) {}

  /** Try to consume one iteration. Returns true if allowed. */
  consume(): boolean {
    if (this._locked) return false
    this._locked = true
    try {
      if (this._used >= this.maxTotal) {
        return false
      }
      this._used++
      return true
    } finally {
      this._locked = false
    }
  }

  /** Refund one iteration (for operations that should not count). */
  refund(): void {
    if (this._locked) return
    this._locked = true
    try {
      if (this._used > 0) this._used--
    } finally {
      this._locked = false
    }
  }

  /** Get remaining budget. */
  get remaining(): number {
    return Math.max(0, this.maxTotal - this._used)
  }

  /** Get used count. */
  get used(): number {
    return this._used
  }

  /** Reset budget. */
  reset(): void {
    this._locked = true
    try {
      this._used = 0
    } finally {
      this._locked = false
    }
  }
}

/** Default budgets */
export const DEFAULT_PARENT_BUDGET = 90
export const DEFAULT_SUBAGENT_BUDGET = 50
