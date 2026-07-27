const TERMINAL = ["done", "crashed", "aborted_by_user"];
export class QueryStateMachine {
    currentState = "idle";
    stateHistory = [];
    transitions = new Map();
    listeners = new Set();
    guards = new Map();
    constructor() {
        this.setupTransitions();
        this.setupGuards();
    }
    setupTransitions() {
        this.transitions.set("idle", ["responding", "aborted_by_user"]);
        this.transitions.set("responding", ["needs_user", "should_continue", "crashed", "aborted_by_user", "done"]);
        this.transitions.set("needs_user", ["responding", "aborted_by_user", "done"]);
        this.transitions.set("should_continue", ["responding", "done", "aborted_by_user"]);
        this.transitions.set("done", []);
        this.transitions.set("crashed", []);
        this.transitions.set("aborted_by_user", []);
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
        this.guards.set("should_continue:responding", async (ctx) => {
            const c = ctx;
            return !!c && !!c.budgetCheck && !c.budgetCheck.shouldReject;
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
}
//# sourceMappingURL=stateMachine.js.map