/**
 * engine/requestBuilder.ts — 请求构建器（文档 02 §4.3）
 *
 * 组装系统提示词、规范化消息、工具定义、模型参数，输出 Anthropic/OpenAI 请求。
 */
import { MessageNormalizer, type InternalMessage } from "./messageNormalizer.ts";
import { HarnessRouter, type HarnessConfig, type HarnessAdapter } from "./harnessAdapter.ts";

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
  provider?: "anthropic" | "openai" | "google" | "azure" | "bedrock" | "vertexai" | "copilot" | "groq" | "openrouter" | "local" | "xai";
  temperature?: number;
  stream?: boolean;
  /** 预测性 AI 助手：当前文件的静态分析建议 */
  preAnalysis?: Array<{ type: string; message: string; line?: number }>;
  /** Harness 适配配置（吸收自 open-interpreter harness 系统） */
  harness?: HarnessConfig
  /** 模型标识符（吸收自 Reasonix prefix-cache）：用于路由和缓存键的稳定 ID，区别于 display model 名称 */
  modelId?: string
}

export interface APIRequest {
  provider: "anthropic" | "openai" | "google" | "azure" | "bedrock" | "vertexai" | "copilot" | "groq" | "openrouter" | "local" | "xai";
  /** 系统提示词（string 或带 cache_control 的对象数组，吸收自 Reasonix prefix-cache） */
  system?: string | Array<{ type: 'text'; text: string; cache_control?: { type: string } }>;
  messages: { role: string; content: unknown }[];
  tools?: unknown;
  model: string;
  max_tokens: number;
  temperature: number;
  stream: boolean;
  /**
   * Provider-specific extra fields (e.g. reasoning params for Google, deployment for Azure).
   * 对齐 OpenCode (Go) 的 Model.Provider 字段。
   */
  extra?: Record<string, unknown>;
}

/**
 * 模型元信息，对齐 OpenCode (Go) 的 models.Model 结构。
 * 用于成本追踪、上下文窗口管理、provider 自动识别。
 */
export interface ModelConfig {
  id: string;
  name: string;
  provider: APIRequest["provider"];
  contextWindow: number;
  defaultMaxTokens: number;
  supportsReasoning?: boolean;
  supportsAttachments?: boolean;
  /** USD per 1M input tokens, 0 if unknown */
  costPer1MIn?: number;
  /** USD per 1M output tokens, 0 if unknown */
  costPer1MOut?: number;
}

export class RequestBuilder {
  private normalizer = new MessageNormalizer();
  /** Harness 路由器（吸收自 open-interpreter harness 系统） */
  private harnessRouter = new HarnessRouter();

  async build(params: RequestParams): Promise<APIRequest> {
    const provider = params.provider ?? "openai";
    const messages = this.normalizer.normalize(
      params.messages.map((m) => ({ ...m, role: m.role === "tool" ? "tool" : m.role })),
      provider,
    );

    // Phase 2: 注入 preAnalysis 建议到 system prompt
    let systemPrompt = params.system
    if (params.preAnalysis && params.preAnalysis.length > 0) {
      const suggestions = params.preAnalysis.map(s => `[${s.type}] L${s.line ?? '?'}: ${s.message}`).join('\n')
      systemPrompt = `${params.system}\n\n[预测性建议]\n${suggestions}\n`
    }

    const modelParams = {
      model: params.model,
      max_tokens: params.maxTokens,
      temperature: params.temperature ?? 0,
      stream: params.stream ?? true,
    };

    // 构建基础请求
    let request: APIRequest
    if (provider === "anthropic") {
      // Prefix-cache 稳定性（吸收自 Reasonix）：在 system prompt 末尾添加 cache_control 断点
      // 确保 system prompt 的前缀被缓存，减少重复 token 成本
      const systemWithCacheControl = systemPrompt.length > 100
        ? [
            { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
          ]
        : systemPrompt

      request = {
        provider,
        system: systemWithCacheControl,
        messages,
        tools: params.tools,
        ...modelParams,
      };
    } else {
      request = {
        provider,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        tools: this.convertToolsForOpenAI(params.tools),
        ...modelParams,
      };
    }

    // Harness 适配：通过 provider-specific adapter 转换请求格式（吸收自 open-interpreter）
    if (params.harness) {
      const adapter = this.harnessRouter.getAdapter(params.harness)
      request = adapter.adaptRequest(request)
    }

    return request
  }

  private convertToolsForOpenAI(tools: ToolDefinition[]): unknown {
    return tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.input_schema },
    }));
  }
}