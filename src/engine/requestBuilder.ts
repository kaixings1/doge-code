/**
 * engine/requestBuilder.ts — 请求构建器（文档 02 §4.3）
 *
 * 组装系统提示词、规范化消息、工具定义、模型参数，输出 Anthropic/OpenAI 请求。
 */
import { MessageNormalizer, type InternalMessage } from "./messageNormalizer.ts";

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface RequestParams {
  messages: InternalMessage[];
  system: string;
  tools: ToolDefinition[];
  model: string;
  maxTokens: number;
  provider?: "anthropic" | "openai";
  temperature?: number;
  stream?: boolean;
}

export interface APIRequest {
  provider: "anthropic" | "openai";
  system?: string;
  messages: { role: string; content: unknown }[];
  tools?: unknown;
  model: string;
  max_tokens: number;
  temperature: number;
  stream: boolean;
}

export class RequestBuilder {
  private normalizer = new MessageNormalizer();

  async build(params: RequestParams): Promise<APIRequest> {
    const provider = params.provider ?? "openai";
    const messages = this.normalizer.normalize(
      params.messages.map((m) => ({ ...m, role: m.role === "tool" ? "tool" : m.role })),
      provider,
    );
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

  private convertToolsForOpenAI(tools: ToolDefinition[]): unknown {
    return tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.input_schema },
    }));
  }
}