/**
 * engine/harnessAdapter.ts — Harness 模型适配层（吸收自 open-interpreter harness 系统）
 *
 * 将不同 provider 的 API 形状标准化为统一的 harness 接口，
 * 使得同一套 agent 逻辑可以适配任意模型。
 *
 * 来源项目：Open Interpreter codex-rs (Rust) 的 harness routing 系统
 * 对应文件：core/src/harness/routing.rs, claude_code.rs, deepseek_tui.rs 等
 *
 * 设计原则：
 * - 不改变现有 requestBuilder.ts / responseHandler.ts 的接口
 * - 通过可选的 harness 配置接入，不传入则行为不变
 * - 每个 adapter 只处理该 provider 特有的格式转换
 */

import type { APIRequest } from "./requestBuilder.ts"
import type { APIEvent, ProcessedResponse, ToolCall } from "./responseHandler.ts"

// ============ 类型定义 ============

/**
 * Harness 能力声明（对齐 open-interpreter ProviderCapabilities）
 */
export interface HarnessCapabilities {
  /** 支持 namespace tools（如 OpenAI 的 function calling namespace） */
  namespaceTools?: boolean
  /** 支持图片生成 */
  imageGeneration?: boolean
  /** 支持 web search */
  webSearch?: boolean
  /** 支持 reasoning/thinking 扩展 */
  reasoning?: boolean
  /** 支持 attachments */
  attachments?: boolean
}

/**
 * Harness 适配器接口
 *
 * 每个 provider 实现两个方法：
 * - adaptRequest：将标准 APIRequest 转换为 provider 特有的请求格式
 * - adaptResponse：将 provider 的原始响应转换为标准 ProcessedResponse
 */
export interface HarnessAdapter {
  /** Provider 标识 */
  provider: string
  /** 能力声明 */
  capabilities: HarnessCapabilities

  /**
   * adaptRequest — 将标准请求转换为 provider 特有格式。
   * 默认实现：直接透传（适用于 OpenAI 兼容的 provider）。
   */
  adaptRequest(request: APIRequest): APIRequest

  /**
   * adaptResponse — 将 provider 的流式事件转换为标准 ProcessedResponse。
   * 默认实现：透传（由外部 stream processor 处理）。
   */
  adaptResponse(events: APIEvent[]): ProcessedResponse
}

/**
 * Harness 路由配置
 */
export interface HarnessConfig {
  /** 当前 provider */
  provider: APIRequest["provider"]
  /** 模型 ID（用于精细化路由） */
  model: string
  /** 可选的 adapter 实例（不提供则使用默认适配器） */
  adapter?: HarnessAdapter
}

// ============ 内置适配器 ============

/**
 * Anthropic Harness Adapter
 *
 * 处理 Anthropic 特有的消息格式：
 * - system 字段独立于 messages
 * - tool_result 消息使用 tool_use_id 而非 tool_call_id
 * - tool_use block 格式为 { type: "tool_use", id, name, input }
 */
export class AnthropicHarnessAdapter implements HarnessAdapter {
  provider = "anthropic"
  capabilities: HarnessCapabilities = {
    reasoning: true,
    attachments: true,
  }

  adaptRequest(request: APIRequest): APIRequest {
    // Anthropic 格式：system 独立，messages 中 tool_result 用 tool_use_id
    const messages = request.messages.map((msg) => {
      if (msg.role === "tool") {
        // OpenAI tool → Anthropic tool_result
        return {
          ...msg,
          role: "user" as const,
          content: [
            {
              type: "tool_result" as const,
              tool_use_id: (msg as { tool_call_id?: string }).tool_call_id ?? "",
              content: msg.content,
            },
          ],
        }
      }
      return msg
    })

    return {
      ...request,
      messages,
      // Anthropic 需要独立的 system 字段（如果 requestBuilder 已经分离则保留）
      system: request.system ?? request.messages.find((m) => m.role === "system")?.content as string | undefined,
    }
  }

  adaptResponse(events: APIEvent[]): ProcessedResponse {
    // Anthropic 响应格式：content_block_delta 包含 text 或 tool_use
    // 默认透传，由外部 StreamProcessor 处理
    return {
      content: null,
      toolCalls: [],
      stopReason: "end_turn",
      model: "",
      usage: { inputTokens: 0, outputTokens: 0 },
      needsUserInput: false,
    }
  }
}

/**
 * OpenAI Compatible Harness Adapter（默认）
 *
 * 适用于 OpenAI、Groq、OpenRouter、Local、xAI 等兼容 OpenAI API 格式的 provider。
 * 请求/响应格式与标准 APIRequest 一致，无需转换。
 */
export class OpenAICompatibleHarnessAdapter implements HarnessAdapter {
  provider = "openai"
  capabilities: HarnessCapabilities = {
    namespaceTools: true,
    imageGeneration: true,
    webSearch: true,
  }

  adaptRequest(request: APIRequest): APIRequest {
    // 透传，不做任何转换
    return request
  }

  adaptResponse(events: APIEvent[]): ProcessedResponse {
    // 透传
    return {
      content: null,
      toolCalls: [],
      stopReason: "end_turn",
      model: "",
      usage: { inputTokens: 0, outputTokens: 0 },
      needsUserInput: false,
    }
  }
}

