const TERMINAL = ["done", "crashed", "aborted_by_user"];
export class QueryStateMachine {
    constructor() {
        this.currentState = "idle";
        this.stateHistory = [];
        this.transitions = new Map();
        this.listeners = new Set();
        this.guards = new Map();
        this.setupTransitions();
        this.setupGuards();
    }
    setupTransitions() {
        this.transitions.set("idle", ["responding", "aborted_by_user"]);
        this.transitions.set("responding", ["needs_user", "should_continue", "crashed", "aborted_by_user", "done", "paused"]);
        this.transitions.set("needs_user", ["responding", "aborted_by_user", "done"]);
        this.transitions.set("should_continue", ["responding", "done", "aborted_by_user", "crashed"]);
        this.transitions.set("done", ["responding", "aborted_by_user"]);
        this.transitions.set("crashed", ["responding", "aborted_by_user"]);
        this.transitions.set("aborted_by_user", ["responding"]);
        this.transitions.set("paused", ["responding", "aborted_by_user", "done"]);
    }
    setupGuards() {
        this.guards.set("idle:responding", async (ctx) => {
            const c = ctx;
            return !!c && !!c.message && c.message.trim().length > 0;
        });
        this.guards.set("responding:needs_user", async (ctx) => {
            const c = ctx;
            return !!c && !!c.authorizationRequest;
        });
        this.guards.set("should_continue:responding", async () => {
            return true;
        });
    }
    canTransition(from, to) {
        const allowed = this.transitions.get(from);
        if (!allowed)
            return false;
        return allowed.includes(to);
    }
    async transition(to, context) {
        if (!this.canTransition(this.currentState, to)) {
            throw new Error(`Invalid state transition: ${this.currentState} → ${to}. ` +
                `Allowed: ${(this.transitions.get(this.currentState) ?? []).join(", ")}`);
        }
        const guard = this.guards.get(`${this.currentState}:${to}`);
        if (guard && !(await guard(context))) {
            throw new Error(`Guard rejected transition: ${this.currentState} → ${to}`);
        }
        const from = this.currentState;
        this.stateHistory.push(from);
        this.currentState = to;
        const evt = { from, to, context, timestamp: new Date() };
        for (const l of this.listeners) {
            try {
                await l(evt);
            }
            catch (e) {
                console.error("State change listener error:", e);
            }
        }
    }
    get state() {
        return this.currentState;
    }
    get history() {
        return [...this.stateHistory];
    }
    isTerminal() {
        return TERMINAL.includes(this.currentState);
    }
    /** Human-in-the-loop: 暂停执行，等待用户干预（吸收自 CrewAI Human-in-the-loop） */
    async pause(context) {
        await this.transition("paused", context);
    }
    /** Human-in-the-loop: 从暂停恢复执行 */
    async resume() {
        await this.transition("responding");
    }
    isPaused() {
        return this.currentState === "paused";
    }
    canContinue() {
        return !this.isTerminal();
    }
    onStateChange(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    reset() {
        this.currentState = "idle";
        this.stateHistory = [];
    }
    /** Checkpoint 持久化（吸收自 oh-my-pi Checkpoint）：序列化当前状态用于恢复 */
    takeSnapshot() {
        return {
            state: this.currentState,
            history: [...this.stateHistory],
            timestamp: Date.now(),
        };
    }
    /** 从快照恢复状态 */
    restoreSnapshot(snapshot) {
        this.currentState = snapshot.state;
        this.stateHistory = [...snapshot.history];
    }
}
export class AcceptanceGate {
    constructor() {
        this.criteria = [];
        this.listeners = new Set();
    }
    add(criterion) {
        this.criteria.push(criterion);
    }
    addMany(criteria) {
        this.criteria.push(...criteria);
    }
    clear() {
        this.criteria = [];
    }
    get count() {
        return this.criteria.length;
    }
    /** 注册监听器：每次 check() 完成后通知（吸收自 intent-driven-development 事件驱动） */
    onChange(listener) {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }
    /**
     * check — 执行所有验收标准的验证。
     * 返回详细结果，allRequiredPass 为 true 时方可进入 done 状态。
     */
    async check() {
        const results = await Promise.all(this.criteria.map(async (c) => ({
            id: c.id,
            passed: await c.verify(),
            description: c.description,
        })));
        const requiredResults = results.filter((r) => {
            const criterion = this.criteria.find((c) => c.id === r.id);
            return criterion?.priority === 'required';
        });
        const result = {
            allRequiredPass: requiredResults.every((r) => r.passed),
            results,
        };
        // 通知所有监听器（吸收自 intent-driven-development 事件驱动）
        for (const listener of this.listeners) {
            try {
                listener(result);
            }
            catch { /* noop */ }
        }
        return result;
    }
    /**
     * getSummary — 获取人类可读的验收摘要。
     */
    getSummary(result) {
        const lines = [
            `验收检查: ${result.results.filter((r) => r.passed).length}/${result.results.length} 通过`,
            '',
        ];
        for (const r of result.results) {
            const status = r.passed ? '✅' : '❌';
            lines.push(`  ${status} ${r.id}: ${r.description}`);
        }
        if (!result.allRequiredPass) {
            lines.push('');
            lines.push('⚠️ 存在未通过的必需验收标准，无法完成任务。');
        }
        return lines.join('\n');
    }
}
