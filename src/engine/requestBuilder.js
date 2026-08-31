/**
 * engine/requestBuilder.ts — 请求构建器（文档 02 §4.3）
 *
 * 组装系统提示词、规范化消息、工具定义、模型参数，输出 Anthropic/OpenAI 请求。
 */
import { MessageNormalizer } from "./messageNormalizer.ts";
import { HarnessRouter } from "./harnessAdapter.ts";
export class RequestBuilder {
    constructor() {
        this.normalizer = new MessageNormalizer();
        /** Harness 路由器（吸收自 open-interpreter harness 系统） */
        this.harnessRouter = new HarnessRouter();
    }
    async build(params) {
        const provider = params.provider ?? "openai";
        const messages = this.normalizer.normalize(params.messages.map((m) => ({ ...m, role: m.role === "tool" ? "tool" : m.role })), provider);
        // Phase 2: 注入 preAnalysis 建议到 system prompt
        let systemPrompt = params.system;
        if (params.preAnalysis && params.preAnalysis.length > 0) {
            const suggestions = params.preAnalysis.map(s => `[${s.type}] L${s.line ?? '?'}: ${s.message}`).join('\n');
            systemPrompt = `${params.system}\n\n[预测性建议]\n${suggestions}\n`;
        }
        const modelParams = {
            model: params.model,
            max_tokens: params.maxTokens,
            temperature: params.temperature ?? 0,
            stream: params.stream ?? true,
        };
        // 构建基础请求
        let request;
        if (provider === "anthropic") {
            // Prefix-cache 稳定性（吸收自 Reasonix）：在 system prompt 末尾添加 cache_control 断点
            // 确保 system prompt 的前缀被缓存，减少重复 token 成本
            const systemWithCacheControl = systemPrompt.length > 100
                ? [
                    { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
                ]
                : systemPrompt;
            request = {
                provider,
                system: systemWithCacheControl,
                messages,
                tools: params.tools,
                ...modelParams,
            };
        }
        else {
            request = {
                provider,
                messages: [{ role: "system", content: systemPrompt }, ...messages],
                tools: this.convertToolsForOpenAI(params.tools),
                ...modelParams,
            };
        }
        // Harness 适配：通过 provider-specific adapter 转换请求格式（吸收自 open-interpreter）
        if (params.harness) {
            const adapter = this.harnessRouter.getAdapter(params.harness);
            request = adapter.adaptRequest(request);
        }
        return request;
    }
    convertToolsForOpenAI(tools) {
        return tools.map((t) => ({
            type: "function",
            function: { name: t.name, description: t.description, parameters: t.input_schema },
        }));
    }
}