/**
 * Google Gemini Harness Adapter（占位）
 *
 * Google Generative AI API 格式差异：
 * - contents 替代 messages，parts 替代 content
 * - functionDeclarations 替代 tools
 * - safetySettings 和 generationConfig 独立字段
 *
 * TODO：完整实现需要对接 Google API 格式
 */
export class GoogleHarnessAdapter implements HarnessAdapter {
  provider = "google"
  capabilities: HarnessCapabilities = {
    reasoning: true,
    attachments: true,
  }

  adaptRequest(request: APIRequest): APIRequest {
    // TODO: 将 OpenAI 格式转换为 Gemini 格式
    // - messages → contents [{ role, parts: [{ text }] }]
    // - tools → functionDeclarations
    // - system → systemInstruction
    return request
  }

  adaptResponse(events: APIEvent[]): ProcessedResponse {
    // TODO: 将 Gemini 响应转换为标准 ProcessedResponse
    return {
      content: null,
      toolCalls: [],
      stopReason: "end_turn",
      model: "",
      usage: { inputTokens: 0, outputTokens: 0 },
      needsUserInput: false,
    }
  }
}

/**
 * Azure OpenAI Harness Adapter（占位）
 *
 * Azure OpenAI 与 OpenAI 格式基本一致，差异在于：
 * - 需要在 extra 中传递 deployment 字段
 * - API 版本通过 URL 参数传递（在 HTTP 层处理）
 *
 * TODO：确认是否需要特殊处理
 */
export class AzureHarnessAdapter implements HarnessAdapter {
  provider = "azure"
  capabilities: HarnessCapabilities = {
    namespaceTools: true,
  }

  adaptRequest(request: APIRequest): APIRequest {
    // Azure 使用 deployment 字段替代 model
    return {
      ...request,
      extra: {
        ...request.extra,
        deployment: request.model,
      },
    }
  }

  adaptResponse(events: APIEvent[]): ProcessedResponse {
    return {
      content: null,
      toolCalls: [],
      stopReason: "end_turn",
      model: "",
      usage: { inputTokens: 0, outputTokens: 0 },
      needsUserInput: false,
    }
  }
}

/**
 * AWS Bedrock Harness Adapter（占位）
 *
 * Bedrock 格式差异：
 * - system 独立字段
 * - messages 格式类似但 tool_use 结构不同
 * - inferenceConfig 独立字段
 *
 * TODO：完整实现需要对接 Bedrock 格式
 */
export class BedrockHarnessAdapter implements HarnessAdapter {
  provider = "bedrock"
  capabilities: HarnessCapabilities = {
    reasoning: true,
    attachments: true,
  }

  adaptRequest(request: APIRequest): APIRequest {
    // TODO: 转换为 Bedrock 格式
    return request
  }

  adaptResponse(events: APIEvent[]): ProcessedResponse {
    return {
      content: null,
      toolCalls: [],
      stopReason: "end_turn",
      model: "",
      usage: { inputTokens: 0, outputTokens: 0 },
      needsUserInput: false,
    }
  }
}

// ============ Harness 路由器 ============

/**
 * HarnessRouter — 根据 provider/model 选择适配器（对齐 open-interpreter routing）
 *
 * 路由规则：
 * - anthropic → AnthropicHarnessAdapter
 * - google → GoogleHarnessAdapter
 * - azure → AzureHarnessAdapter
 * - bedrock → BedrockHarnessAdapter
 * - openai/groq/openrouter/local/xai/copilot → OpenAICompatibleHarnessAdapter
 */
export class HarnessRouter {
  private adapters = new Map<string, HarnessAdapter>([
    ["anthropic", new AnthropicHarnessAdapter()],
    ["openai", new OpenAICompatibleHarnessAdapter()],
    ["groq", new OpenAICompatibleHarnessAdapter()],
    ["openrouter", new OpenAICompatibleHarnessAdapter()],
    ["local", new OpenAICompatibleHarnessAdapter()],
    ["xai", new OpenAICompatibleHarnessAdapter()],
    ["copilot", new OpenAICompatibleHarnessAdapter()],
    ["google", new GoogleHarnessAdapter()],
    ["azure", new AzureHarnessAdapter()],
    ["bedrock", new BedrockHarnessAdapter()],
    ["vertexai", new GoogleHarnessAdapter()], // Vertex AI 使用 Gemini 格式
  ])

  /**
   * getAdapter — 根据 provider 获取适配器。
   * 如果提供了自定义 adapter，优先使用。
   */
  getAdapter(config: HarnessConfig): HarnessAdapter {
    if (config.adapter) return config.adapter
    const adapter = this.adapters.get(config.provider)
    if (!adapter) {
      // 未知 provider 回退到 OpenAI 兼容格式
      return new OpenAICompatibleHarnessAdapter()
    }
    return adapter
  }

  /**
   * register — 注册自定义适配器（供插件/技能扩展）
   */
  register(adapter: HarnessAdapter): void {
    this.adapters.set(adapter.provider, adapter)
  }

  /**
   * listProviders — 列出所有已注册的 provider
   */
  listProviders(): string[] {
    return Array.from(this.adapters.keys())
  }
}

/** 全局 Harness 路由器实例 */
export const harnessRouter = new HarnessRouter()
