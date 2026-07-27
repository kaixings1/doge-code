/**
 * engine/requestBuilder.ts — 请求构建器（文档 02 §4.3）
 *
 * 组装系统提示词、规范化消息、工具定义、模型参数，输出 Anthropic/OpenAI 请求。
 */
import { MessageNormalizer } from "./messageNormalizer.ts";
export class RequestBuilder {
    normalizer = new MessageNormalizer();
    async build(params) {
        const provider = params.provider ?? "anthropic";
        const messages = this.normalizer.normalize(params.messages.map((m) => ({ ...m, role: m.role === "tool" ? "tool" : m.role })), provider);
        const modelParams = {
            model: params.model,
            max_tokens: params.maxTokens,
            temperature: params.temperature ?? 0,
            stream: params.stream ?? true,
        };
        if (provider === "anthropic") {
            return {
                provider,
                system: params.system,
                messages,
                tools: params.tools,
                ...modelParams,
            };
        }
        return {
            provider,
            messages: [{ role: "system", content: params.system }, ...messages],
            tools: this.convertToolsForOpenAI(params.tools),
            ...modelParams,
        };
    }
    convertToolsForOpenAI(tools) {
        return tools.map((t) => ({
            type: "function",
            function: { name: t.name, description: t.description, parameters: t.input_schema },
        }));
    }
}
//# sourceMappingURL=requestBuilder.js.map