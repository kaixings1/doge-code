  03 - API 与 Bridge 层（约 40000 字）


  目录


  1. API 层架构
  2. Anthropic API 客户端
  3. OpenAI 兼容 API 客户端
  4. Bridge 协议转换
  5. 流式传输实现
  6. 错误处理与重试
  7. 会话管理
  8. 认证与授权
  9. 完整实现代码

  ---
  1. API 层架构


  1.1 API 层定位


  API 层是 Doge Code 与外部 AI Provider 通信的桥梁，负责：

  - 请求发送：构建并发送 API 请求
  - 响应接收：接收并解析 API 响应（支持流式）
  - 协议转换：OpenAI ↔ Anthropic 协议双向转换
  - 错误处理：统一的错误分类与重试机制
  - 会话管理：会话状态持久化与恢复

  1.2 整体架构


  ┌─────────────────────────────────────────────────────────────┐
  │                     QueryEngine                              │
  │                                                              │
  │  sendMessage(request) → AsyncIterable<APIEvent>            │
  └──────────────────────────┬──────────────────────────────────┘
                             ↓
  ┌─────────────────────────────────────────────────────────────┐
  │                     API Bootstrap                            │
  │                                                              │
  │  根据 provider 配置选择客户端                                │
  │  ├─ provider=anthropic → ClaudeAPIClient                   │
  │  └─ provider=openai → OpenAICompatClient                   │
  └──────────────────────────┬──────────────────────────────────┘
                             ↓
           ┌─────────────────┴─────────────────┐
           ↓                                   ↓
  ┌─────────────────────┐           ┌─────────────────────┐
  │  ClaudeAPIClient    │           │  OpenAICompatClient │
  │  (Anthropic SDK)    │           │  (OpenAI SDK)      │
  │                     │           │                     │
  │  - 原生 Anthropic   │           │  - OpenAI 格式     │
  │    Messages API     │           │  - 通过 Bridge 转换 │
  │  - SSE 流式传输     │           │  - SSE/WebSocket   │
  └─────────────────────┘           └─────────────────────┘
           │                                   │
           └─────────────────┬─────────────────┘
                             ↓
  ┌─────────────────────────────────────────────────────────────┐
  │                     Bridge Layer                             │
  │                                                              │
  │  ├─ Protocol Conversion                                      │
  │  │   ├─ OpenAI → Anthropic (Request)                       │
  │  │   └─ Anthropic → OpenAI (Response)                      │
  │  ├─ Stream Adaptation                                        │
  │  │   ├─ SSE Handler                                        │
  │  │   └─ WebSocket Handler                                  │
  │  └─ Session Management                                       │
  │      ├─ Session Creation                                    │
  │      ├─ Session Persistence                                 │
  │      └─ Session Recovery                                    │
  └─────────────────────────────────────────────────────────────┘

  1.3 设计原则


  1.3.1 Provider 抽象


  所有 Provider 实现统一接口：

  /**
   * API 客户端接口
   */
  export interface IAPIClient {
    /**
     * 发送消息（流式）
     */
    sendMessage(request: APIRequest): Promise<AsyncIterable<APIEvent>>;

    /**
     * 测试连接
     */
    testConnection(): Promise<boolean>;

    /**
     * 中止请求
     */
    abort(): void;

    /**
     * 获取客户端信息
     */
    getInfo(): ClientInfo;
  }

  /**
   * 客户端信息
   */
  export interface ClientInfo {
    provider: string;
    model: string;
    baseUrl: string;
    version: string;
  }

  1.3.2 错误统一


  所有 Provider 错误转换为系统错误：

  /**
   * 错误映射
   */
  const errorMap = {
    // Anthropic 错误
    'authentication_error': ErrorType.AUTH_ERROR,
    'permission_error': ErrorType.PERMISSION_DENIED,
    'not_found_error': ErrorType.MODEL_NOT_FOUND,
    'rate_limit_error': ErrorType.RATE_LIMIT,
    'api_error': ErrorType.API_ERROR,
    'overloaded_error': ErrorType.SERVER_ERROR,

    // OpenAI 错误
    'invalid_api_key': ErrorType.AUTH_ERROR,
    'insufficient_quota': ErrorType.RATE_LIMIT,
    'model_not_found': ErrorType.MODEL_NOT_FOUND,
    'context_length_exceeded': ErrorType.PROMPT_TOO_LONG,
    'rate_limit_exceeded': ErrorType.RATE_LIMIT,
  };

  1.3.3 流式优先


  所有 API 通信采用流式传输：

  - 低延迟：用户可实时看到输出
  - 可中止：随时可以中断请求
  - Token 统计：实时统计 Token 使用

  ---
  2. Anthropic API 客户端


  2.1 客户端架构


  /**
   * Claude API 客户端
   * 文件：src/services/api/claude.ts
   */

  import Anthropic from '@anthropic-ai/sdk';
  import type {
    AnthropicError,
    Message,
    MessageStreamEvent,
  } from '@anthropic-ai/sdk/resources/messages';
  import {
    IAPIClient,
    APIRequest,
    APIEvent,
    ClientInfo,
    ErrorClassifier,
    DogeCodeError,
    ErrorType,
  } from '../../types/index.js';

  /**
   * Claude API 客户端配置
   */
  export interface ClaudeClientConfig {
    apiKey: string;
    baseUrl?: string;
    model: string;
    maxRetries?: number;
    timeout?: number;
    defaultHeaders?: Record<string, string>;
  }

  /**
   * Claude API 客户端实现
   */
  export class ClaudeAPIClient implements IAPIClient {
    private client: Anthropic;
    private config: Required<ClaudeClientConfig>;
    private abortController: AbortController | null = null;
    private currentStream: AsyncIterable<MessageStreamEvent> | null = null;

    constructor(config: ClaudeClientConfig) {
      this.config = {
        apiKey: config.apiKey,
        baseUrl: config.baseUrl || 'https://api.anthropic.com',
        model: config.model,
        maxRetries: config.maxRetries || 3,
        timeout: config.timeout || 600000,
        defaultHeaders: config.defaultHeaders || {},
      };

      // 初始化 SDK
      this.client = new Anthropic({
        apiKey: this.config.apiKey,
        baseURL: this.config.baseUrl,
        maxRetries: this.config.maxRetries,
        timeout: this.config.timeout,
        defaultHeaders: {
          'anthropic-version': '2023-06-01',
          ...this.config.defaultHeaders,
        },
      });
    }

    /**
     * 发送消息（流式）
     */
    async sendMessage(request: APIRequest): Promise<AsyncIterable<APIEvent>> {
      if (request.provider !== 'anthropic') {
        throw new Error('Invalid request provider for ClaudeAPIClient');
      }

      this.abortController = new AbortController();

      try {
        // 发送流式请求
        const stream = await this.client.messages.stream(
          {
            model: request.model,
            max_tokens: request.max_tokens,
            system: request.system,
            messages: request.messages,
            tools: request.tools,
            stream: true,
          },
          {
            signal: this.abortController.signal,
          }
        );

        this.currentStream = stream;

        // 转换为统一事件格式
        return this.transformStream(stream);
      } catch (error) {
        throw this.handleError(error);
      }
    }

    /**
     * 转换流式事件
     */
    private async *transformStream(
      stream: AsyncIterable<MessageStreamEvent>
    ): AsyncIterable<APIEvent> {
      try {
        for await (const event of stream) {
          yield this.convertEvent(event);
        }
      } catch (error) {
        // 检查是否是中止错误
        if ((error as Error).name === 'AbortError') {
          yield { type: 'error', error: { type: 'abort', message: 'Request aborted' } };
        } else {
          throw this.handleError(error);
        }
      }
    }

    /**
     * 转换单个事件
     */
    private convertEvent(event: MessageStreamEvent): APIEvent {
      switch (event.type) {
        case 'message_start':
          return {
            type: 'message_start',
            message: event.message,
          };

        case 'content_block_start':
          return {
            type: 'content_block_start',
            content_block: event.content_block,
            index: event.index,
          };

        case 'content_block_delta':
          return {
            type: 'content_block_delta',
            delta: event.delta,
            index: event.index,
          };

        case 'content_block_stop':
          return {
            type: 'content_block_stop',
            index: event.index,
          };

        case 'message_delta':
          return {
            type: 'message_delta',
            delta: event.delta,
          };

        case 'message_stop':
          return {
            type: 'message_stop',
          };

        case 'ping':
          return {
            type: 'ping',
          };

        case 'error':
          return {
            type: 'error',
            error: event.error,
          };

        default:
          return {
            type: 'unknown',
            event,
          };
      }
    }

    /**
     * 测试连接
     */
    async testConnection(): Promise<boolean> {
      try {
        // 发送一个最小请求测试连接
        const response = await this.client.messages.create({
          model: this.config.model,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'test' }],
        });

        return true;
      } catch (error) {
        const classified = ErrorClassifier.classify(error);

        // 如果是认证错误，返回 false
        if (classified === ErrorType.AUTH_ERROR) {
          return false;
        }

        // 其他错误（如模型不存在）可能是配置问题，但连接本身是通的
        return classified !== ErrorType.NETWORK_ERROR;
      }
    }

    /**
     * 中止请求
     */
    abort(): void {
      if (this.abortController) {
        this.abortController.abort();
        this.abortController = null;
      }

      this.currentStream = null;
    }

    /**
     * 获取客户端信息
     */
    getInfo(): ClientInfo {
      return {
        provider: 'anthropic',
        model: this.config.model,
        baseUrl: this.config.baseUrl,
        version: '2023-06-01',
      };
    }

    /**
     * 处理错误
     */
    private handleError(error: unknown): DogeCodeError {
      if (error instanceof DogeCodeError) {
        return error;
      }

      // Anthropic SDK 错误处理
      if (error && typeof error === 'object' && 'error' in error) {
        const anthropicError = error as AnthropicError;
        const errorType = anthropicError.error?.type || 'api_error';
        const message = anthropicError.error?.message || anthropicError.message;

        return new DogeCodeError(
          errorMap[errorType] || ErrorType.API_ERROR,
          message,
          { originalError: anthropicError }
        );
      }

      return ErrorClassifier.wrap(error);
    }
  }

  /**
   * 错误映射表
   */
  const errorMap: Record<string, ErrorType> = {
    'authentication_error': ErrorType.AUTH_ERROR,
    'permission_error': ErrorType.PERMISSION_DENIED,
    'not_found_error': ErrorType.MODEL_NOT_FOUND,
    'rate_limit_error': ErrorType.RATE_LIMIT,
    'api_error': ErrorType.API_ERROR,
    'overloaded_error': ErrorType.SERVER_ERROR,
    'invalid_request_error': ErrorType.INVALID_REQUEST,
  };

  2.2 使用示例


  import { ClaudeAPIClient } from './services/api/claude.js';

  // 创建客户端
  const client = new ClaudeAPIClient({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    model: 'claude-3-5-sonnet-20241022',
  });

  // 发送消息
  const stream = await client.sendMessage({
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 4096,
    messages: [
      { role: 'user', content: 'Hello, Claude!' }
    ],
    stream: true,
  });

  // 处理流式响应
  for await (const event of stream) {
    if (event.type === 'content_block_delta') {
      if (event.delta.type === 'text_delta') {
        process.stdout.write(event.delta.text);
      }
    }

    if (event.type === 'message_stop') {
      console.log('\n[Done]');
    }
  }

  // 中止请求（如果需要）
  client.abort();

  ---
  3. OpenAI 兼容 API 客户端


  3.1 客户端架构


  /**
   * OpenAI 兼容 API 客户端
   * 文件：src/services/api/openaiCompat.ts
   */

  import OpenAI from 'openai';
  import type { Stream } from 'openai/streaming';
  import type { ChatCompletionChunk } from 'openai/resources/chat/completions';
  import {
    IAPIClient,
    APIRequest,
    APIEvent,
    ClientInfo,
    ErrorClassifier,
    DogeCodeError,
    ErrorType,
  } from '../../types/index.js';
  import { BridgeConverter } from '../../bridge/converter.js';

  /**
   * OpenAI 客户端配置
   */
  export interface OpenAIClientConfig {
    apiKey: string;
    baseUrl?: string;
    model: string;
    maxRetries?: number;
    timeout?: number;
    defaultHeaders?: Record<string, string>;
    organization?: string;
  }

  /**
   * OpenAI 兼容 API 客户端实现
   */
  export class OpenAICompatClient implements IAPIClient {
    private client: OpenAI;
    private config: Required<OpenAIClientConfig>;
    private bridge: BridgeConverter;
    private abortController: AbortController | null = null;
    private currentStream: Stream<ChatCompletionChunk> | null = null;

    constructor(config: OpenAIClientConfig) {
      this.config = {
        apiKey: config.apiKey,
        baseUrl: config.baseUrl || 'https://api.openai.com/v1',
        model: config.model,
        maxRetries: config.maxRetries || 3,
        timeout: config.timeout || 600000,
        defaultHeaders: config.defaultHeaders || {},
        organization: config.organization,
      };

      // 初始化 SDK
      this.client = new OpenAI({
        apiKey: this.config.apiKey,
        baseURL: this.config.baseUrl,
        maxRetries: this.config.maxRetries,
        timeout: this.config.timeout,
        defaultHeaders: this.config.defaultHeaders,
        organization: this.config.organization,
      });

      // 初始化 Bridge 转换器
      this.bridge = new BridgeConverter();
    }

    /**
     * 发送消息（流式）
     */
    async sendMessage(request: APIRequest): Promise<AsyncIterable<APIEvent>> {
      // 如果是 Anthropic 格式请求，先转换
      const openaiRequest = request.provider === 'anthropic'
        ? this.bridge.convertRequest(request)
        : request;

      this.abortController = new AbortController();

      try {
        // 发送流式请求
        const stream = await this.client.chat.completions.create(
          {
            model: openaiRequest.model,
            messages: openaiRequest.messages,
            max_tokens: openaiRequest.max_tokens,
            stream: true,
            ...(openaiRequest.tools && { tools: openaiRequest.tools }),
          },
          {
            signal: this.abortController.signal,
          }
        );

        this.currentStream = stream;

        // 转换为 Anthropic 事件格式
        return this.transformStream(stream);
      } catch (error) {
        throw this.handleError(error);
      }
    }

    /**
     * 转换流式事件（OpenAI → Anthropic 格式）
     */
    private async *transformStream(
      stream: Stream<ChatCompletionChunk>
    ): AsyncIterable<APIEvent> {
      let isFirst = true;
      let contentIndex = 0;
      let toolCallIndex = 0;
      const toolCallsBuffer: Map<number, any> = new Map();

      try {
        for await (const chunk of stream) {
          // 第一个 chunk 发送 message_start
          if (isFirst) {
            isFirst = false;
            yield {
              type: 'message_start',
              message: {
                id: chunk.id,
                type: 'message',
                role: 'assistant',
                content: [],
                model: chunk.model,
                stop_reason: null,
                usage: { input_tokens: 0, output_tokens: 0 },
              },
            };
          }

          // 处理 choices
          for (const choice of chunk.choices) {
            // 文本内容
            if (choice.delta?.content) {
              yield {
                type: 'content_block_delta',
                delta: {
                  type: 'text_delta',
                  text: choice.delta.content,
                },
                index: contentIndex,
              };
            }

            // 工具调用
            if (choice.delta?.tool_calls) {
              for (const toolCall of choice.delta.tool_calls) {
                const index = toolCall.index ?? toolCallIndex;

                if (!toolCallsBuffer.has(index)) {
                  toolCallsBuffer.set(index, {
                    id: toolCall.id || `tool_${index}`,
                    type: 'tool_use',
                    name: '',
                    input: '',
                  });

                  yield {
                    type: 'content_block_start',
                    content_block: toolCallsBuffer.get(index),
                    index,
                  };
                }

                const buffer = toolCallsBuffer.get(index);

                if (toolCall.function?.name) {
                  buffer.name = toolCall.function.name;
                }

                if (toolCall.function?.arguments) {
                  yield {
                    type: 'content_block_delta',
                    delta: {
                      type: 'input_json_delta',
                      partial_json: toolCall.function.arguments,
                    },
                    index,
                  };

                  buffer.input += toolCall.function.arguments;
                }

                toolCallIndex = index + 1;
              }
            }

            // finish_reason
            if (choice.finish_reason) {
              // 结束所有工具调用块
              for (const [index, buffer] of toolCallsBuffer) {
                try {
                  buffer.input = JSON.parse(buffer.input);
                } catch {
                  // 解析失败，保持字符串
                }

                yield {
                  type: 'content_block_stop',
                  index,
                };
              }

              // 发送 message_delta
              yield {
                type: 'message_delta',
                delta: {
                  stop_reason: this.convertFinishReason(choice.finish_reason),
                  usage: {
                    input_tokens: chunk.usage?.prompt_tokens || 0,
                    output_tokens: chunk.usage?.completion_tokens || 0,
                  },
                },
              };

              // 发送 message_stop
              yield {
                type: 'message_stop',
              };
            }
          }
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          yield { type: 'error', error: { type: 'abort', message: 'Request aborted' } };
        } else {
          throw this.handleError(error);
        }
      }
    }

    /**
     * 转换 finish_reason
     */
    private convertFinishReason(reason: string): string {
      const map: Record<string, string> = {
        'stop': 'end_turn',
        'length': 'max_tokens',
        'tool_calls': 'tool_use',
        'content_filter': 'end_turn',
      };

      return map[reason] || 'end_turn';
    }

    /**
     * 测试连接
     */
    async testConnection(): Promise<boolean> {
      try {
        await this.client.models.list();
        return true;
      } catch (error) {
        const classified = ErrorClassifier.classify(error);
        return classified !== ErrorType.AUTH_ERROR &&
               classified !== ErrorType.NETWORK_ERROR;
      }
    }

    /**
     * 中止请求
     */
    abort(): void {
      if (this.abortController) {
        this.abortController.abort();
        this.abortController = null;
      }

      this.currentStream = null;
    }

    /**
     * 获取客户端信息
     */
    getInfo(): ClientInfo {
      return {
        provider: 'openai',
        model: this.config.model,
        baseUrl: this.config.baseUrl,
        version: '1.0.0',
      };
    }

    /**
     * 处理错误
     */
    private handleError(error: unknown): DogeCodeError {
      if (error instanceof DogeCodeError) {
        return error;
      }

      // OpenAI SDK 错误处理
      if (error && typeof error === 'object') {
        const openaiError = error as any;

        if (openaiError.status) {
          const status = openaiError.status;
          const message = openaiError.message || 'Unknown error';

          if (status === 401) {
            return new DogeCodeError(ErrorType.AUTH_ERROR, message);
          }
          if (status === 429) {
            return new DogeCodeError(ErrorType.RATE_LIMIT, message);
          }
          if (status === 404) {
            return new DogeCodeError(ErrorType.MODEL_NOT_FOUND, message);
          }
          if (status === 400) {
            if (message.includes('context')) {
              return new DogeCodeError(ErrorType.PROMPT_TOO_LONG, message);
            }
            return new DogeCodeError(ErrorType.INVALID_REQUEST, message);
          }
          if (status >= 500) {
            return new DogeCodeError(ErrorType.SERVER_ERROR, message);
          }
        }
      }

      return ErrorClassifier.wrap(error);
    }
  }

  ---
  4. Bridge 协议转换


  4.1 Bridge 层设计


  /**
   * Bridge 协议转换器
   * 文件：src/bridge/converter.ts
   *
   * 职责：
   * - OpenAI → Anthropic 请求转换
   * - Anthropic → OpenAI 响应转换
   * - 流式事件转换
   */

  import {
    AnthropicRequest,
    OpenAIRequest,
    AnthropicMessage,
    OpenAIMessage,
    AnthropicTool,
    OpenAITool,
    AnthropicContent,
    OpenAIContent,
  } from '../types/index.js';

  /**
   * Bridge 转换器
   */
  export class BridgeConverter {
    /**
     * 转换请求（Anthropic → OpenAI）
     */
    convertRequest(anthropicRequest: AnthropicRequest): OpenAIRequest {
      return {
        provider: 'openai',
        model: this.convertModel(anthropicRequest.model),
        messages: this.convertMessages(anthropicRequest.messages, anthropicRequest.system),
        max_tokens: anthropicRequest.max_tokens,
        tools: anthropicRequest.tools?.map(t => this.convertTool(t)),
        stream: anthropicRequest.stream,
        temperature: anthropicRequest.temperature,
      };
    }

    /**
     * 转换模型名称
     */
    private convertModel(model: string): string {
      const modelMap: Record<string, string> = {
        'claude-3-5-sonnet-20241022': 'claude-3-5-sonnet',
        'claude-3-opus-20240229': 'claude-3-opus',
        'claude-3-sonnet-20240229': 'claude-3-sonnet',
        'claude-3-haiku-20240307': 'claude-3-haiku',
      };

      return modelMap[model] || model;
    }

    /**
     * 转换消息数组
     */
    private convertMessages(
      messages: AnthropicMessage[],
      system?: string
    ): OpenAIMessage[] {
      const result: OpenAIMessage[] = [];

      // 添加系统消息
      if (system) {
        result.push({
          role: 'system',
          content: system,
        });
      }

      // 转换用户/助手消息
      for (const message of messages) {
        result.push(...this.convertSingleMessage(message));
      }

      return result;
    }

    /**
     * 转换单条消息
     */
    private convertSingleMessage(message: AnthropicMessage): OpenAIMessage[] {
      const result: OpenAIMessage[] = [];

      if (message.role === 'user') {
        result.push({
          role: 'user',
          content: this.convertUserContent(message.content),
        });
      } else if (message.role === 'assistant') {
        result.push({
          role: 'assistant',
          content: this.convertAssistantContent(message.content),
        });
      }

      return result;
    }

    /**
     * 转换用户内容
     */
    private convertUserContent(content: AnthropicContent): OpenAIContent {
      if (typeof content === 'string') {
        return content;
      }

      // 多部分内容
      const parts: any[] = [];

      for (const part of content) {
        if (part.type === 'text') {
          parts.push({
            type: 'text',
            text: part.text,
          });
        } else if (part.type === 'image') {
          parts.push({
            type: 'image_url',
            image_url: {
              url: part.source?.data
                ? `data:${part.source.media_type};base64,${part.source.data}`
                : part.source?.url || '',
            },
          });
        } else if (part.type === 'tool_result') {
          // 工具结果需要特殊处理
          parts.push({
            type: 'tool_result',
            tool_use_id: part.tool_use_id,
            content: typeof part.content === 'string'
              ? part.content
              : JSON.stringify(part.content),
          });
        }
      }

      return parts;
    }

    /**
     * 转换助手内容
     */
    private convertAssistantContent(content: AnthropicContent): OpenAIContent {
      if (typeof content === 'string') {
        return content;
      }

      const textParts: string[] = [];
      const toolCalls: any[] = [];

      for (const part of content) {
        if (part.type === 'text') {
          textParts.push(part.text);
        } else if (part.type === 'tool_use') {
          toolCalls.push({
            id: part.id,
            type: 'function',
            function: {
              name: part.name,
              arguments: JSON.stringify(part.input),
            },
          });
        }
      }

      if (toolCalls.length > 0) {
        return {
          content: textParts.join(''),
          tool_calls: toolCalls,
        };
      }

      return textParts.join('');
    }

    /**
     * 转换工具定义
     */
    private convertTool(tool: AnthropicTool): OpenAITool {
      return {
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema,
        },
      };
    }

    /**
     * 反向转换响应（OpenAI → Anthropic）
     * 用于需要将 OpenAI 响应转换回 Anthropic 格式的场景
     */
    reverseConvertResponse(openaiResponse: any): any {
      // 实现反向转换
      // 通常在 Bridge 服务器模式下使用
      return {
        id: openaiResponse.id,
        type: 'message',
        role: 'assistant',
        content: this.reverseConvertContent(openaiResponse.choices[0]?.message),
        model: openaiResponse.model,
        stop_reason: this.reverseConvertStopReason(openaiResponse.choices[0]?.finish_reason),
        usage: {
          input_tokens: openaiResponse.usage?.prompt_tokens || 0,
          output_tokens: openaiResponse.usage?.completion_tokens || 0,
        },
      };
    }

    /**
     * 反向转换内容
     */
    private reverseConvertContent(message: any): any {
      if (!message) {
        return [];
      }

      const content: any[] = [];

      // 文本内容
      if (message.content) {
        content.push({
          type: 'text',
          text: message.content,
        });
      }

      // 工具调用
      if (message.tool_calls) {
        for (const tc of message.tool_calls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments),
          });
        }
      }

      return content;
    }

    /**
     * 反向转换停止原因
     */
    private reverseConvertStopReason(reason?: string): string {
      const map: Record<string, string> = {
        'stop': 'end_turn',
        'length': 'max_tokens',
        'tool_calls': 'tool_use',
      };

      return map[reason || 'stop'] || 'end_turn';
    }
  }

  ---
  请保存以上内容：

  notepad D:\doge-code\docs\03-api-bridge-part1.md

  保存后请告诉我「继续」，我将输出第 03 章第二部分（流式传输、错误处理、会话管理、完整实现代码）。
  ---
  03 - API 与 Bridge 层（第二部分）


  5. 流式传输实现


  5.1 SSE (Server-Sent Events) 流式传输


  /**
   * SSE 流式传输处理器
   * 文件：src/bridge/transport/sse.ts
   *
   * 职责：
   * - 处理 SSE 连接
   * - 解析 SSE 事件
   * - 支持重连
   * - 错误处理
   */

  /**
   * SSE 配置
   */
  export interface SSEConfig {
    url: string;
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: any;
    retryAttempts?: number;
    retryDelay?: number;
    timeout?: number;
  }

  /**
   * SSE 事件
   */
  export interface SSEMessage {
    id?: string;
    event?: string;
    data: string;
  }

  /**
   * SSE 客户端
   */
  export class SSETransport {
    private controller: AbortController | null = null;
    private reconnectAttempts: number = 0;
    private lastEventId: string | null = null;
    private config: Required<SSEConfig>;
    private buffer: string = '';

    constructor(config: SSEConfig) {
      this.config = {
        url: config.url,
        method: config.method || 'POST',
        headers: config.headers || {},
        body: config.body,
        retryAttempts: config.retryAttempts || 3,
        retryDelay: config.retryDelay || 1000,
        timeout: config.timeout || 600000,
      };
    }

    /**
     * 连接 SSE 端点
     */
    async *connect(): AsyncGenerator<SSEMessage, void, unknown> {
      this.controller = new AbortController();

      while (this.reconnectAttempts < this.config.retryAttempts) {
        try {
          const response = await this.fetch();

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          if (!response.body) {
            throw new Error('No response body');
          }

          this.reconnectAttempts = 0; // 连接成功，重置重连计数

          yield* this.parseStream(response.body);

          // 正常结束
          return;
        } catch (error) {
          this.reconnectAttempts++;

          if (this.reconnectAttempts >= this.config.retryAttempts) {
            throw error;
          }

          console.warn(
            `SSE connection failed (attempt ${this.reconnectAttempts}/${this.config.retryAttempts}):`,
            error
          );

          // 等待后重试
          await this.delay(this.config.retryDelay * this.reconnectAttempts);
        }
      }
    }

    /**
     * 发送请求
     */
    private async fetch(): Promise<Response> {
      const headers: Record<string, string> = {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
        ...this.config.headers,
      };

      // 如果有 lastEventId，添加到请求头
      if (this.lastEventId) {
        headers['Last-Event-ID'] = this.lastEventId;
      }

      const response = await fetch(this.config.url, {
        method: this.config.method,
        headers,
        body: this.config.body ? JSON.stringify(this.config.body) : undefined,
        signal: this.controller!.signal,
      });

      return response;
    }

    /**
     * 解析流
     */
    private async *parseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<SSEMessage> {
      const reader = body.getReader();
      const decoder = new TextDecoder('utf-8');
      this.buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            // 处理剩余缓冲区
            if (this.buffer.trim()) {
              const message = this.parseBuffer();
              if (message) {
                yield message;
              }
            }
            break;
          }

          this.buffer += decoder.decode(value, { stream: true });

          // 解析完整消息
          let message: SSEMessage | null;
          while ((message = this.parseBuffer()) !== null) {
            yield message;
          }
        }
      } finally {
        reader.releaseLock();
      }
    }

    /**
     * 解析缓冲区
     */
    private parseBuffer(): SSEMessage | null {
      // 查找消息边界（两个换行符）
      const boundary = this.buffer.indexOf('\n\n');

      if (boundary === -1) {
        return null; // 还没有完整消息
      }

      const messageText = this.buffer.substring(0, boundary);
      this.buffer = this.buffer.substring(boundary + 2);

      // 解析消息
      return this.parseMessage(messageText);
    }

    /**
     * 解析单条消息
     */
    private parseMessage(text: string): SSEMessage | null {
      if (!text.trim()) {
        return null;
      }

      const lines = text.split('\n');
      const message: SSEMessage = {
        data: '',
      };

      for (const line of lines) {
        if (line.startsWith(':')) {
          // 注释行，忽略
          continue;
        }

        const colonIndex = line.indexOf(':');
        const field = colonIndex === -1 ? line : line.substring(0, colonIndex);
        const value = colonIndex === -1 ? '' : line.substring(colonIndex + 1).trim();

        switch (field) {
          case 'id':
            message.id = value;
            this.lastEventId = value;
            break;

          case 'event':
            message.event = value;
            break;

          case 'data':
            message.data += (message.data ? '\n' : '') + value;
            break;
        }
      }

      return message;
    }

    /**
     * 断开连接
     */
    disconnect(): void {
      if (this.controller) {
        this.controller.abort();
        this.controller = null;
      }
    }

    /**
     * 延迟
     */
    private delay(ms: number): Promise<void> {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  }

  /**
   * SSE 使用示例
   */
  export async function exampleSSE() {
    const sse = new SSETransport({
      url: 'https://api.example.com/stream',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer YOUR_TOKEN',
        'Content-Type': 'application/json',
      },
      body: {
        model: 'claude-3-5-sonnet',
        messages: [{ role: 'user', content: 'Hello' }],
      },
      retryAttempts: 3,
      retryDelay: 1000,
    });

    try {
      for await (const message of sse.connect()) {
        console.log('Event:', message.event);
        console.log('Data:', message.data);

        // 解析数据
        try {
          const data = JSON.parse(message.data);
          console.log('Parsed:', data);
        } catch {
          // 非 JSON 数据
        }
      }
    } finally {
      sse.disconnect();
    }
  }

  5.2 WebSocket 流式传输


  /**
   * WebSocket 流式传输处理器
   * 文件：src/bridge/transport/websocket.ts
   */

  import WebSocket from 'ws';

  /**
   * WebSocket 配置
   */
  export interface WebSocketConfig {
    url: string;
    protocols?: string | string[];
    headers?: Record<string, string>;
    reconnectAttempts?: number;
    reconnectDelay?: number;
    pingInterval?: number;
    pongTimeout?: number;
  }

  /**
   * WebSocket 消息
   */
  export interface WebSocketMessage {
    type: 'text' | 'binary';
    data: string | Buffer;
  }

  /**
   * WebSocket 传输
   */
  export class WebSocketTransport {
    private ws: WebSocket | null = null;
    private config: Required<WebSocketConfig>;
    private reconnectAttempts: number = 0;
    private messageQueue: WebSocketMessage[] = [];
    private pingTimer: NodeJS.Timeout | null = null;
    private pongTimer: NodeJS.Timeout | null = null;

    constructor(config: WebSocketConfig) {
      this.config = {
        url: config.url,
        protocols: config.protocols,
        headers: config.headers || {},
        reconnectAttempts: config.reconnectAttempts || 3,
        reconnectDelay: config.reconnectDelay || 1000,
        pingInterval: config.pingInterval || 30000,
        pongTimeout: config.pongTimeout || 5000,
      };
    }

    /**
     * 连接 WebSocket
     */
    async connect(): Promise<void> {
      return new Promise((resolve, reject) => {
        this.ws = new WebSocket(this.config.url, this.config.protocols || [], {
          headers: this.config.headers,
        });

        this.ws.once('open', () => {
          this.reconnectAttempts = 0;
          this.setupPingPong();
          resolve();
        });

        this.ws.once('error', (error) => {
          reject(error);
        });

        this.ws.on('close', () => {
          this.handleClose();
        });

        this.ws.on('pong', () => {
          this.handlePong();
        });
      });
    }

    /**
     * 接收消息
     */
    async *receive(): AsyncGenerator<WebSocketMessage> {
      if (!this.ws) {
        throw new Error('WebSocket not connected');
      }

      while (this.ws.readyState === WebSocket.OPEN) {
        const message = await this.waitForMessage();

        if (message) {
          yield message;
        }
      }
    }

    /**
     * 等待消息
     */
    private waitForMessage(): Promise<WebSocketMessage | null> {
      return new Promise((resolve) => {
        if (!this.ws) {
          resolve(null);
          return;
        }

        const handler = (data: WebSocket.RawData, isBinary: boolean) => {
          this.ws!.off('message', handler);

          resolve({
            type: isBinary ? 'binary' : 'text',
            data: Buffer.isBuffer(data) ? data : Buffer.from(data as string),
          });
        };

        this.ws.once('message', handler);

        // 超时处理
        setTimeout(() => {
          this.ws!.off('message', handler);
          resolve(null);
        }, 60000);
      });
    }

    /**
     * 发送消息
     */
    send(data: string | Buffer): void {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        throw new Error('WebSocket not connected');
      }

      this.ws.send(data);
    }

    /**
     * 发送 JSON
     */
    sendJSON(data: any): void {
      this.send(JSON.stringify(data));
    }

    /**
     * 设置 Ping/Pong
     */
    private setupPingPong(): void {
      this.pingTimer = setInterval(() => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          return;
        }

        this.ws.ping();

        // 设置 Pong 超时
        this.pongTimer = setTimeout(() => {
          console.warn('WebSocket pong timeout, reconnecting...');
          this.ws?.terminate();
        }, this.config.pongTimeout);
      }, this.config.pingInterval);
    }

    /**
     * 处理 Pong
     */
    private handlePong(): void {
      if (this.pongTimer) {
        clearTimeout(this.pongTimer);
        this.pongTimer = null;
      }
    }

    /**
     * 处理关闭
     */
    private async handleClose(): void {
      this.cleanup();

      // 尝试重连
      if (this.reconnectAttempts < this.config.reconnectAttempts) {
        this.reconnectAttempts++;

        console.warn(
          `WebSocket closed, reconnecting (${this.reconnectAttempts}/${this.config.reconnectAttempts})...`
        );

        await this.delay(this.config.reconnectDelay * this.reconnectAttempts);

        try {
          await this.connect();
        } catch (error) {
          console.error('Reconnection failed:', error);
        }
      }
    }

    /**
     * 清理
     */
    private cleanup(): void {
      if (this.pingTimer) {
        clearInterval(this.pingTimer);
        this.pingTimer = null;
      }

      if (this.pongTimer) {
        clearTimeout(this.pongTimer);
        this.pongTimer = null;
      }
    }

    /**
     * 断开连接
     */
    disconnect(): void {
      this.cleanup();

      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
    }

    /**
     * 延迟
     */
    private delay(ms: number): Promise<void> {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  }

  /**
   * WebSocket 使用示例
   */
  export async function exampleWebSocket() {
    const ws = new WebSocketTransport({
      url: 'wss://api.example.com/stream',
      headers: {
        'Authorization': 'Bearer YOUR_TOKEN',
      },
      reconnectAttempts: 5,
      reconnectDelay: 1000,
    });

    try {
      await ws.connect();

      // 发送消息
      ws.sendJSON({
        type: 'subscribe',
        channel: 'updates',
      });

      // 接收消息
      for await (const message of ws.receive()) {
        if (message.type === 'text') {
          const data = JSON.parse(message.data.toString());
          console.log('Received:', data);
        }
      }
    } finally {
      ws.disconnect();
    }
  }

  ---
  6. 错误处理与重试


  6.1 统一错误处理器


  /**
   * API 错误处理器
   * 文件：src/services/api/errorHandler.ts
   */

  import {
    DogeCodeError,
    ErrorType,
    ErrorClassifier,
    APIError,
    RateLimitError,
    TokenLimitExceededError,
    NetworkError,
  } from '../../types/index.js';

  /**
   * 错误处理配置
   */
  export interface ErrorHandlerConfig {
    maxRetries: number;
    baseDelay: number;
    maxDelay: number;
    retryableErrors: ErrorType[];
    onRetry?: (attempt: number, error: Error) => void;
    onMaxRetries?: (error: Error) => void;
  }

  /**
   * API 错误处理器
   */
  export class APIErrorHandler {
    private config: Required<ErrorHandlerConfig>;
    private retryCount: number = 0;

    constructor(config: Partial<ErrorHandlerConfig> = {}) {
      this.config = {
        maxRetries: config.maxRetries || 3,
        baseDelay: config.baseDelay || 1000,
        maxDelay: config.maxDelay || 30000,
        retryableErrors: config.retryableErrors || [
          ErrorType.RATE_LIMIT,
          ErrorType.NETWORK_ERROR,
          ErrorType.TIMEOUT,
          ErrorType.SERVER_ERROR,
        ],
        onRetry: config.onRetry || (() => {}),
        onMaxRetries: config.onMaxRetries || (() => {}),
      };
    }

    /**
     * 处理错误
     */
    async handle<T>(
      fn: () => Promise<T>,
      context?: {
        requestId?: string;
        model?: string;
      }
    ): Promise<T> {
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
        try {
          this.retryCount = attempt;
          const result = await fn();
          this.retryCount = 0;
          return result;
        } catch (error) {
          lastError = error as Error;

          const classified = this.classify(error);

          // 不可重试的错误
          if (!this.isRetryable(classified)) {
            throw this.wrapError(error, context);
          }

          // 已达最大重试次数
          if (attempt === this.config.maxRetries) {
            this.config.onMaxRetries(lastError);
            throw this.wrapError(error, context);
          }

          // 计算延迟
          const delay = this.calculateDelay(attempt, classified);

          // 调用重试回调
          this.config.onRetry(attempt + 1, lastError);

          console.warn(
            `[Retry ${attempt + 1}/${this.config.maxRetries}]`,
            `Error: ${classified}`,
            `Retrying in ${delay}ms...`
          );

          await this.delay(delay);
        }
      }

      throw lastError || new Error('Unknown error');
    }

    /**
     * 分类错误
     */
    private classify(error: unknown): ErrorType {
      if (error instanceof DogeCodeError) {
        return error.type;
      }

      return ErrorClassifier.classify(error);
    }

    /**
     * 是否可重试
     */
    private isRetryable(type: ErrorType): boolean {
      return this.config.retryableErrors.includes(type);
    }

    /**
     * 计算延迟
     */
    private calculateDelay(attempt: number, errorType: ErrorType): number {
      // 速率限制特殊处理
      if (errorType === ErrorType.RATE_LIMIT) {
        // 指数退避 + 抖动
        const delay = Math.min(
          this.config.baseDelay * Math.pow(2, attempt),
          this.config.maxDelay
        );

        return delay * (0.5 + Math.random());
      }

      // 默认指数退避
      return Math.min(
        this.config.baseDelay * Math.pow(2, attempt),
        this.config.maxDelay
      );
    }

    /**
     * 包装错误
     */
    private wrapError(error: unknown, context?: any): DogeCodeError {
      if (error instanceof DogeCodeError) {
        return error;
      }

      const type = this.classify(error);
      const message = error instanceof Error ? error.message : String(error);

      return new DogeCodeError(type, message, {
        originalError: error,
        context,
        retryCount: this.retryCount,
      });
    }

    /**
     * 延迟
     */
    private delay(ms: number): Promise<void> {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 获取重试计数
     */
    getRetryCount(): number {
      return this.retryCount;
    }

    /**
     * 重置
     */
    reset(): void {
      this.retryCount = 0;
    }
  }

  /**
   * 创建错误处理器
   */
  export function createErrorHandler(
    config?: Partial<ErrorHandlerConfig>
  ): APIErrorHandler {
    return new APIErrorHandler(config);
  }

  6.2 重试策略


  /**
   * 重试策略
   * 文件：src/services/api/retryPolicy.ts
   */

  /**
   * 重试策略接口
   */
  export interface RetryPolicy {
    shouldRetry(error: Error): boolean;
    getDelay(attempt: number, error: Error): number;
    getMaxRetries(): number;
  }

  /**
   * 指数退避策略
   */
  export class ExponentialBackoffPolicy implements RetryPolicy {
    constructor(
      private maxRetries: number = 3,
      private baseDelay: number = 1000,
      private maxDelay: number = 30000,
      private jitter: boolean = true
    ) {}

    shouldRetry(error: Error): boolean {
      const type = ErrorClassifier.classify(error);
      return [
        ErrorType.RATE_LIMIT,
        ErrorType.NETWORK_ERROR,
        ErrorType.TIMEOUT,
        ErrorType.SERVER_ERROR,
      ].includes(type);
    }

    getDelay(attempt: number, error: Error): number {
      let delay = this.baseDelay * Math.pow(2, attempt);

      if (this.jitter) {
        delay = delay * (0.5 + Math.random());
      }

      return Math.min(delay, this.maxDelay);
    }

    getMaxRetries(): number {
      return this.maxRetries;
    }
  }

  /**
   * 固定延迟策略
   */
  export class FixedDelayPolicy implements RetryPolicy {
    constructor(
      private maxRetries: number = 3,
      private delay: number = 1000
    ) {}

    shouldRetry(error: Error): boolean {
      const type = ErrorClassifier.classify(error);
      return [
        ErrorType.NETWORK_ERROR,
        ErrorType.TIMEOUT,
      ].includes(type);
    }

    getDelay(attempt: number, error: Error): number {
      return this.delay;
    }

    getMaxRetries(): number {
      return this.maxRetries;
    }
  }

  /**
   * 无重试策略
   */
  export class NoRetryPolicy implements RetryPolicy {
    shouldRetry(error: Error): boolean {
      return false;
    }

    getDelay(attempt: number, error: Error): number {
      return 0;
    }

    getMaxRetries(): number {
      return 0;
    }
  }

  /**
   * 重试策略工厂
   */
  export class RetryPolicyFactory {
    static create(type: 'exponential' | 'fixed' | 'none', options?: any): RetryPolicy {
      switch (type) {
        case 'exponential':
          return new ExponentialBackoffPolicy(
            options?.maxRetries,
            options?.baseDelay,
            options?.maxDelay,
            options?.jitter
          );

        case 'fixed':
          return new FixedDelayPolicy(
            options?.maxRetries,
            options?.delay
          );

        case 'none':
          return new NoRetryPolicy();

        default:
          throw new Error(`Unknown retry policy type: ${type}`);
      }
    }
  }

  ---
  7. 会话管理


  7.1 会话存储


  /**
   * 会话管理器
   * 文件：src/services/session/sessionManager.ts
   */

  import { promises as fs } from 'fs';
  import path from 'path';
  import { v4 as uuid } from 'uuid';
  import type { InternalMessage, TokenUsage } from '../../types/index.js';

  /**
   * 会话数据
   */
  export interface Session {
    id: string;
    projectId?: string;
    messages: InternalMessage[];
    metadata: SessionMetadata;
    state: SessionState;
    createdAt: Date;
    updatedAt: Date;
  }

  /**
   * 会话元数据
   */
  export interface SessionMetadata {
    model: string;
    provider: string;
    tokenUsage: TokenUsage;
    queryCount: number;
    toolCallCount: number;
    tags?: string[];
  }

  /**
   * 会话状态
   */
  export interface SessionState {
    status: 'active' | 'paused' | 'completed' | 'failed';
    lastQuery?: string;
    lastQueryTime?: Date;
    pendingToolCalls?: string[];
  }

  /**
   * 会话管理器配置
   */
  export interface SessionManagerConfig {
    storageDir: string;
    maxSessions?: number;
    autoSave?: boolean;
    autoSaveInterval?: number;
  }

  /**
   * 会话管理器
   */
  export class SessionManager {
    private config: Required<SessionManagerConfig>;
    private sessions: Map<string, Session> = new Map();
    private currentSession: Session | null = null;
    private autoSaveTimer: NodeJS.Timeout | null = null;

    constructor(config: SessionManagerConfig) {
      this.config = {
        storageDir: config.storageDir,
        maxSessions: config.maxSessions || 100,
        autoSave: config.autoSave ?? true,
        autoSaveInterval: config.autoSaveInterval || 60000,
      };

      this.ensureStorageDir();

      if (this.config.autoSave) {
        this.startAutoSave();
      }
    }

    /**
     * 创建新会话
     */
    async createSession(options?: {
      projectId?: string;
      model?: string;
      provider?: string;
    }): Promise<Session> {
      const session: Session = {
        id: uuid(),
        projectId: options?.projectId,
        messages: [],
        metadata: {
          model: options?.model || 'claude-3-5-sonnet-20241022',
          provider: options?.provider || 'anthropic',
          tokenUsage: { inputTokens: 0, outputTokens: 0 },
          queryCount: 0,
          toolCallCount: 0,
        },
        state: {
          status: 'active',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.sessions.set(session.id, session);
      this.currentSession = session;

      await this.saveSession(session);

      return session;
    }

    /**
     * 获取会话
     */
    async getSession(id: string): Promise<Session | null> {
      // 先从内存查找
      if (this.sessions.has(id)) {
        return this.sessions.get(id)!;
      }

      // 从磁盘加载
      const session = await this.loadSession(id);

      if (session) {
        this.sessions.set(id, session);
      }

      return session;
    }

    /**
     * 获取当前会话
     */
    getCurrentSession(): Session | null {
      return this.currentSession;
    }

    /**
     * 设置当前会话
     */
    async setCurrentSession(id: string): Promise<void> {
      const session = await this.getSession(id);

      if (!session) {
        throw new Error(`Session not found: ${id}`);
      }

      this.currentSession = session;
    }

    /**
     * 添加消息到会话
     */
    async addMessage(sessionId: string, message: InternalMessage): Promise<void> {
      const session = await this.getSession(sessionId);

      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      session.messages.push(message);
      session.updatedAt = new Date();

      await this.saveSession(session);
    }

    /**
     * 更新会话元数据
     */
    async updateMetadata(
      sessionId: string,
      updates: Partial<SessionMetadata>
    ): Promise<void> {
      const session = await this.getSession(sessionId);

      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      session.metadata = { ...session.metadata, ...updates };
      session.updatedAt = new Date();

      await this.saveSession(session);
    }

    /**
     * 更新会话状态
     */
    async updateState(
      sessionId: string,
      updates: Partial<SessionState>
    ): Promise<void> {
      const session = await this.getSession(sessionId);

      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      session.state = { ...session.state, ...updates };
      session.updatedAt = new Date();

      await this.saveSession(session);
    }

    /**
     * 列出所有会话
     */
    async listSessions(options?: {
      projectId?: string;
      status?: SessionState['status'];
      limit?: number;
    }): Promise<Session[]> {
      const files = await fs.readdir(this.config.storageDir);
      const sessions: Session[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) {
          continue;
        }

        const id = file.replace('.json', '');
        const session = await this.getSession(id);

        if (session) {
          // 过滤
          if (options?.projectId && session.projectId !== options.projectId) {
            continue;
          }

          if (options?.status && session.state.status !== options.status) {
            continue;
          }

          sessions.push(session);
        }
      }

      // 按更新时间排序
      sessions.sort((a, b) =>
        b.updatedAt.getTime() - a.updatedAt.getTime()
      );

      // 限制数量
      if (options?.limit) {
        return sessions.slice(0, options.limit);
      }

      return sessions;
    }

    /**
     * 删除会话
     */
    async deleteSession(id: string): Promise<void> {
      this.sessions.delete(id);

      const filePath = this.getSessionFilePath(id);
      await fs.unlink(filePath).catch(() => {});

      if (this.currentSession?.id === id) {
        this.currentSession = null;
      }
    }

    /**
     * 保存会话到磁盘
     */
    private async saveSession(session: Session): Promise<void> {
      const filePath = this.getSessionFilePath(session.id);
      const data = JSON.stringify(session, null, 2);

      await fs.writeFile(filePath, data, 'utf-8');
    }

    /**
     * 从磁盘加载会话
     */
    private async loadSession(id: string): Promise<Session | null> {
      const filePath = this.getSessionFilePath(id);

      try {
        const data = await fs.readFile(filePath, 'utf-8');
        const session = JSON.parse(data) as Session;

        // 恢复日期对象
        session.createdAt = new Date(session.createdAt);
        session.updatedAt = new Date(session.updatedAt);

        return session;
      } catch {
        return null;
      }
    }

    /**
     * 获取会话文件路径
     */
    private getSessionFilePath(id: string): string {
      return path.join(this.config.storageDir, `${id}.json`);
    }

    /**
     * 确保存储目录存在
     */
    private async ensureStorageDir(): Promise<void> {
      await fs.mkdir(this.config.storageDir, { recursive: true });
    }

    /**
     * 启动自动保存
     */
    private startAutoSave(): void {
      this.autoSaveTimer = setInterval(async () => {
        for (const session of this.sessions.values()) {
          await this.saveSession(session);
        }
      }, this.config.autoSaveInterval);
    }

    /**
     * 停止自动保存
     */
    stopAutoSave(): void {
      if (this.autoSaveTimer) {
        clearInterval(this.autoSaveTimer);
        this.autoSaveTimer = null;
      }
    }

    /**
     * 清理旧会话
     */
    async cleanupOldSessions(maxAge: number = 30 * 24 * 60 * 60 * 1000): Promise<number> {
      const sessions = await this.listSessions();
      const now = Date.now();
      let deleted = 0;

      for (const session of sessions) {
        const age = now - session.updatedAt.getTime();

        if (age > maxAge) {
          await this.deleteSession(session.id);
          deleted++;
        }
      }

      return deleted;
    }

    /**
     * 销毁
     */
    destroy(): void {
      this.stopAutoSave();
      this.sessions.clear();
    }
  }

  7.2 会话恢复


  /**
   * 会话恢复器
   * 文件：src/services/session/sessionRecovery.ts
   */

  import type { Session, InternalMessage } from '../../types/index.js';

  /**
   * 会话恢复选项
   */
  export interface SessionRecoveryOptions {
    sessionId: string;
    restoreMessages?: boolean;
    restoreMetadata?: boolean;
    maxMessages?: number;
  }

  /**
   * 会话恢复结果
   */
  export interface SessionRecoveryResult {
    session: Session;
    restoredMessages: InternalMessage[];
    warnings: string[];
  }

  /**
   * 会话恢复器
   */
  export class SessionRecovery {
    private sessionManager: SessionManager;

    constructor(sessionManager: SessionManager) {
      this.sessionManager = sessionManager;
    }

    /**
     * 恢复会话
     */
    async recover(options: SessionRecoveryOptions): Promise<SessionRecoveryResult> {
      const session = await this.sessionManager.getSession(options.sessionId);

      if (!session) {
        throw new Error(`Session not found: ${options.sessionId}`);
      }

      const warnings: string[] = [];
      let restoredMessages: InternalMessage[] = [];

      // 恢复消息
      if (options.restoreMessages !== false) {
        restoredMessages = session.messages;

        // 限制消息数量
        if (options.maxMessages && restoredMessages.length > options.maxMessages) {
          restoredMessages = restoredMessages.slice(-options.maxMessages);
          warnings.push(
            `Messages truncated to last ${options.maxMessages} messages`
          );
        }
      }

      // 更新会话状态
      await this.sessionManager.updateState(session.id, {
        status: 'active',
        lastQueryTime: new Date(),
      });

      return {
        session,
        restoredMessages,
        warnings,
      };
    }

    /**
     * 检查会话是否可恢复
     */
    async canRecover(sessionId: string): Promise<{
      recoverable: boolean;
      reason?: string;
    }> {
      const session = await this.sessionManager.getSession(sessionId);

      if (!session) {
        return { recoverable: false, reason: 'Session not found' };
      }

      if (session.messages.length === 0) {
        return { recoverable: false, reason: 'Session has no messages' };
      }

      return { recoverable: true };
    }
  }

  ---
  8. 认证与授权


  8.1 API 认证


  /**
   * API 认证管理器
   * 文件：src/services/auth/authManager.ts
   */

  import { promises as fs } from 'fs';
  import path from 'path';
  import type { APIConfig, PresetConfig } from '../../types/index.js';

  /**
   * 认证信息
   */
  export interface AuthInfo {
    provider: string;
    apiKey: string;
    baseUrl?: string;
    organization?: string;
    expiresAt?: Date;
    scopes?: string[];
  }

  /**
   * 认证管理器配置
   */
  export interface AuthManagerConfig {
    configPath: string;
    encryptionKey?: string;
  }

  /**
   * 认证管理器
   */
  export class AuthManager {
    private config: AuthManagerConfig;
    private authCache: Map<string, AuthInfo> = new Map();

    constructor(config: AuthManagerConfig) {
      this.config = config;
    }

    /**
     * 加载认证配置
     */
    async loadAuth(): Promise<void> {
      const apiConfig = await this.loadAPIConfig();

      if (apiConfig.activePreset) {
        const preset = apiConfig.presets?.[apiConfig.activePreset];

        if (preset) {
          this.authCache.set(apiConfig.activePreset, {
            provider: preset.provider,
            apiKey: preset.apiKey,
            baseUrl: preset.baseUrl,
            organization: preset.organization,
          });
        }
      }
    }

    /**
     * 获取认证信息
     */
    getAuth(presetName?: string): AuthInfo | null {
      const key = presetName || 'default';
      return this.authCache.get(key) || null;
    }

    /**
     * 设置认证信息
     */
    async setAuth(auth: AuthInfo, presetName?: string): Promise<void> {
      const key = presetName || 'default';
      this.authCache.set(key, auth);

      await this.saveAPIConfig(auth, key);
    }

    /**
     * 验证 API Key
     */
    async validateApiKey(auth: AuthInfo): Promise<{
      valid: boolean;
      error?: string;
    }> {
      try {
        const response = await fetch(auth.baseUrl || 'https://api.anthropic.com/v1/models', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${auth.apiKey}`,
            'anthropic-version': '2023-06-01',
          },
        });

        if (response.ok) {
          return { valid: true };
        }

        if (response.status === 401) {
          return { valid: false, error: 'Invalid API key' };
        }

        return { valid: false, error: `HTTP ${response.status}` };
      } catch (error) {
        return {
          valid: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }

    /**
     * 加载 API 配置
     */
    private async loadAPIConfig(): Promise<APIConfig> {
      try {
        const data = await fs.readFile(this.config.configPath, 'utf-8');
        return JSON.parse(data);
      } catch {
        return {};
      }
    }

    /**
     * 保存 API 配置
     */
    private async saveAPIConfig(auth: AuthInfo, presetName: string): Promise<void> {
      const config = await this.loadAPIConfig();

      config.activePreset = presetName;
      config.presets = config.presets || {};
      config.presets[presetName] = {
        provider: auth.provider,
        apiKey: auth.apiKey,
        baseUrl: auth.baseUrl,
        organization: auth.organization,
      } as PresetConfig;

      const data = JSON.stringify(config, null, 2);
      await fs.writeFile(this.config.configPath, data, 'utf-8');
    }

    /**
     * 清除认证
     */
    async clearAuth(presetName?: string): Promise<void> {
      if (presetName) {
        this.authCache.delete(presetName);
      } else {
        this.authCache.clear();
      }
    }
  }

  ---
  9. 完整实现代码


  9.1 API Bootstrap


  /**
   * API Bootstrap
   * 文件：src/services/api/bootstrap.ts
   *
   * 根据配置选择正确的 API 客户端
   */

  import { ClaudeAPIClient } from './claude.js';
  import { OpenAICompatClient } from './openaiCompat.js';
  import type { IAPIClient, APIConfig } from '../../types/index.js';
  import { AuthManager } from '../auth/authManager.js';

  /**
   * 创建 API 客户端
   */
  export async function createAPIClient(config: APIConfig): Promise<IAPIClient> {
    const authManager = new AuthManager({
      configPath: process.env.DOGE_API_JSON || '~/.doge/api.json',
    });

    await authManager.loadAuth();

    const presetName = config.activePreset || 'default';
    const preset = config.presets?.[presetName];

    if (!preset) {
      throw new Error(`Preset not found: ${presetName}`);
    }

    const auth = await authManager.getAuth(presetName);

    if (!auth) {
      throw new Error(`Auth not found for preset: ${presetName}`);
    }

    if (preset.provider === 'anthropic') {
      return new ClaudeAPIClient({
        apiKey: auth.apiKey,
        baseUrl: auth.baseUrl,
        model: preset.model || 'claude-3-5-sonnet-20241022',
        maxRetries: 3,
        timeout: 600000,
      });
    }

    if (preset.provider === 'openai') {
      return new OpenAICompatClient({
        apiKey: auth.apiKey,
        baseUrl: auth.baseUrl,
        model: preset.model || 'gpt-4-turbo',
        maxRetries: 3,
        timeout: 600000,
        organization: auth.organization,
      });
    }

    throw new Error(`Unknown provider: ${preset.provider}`);
  }

  9.2 完整使用示例


  /**
   * 完整使用示例
   * 文件：src/examples/api-usage.ts
   */

  import { createAPIClient } from '../services/api/bootstrap.js';
  import { QueryEngine } from '../query/QueryEngine.js';
  import type { APIConfig } from '../types/index.js';

  async function main() {
    // 1. 配置 API
    const config: APIConfig = {
      activePreset: 'claude-3-5-sonnet',
      presets: {
        'claude-3-5-sonnet': {
          provider: 'anthropic',
          apiKey: process.env.ANTHROPIC_API_KEY!,
          model: 'claude-3-5-sonnet-20241022',
        },
      },
    };

    // 2. 创建 API 客户端
    const apiClient = await createAPIClient(config);

    // 3. 创建查询引擎
    const engine = new QueryEngine({
      model: 'claude-3-5-sonnet-20241022',
      maxOutputTokens: 4096,
      apiClient,
      systemPrompt: 'You are a helpful AI programming assistant.',
    });

    // 4. 监听事件
    engine.on('stateChange', (event) => {
      console.log(`[State] ${event.from} → ${event.to}`);
    });

    engine.on('message', (message) => {
      if (message.role === 'assistant') {
        console.log(`[Assistant]`, message.content);
      }
    });

    engine.on('budgetEvent', (event) => {
      if (event.type === 'warning') {
        console.warn(`[Token Budget] ${event.result.percentage * 100}% used`);
      }
    });

    // 5. 执行查询
    try {
      const result = await engine.query('Hello, Claude! Please help me write a simple HTTP server in Node.js.');

      console.log('\n[Result]');
      console.log('State:', result.state);
      console.log('Iterations:', result.iterations);
      console.log('Tool Calls:', result.toolCalls);
      console.log('Token Usage:', result.tokenUsage);
      console.log('Duration:', result.duration, 'ms');
    } catch (error) {
      console.error('Error:', error);
    }
  }

  main().catch(console.error);

  ---
  请保存以上内容：

  notepad D:\doge-code\docs\03-api-bridge-part2.md

  ---
  已完成章节汇总


  已输出：


  1. 00 - 项目概述（约 5000 字）✅
  2. 01 - 架构设计（约 30000 字）✅
  3. 02 - 核心引擎（三部分，共约 50000 字）✅
  4. 03 - API与Bridge（两部分，共约 40000 字）✅

  待输出：


  5. 04 - 工具系统（约 40000 字）
  6. 05 - 命令系统（约 30000 字）
  7. 06 - 技能系统（约 20000 字）
  8. 07 - 插件系统（约 25000 字）
  9. 08 - MCP集成（约 20000 字）
  10. 09 - UI组件（约 30000 字）
  11. 10 - Hooks系统（约 25000 字）
  12. 11 - 状态管理（约 15000 字）
  13. 12 - 服务层（约 30000 字）
  14. 13 - 工具函数（约 20000 字）
  15. 14 - 常量与配置（约 15000 字）
  16. 15 - 类型定义（约 10000 字）
  17. 16 - 安全机制（约 15000 字）
  18. 17 - 性能优化（约 20000 字）
  19. 18 - 测试策略（约 20000 字）
  20. 19 - 部署与发布（约 15000 字）
  21. 20 - API参考（约 40000 字）
  22. 21 - 开发指南（约 25000 字）
  23. 22 - 附录（约 20000 字）

  总字数：约 520,000 字

  ---
  请告诉我是否继续输出后续章节，或者有其他需求？
