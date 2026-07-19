import type { IAPIClient, IToolRegistry, QueryState, TokenUsage, ToolCall } from './types.js';

/**
 * 查询引擎配置
 */
export interface QueryEngineConfig {
  /**
   * API 客户端
   */
  apiClient: IAPIClient;

  /**
   * 工具注册表
   */
  toolRegistry: IToolRegistry;

  /**
   * 最大 Token 数
   */
  maxTokens?: number;

  /**
   * 模型名称
   */
  model?: string;

  /**
   * 系统提示词
   */
  systemPrompt?: string;
}

/**
 * 查询选项
 */
export interface QueryOptions {
  /**
   * 模型名称
   */
  model?: string;

  /**
   * 最大 Token 数
   */
  maxTokens?: number;

  /**
   * 温度参数
   */
  temperature?: number;

  /**
   * 系统提示词
   */
  system?: string;

  /**
   * 是否流式传输
   */
  stream?: boolean;

  /**
   * 超时时间（毫秒）
   */
  timeout?: number;
}

/**
 * 查询结果
 */
export interface QueryResult {
  /**
   * 是否成功
   */
  success: boolean;

  /**
   * 响应内容
   */
  content?: string;

  /**
   * 工具调用列表
   */
  toolCalls?: ToolCall[];

  /**
   * Token 使用量
   */
  tokenUsage?: TokenUsage;

  /**
   * 执行时长（毫秒）
   */
  duration?: number;

  /**
   * 错误信息
   */
  error?: string;
}

/**
 * 查询引擎类
 */
export class QueryEngine {
  constructor(config: QueryEngineConfig) {
    throw new Error('Not implemented');
  }

  async query(message: string, options?: QueryOptions): Promise<QueryResult> {
    throw new Error('Not implemented');
  }

  async *streamQuery(message: string, options?: QueryOptions): AsyncGenerator<string> {
    throw new Error('Not implemented');
  }

  abort(): void {
    throw new Error('Not implemented');
  }

  getState(): QueryState {
    throw new Error('Not implemented');
  }

  getTokenUsage(): TokenUsage {
    throw new Error('Not implemented');
  }

  reset(): void {
    throw new Error('Not implemented');
  }
}