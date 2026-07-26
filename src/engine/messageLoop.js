import { ErrorClassifier } from "./errors/classifier.ts";
export class MessageLoop {
    deps;
    maxIterations = 100;
    currentIteration = 0;
    constructor(deps) {
        this.deps = deps;
    }
    async run(userMessage) {
        this.deps.conversation.messages.push({ role: "user", content: userMessage });
        await this.deps.stateMachine.transition("responding", { message: userMessage });
        const start = Date.now();
        while (this.deps.stateMachine.canContinue()) {
            this.currentIteration++;
            if (this.currentIteration > this.maxIterations) {
                await this.deps.stateMachine.transition("crashed", { reason: "超过最大迭代次数" });
                break;
            }
            try {
                const shouldContinue = await this.runIteration();
                if (!shouldContinue) {
                    await this.deps.stateMachine.transition("done");
                    break;
                }
                if (this.deps.stateMachine.state === "should_continue") {
                    await this.deps.stateMachine.transition("responding");
                }
            }
            catch (error) {
                if (this.deps.stateMachine.isTerminal())
                    break;
                await this.deps.stateMachine.transition("crashed", { error: ErrorClassifier.classify(error) });
                break;
            }
        }
        return {
            state: this.deps.stateMachine.state,
            messages: this.deps.conversation.messages,
            iterations: this.currentIteration,
            tokenUsage: this.deps.tokenBudget.getUsage(),
            duration: Date.now() - start,
        };
    }
    async runIteration() {
        const budget = this.deps.tokenBudget.checkBudget(this.deps.conversation.messages);
        if (budget.shouldReject)
            throw new Error(`Token limit exceeded: ${budget.percentage * 100}%`);
        if (budget.shouldCompact) {
            // 占位：触发自动压缩 conversation
        }
        const request = await this.deps.requestBuilder.build({
            messages: this.deps.conversation.messages,
            system: this.deps.systemPrompt,
            tools: [],
            model: this.deps.model,
            maxTokens: this.deps.maxOutputTokens,
        });
        const stream = await this.deps.apiClient.sendMessage(request);
        const processed = await this.deps.responseHandler.handle(stream);
        if (processed.toolCalls.length > 0) {
            const results = await this.deps.toolScheduler.execute(processed.toolCalls);
            this.deps.conversation.addToolResults(results);
            await this.deps.stateMachine.transition("should_continue");
            return true;
        }
        if (processed.needsUserInput) {
            await this.deps.stateMachine.transition("needs_user", { prompt: processed.content });
            return true;
        }
        if (processed.stopReason === "end_turn")
            return false;
        if (processed.stopReason === "max_tokens") {
            await this.deps.stateMachine.transition("should_continue");
            return true;
        }
        return false;
    }
}
