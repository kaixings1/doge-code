/**
 * engine/stateMachine.ts — 查询引擎状态机（文档 02 §2.2.1 / §3）
 *
 * 状态：idle → responding → needs_user → should_continue → done/crashed/aborted_by_user
 * 转换规则见 §3.2 / §3.4 转换守卫。
 */
export type QueryState =
  | "idle"
  | "responding"
  | "needs_user"
  | "should_continue"
  | "done"
  | "crashed"
  | "aborted_by_user";

export interface StateChangeEvent {
  from: QueryState;
  to: QueryState;
  context?: unknown;
  timestamp: Date;
}

export type StateChangeListener = (event: StateChangeEvent) => void | Promise<void>;

const TERMINAL: QueryState[] = ["done", "crashed", "aborted_by_user"];

export class QueryStateMachine {
  private currentState: QueryState = "idle";
  private stateHistory: QueryState[] = [];
  private transitions = new Map<QueryState, QueryState[]>();
  private listeners = new Set<StateChangeListener>();
  private guards = new Map<string, (ctx?: unknown) => Promise<boolean>>();

  constructor() {
    this.setupTransitions();
    this.setupGuards();
  }

  private setupTransitions(): void {
    this.transitions.set("idle", ["responding", "aborted_by_user"]);
    this.transitions.set("responding", ["needs_user", "should_continue", "crashed", "aborted_by_user"]);
    this.transitions.set("needs_user", ["responding", "aborted_by_user", "done"]);
    this.transitions.set("should_continue", ["responding", "done", "aborted_by_user"]);
    this.transitions.set("done", []);
    this.transitions.set("crashed", []);
    this.transitions.set("aborted_by_user", []);
  }

  private setupGuards(): void {
    this.guards.set("idle:responding", async (ctx) => {
      const c = ctx as { message?: string };
      return !!c && !!c.message && c.message.trim().length > 0;
    });
    this.guards.set("responding:needs_user", async (ctx) => {
      const c = ctx as { authorizationRequest?: unknown };
      return !!c && !!c.authorizationRequest;
    });
    this.guards.set("should_continue:responding", async (ctx) => {
      const c = ctx as { budgetCheck?: { shouldReject: boolean } };
      return !!c && !!c.budgetCheck && !c.budgetCheck.shouldReject;
    });
  }

  canTransition(from: QueryState, to: QueryState): boolean {
    const allowed = this.transitions.get(from);
    if (!allowed) return false;
    return allowed.includes(to);
  }

  async transition(to: QueryState, context?: unknown): Promise<void> {
    if (!this.canTransition(this.currentState, to)) {
      throw new Error(
        `Invalid state transition: ${this.currentState} → ${to}. ` +
          `Allowed: ${(this.transitions.get(this.currentState) ?? []).join(", ")}`,
      );
    }
    const guard = this.guards.get(`${this.currentState}:${to}`);
    if (guard && !(await guard(context))) {
      throw new Error(`Guard rejected transition: ${this.currentState} → ${to}`);
    }
    const from = this.currentState;
    this.stateHistory.push(from);
    this.currentState = to;
    const evt: StateChangeEvent = { from, to, context, timestamp: new Date() };
    for (const l of this.listeners) {
      try {
        await l(evt);
      } catch (e) {
        console.error("State change listener error:", e);
      }
    }
  }

  get state(): QueryState {
    return this.currentState;
  }

  get history(): QueryState[] {
    return [...this.stateHistory];
  }

  isTerminal(): boolean {
    return TERMINAL.includes(this.currentState);
  }

  canContinue(): boolean {
    return !this.isTerminal();
  }

  onStateChange(listener: StateChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  reset(): void {
    this.currentState = "idle";
    this.stateHistory = [];
  }
}