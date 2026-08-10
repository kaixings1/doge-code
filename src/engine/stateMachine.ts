/**
 * engine/stateMachine.ts — 查询引擎状态机（文档 02 §2.2.1 / §3）
 *
 * 状态：idle → responding → needs_user → should_continue → done/crashed/aborted_by_user
 * 转换规则见 §3.2 / §3.4 转换守卫。
 *
 * ThreadState reducer 模式（吸收自 deer-flow）：复杂字段绑定专属 reducer，
 * 在状态合并时执行语义化操作（去重、clear、上限截断），避免裸对象合并导致的冲突。
 * 适用于 sandbox / artifacts / delegations / summary_text 等多写字段。
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
    this.transitions.set("responding", ["needs_user", "should_continue", "crashed", "aborted_by_user", "done"]);
    this.transitions.set("needs_user", ["responding", "aborted_by_user", "done"]);
    this.transitions.set("should_continue", ["responding", "done", "aborted_by_user", "crashed"]);
    this.transitions.set("done", ["responding", "aborted_by_user"]);
    this.transitions.set("crashed", ["responding", "aborted_by_user"]);
    this.transitions.set("aborted_by_user", ["responding"]);
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
    this.guards.set("should_continue:responding", async () => {
      return true;
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

/**
 * AcceptanceGate — 验收标准门控（吸收自 intent-driven-development）
 *
 * 在状态转换到 "done" 前，检查所有 required 验收标准是否通过。
 * 每个标准包含可验证的检查逻辑，失败则阻止进入 done 状态。
 */
export interface AcceptanceCriterion {
  id: string
  description: string
  priority: 'required' | 'optional'
  /** 验证方法：返回 true 表示通过 */
  verify: () => boolean | Promise<boolean>
}

export interface AcceptanceGateResult {
  allRequiredPass: boolean
  results: Array<{ id: string; passed: boolean; description: string }>
}

export class AcceptanceGate {
  private criteria: AcceptanceCriterion[] = []

  add(criterion: AcceptanceCriterion): void {
    this.criteria.push(criterion)
  }

  addMany(criteria: AcceptanceCriterion[]): void {
    this.criteria.push(...criteria)
  }

  clear(): void {
    this.criteria = []
  }

  get count(): number {
    return this.criteria.length
  }

  /**
   * check — 执行所有验收标准的验证。
   * 返回详细结果，allRequiredPass 为 true 时方可进入 done 状态。
   */
  async check(): Promise<AcceptanceGateResult> {
    const results = await Promise.all(
      this.criteria.map(async (c) => ({
        id: c.id,
        passed: await c.verify(),
        description: c.description,
      })),
    )

    const requiredResults = results.filter((r) => {
      const criterion = this.criteria.find((c) => c.id === r.id)
      return criterion?.priority === 'required'
    })

    return {
      allRequiredPass: requiredResults.every((r) => r.passed),
      results,
    }
  }

  /**
   * getSummary — 获取人类可读的验收摘要。
   */
  getSummary(result: AcceptanceGateResult): string {
    const lines = [
      `验收检查: ${result.results.filter((r) => r.passed).length}/${result.results.length} 通过`,
      '',
    ]

    for (const r of result.results) {
      const status = r.passed ? '✅' : '❌'
      lines.push(`  ${status} ${r.id}: ${r.description}`)
    }

    if (!result.allRequiredPass) {
      lines.push('')
      lines.push('⚠️ 存在未通过的必需验收标准，无法完成任务。')
    }

    return lines.join('\n')
  }
}