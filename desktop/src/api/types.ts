// 查询状态
export type QueryState = 'idle' | 'responding' | 'needs_user' | 'should_continue' | 'done' | 'crashed' | 'aborted_by_user';

// Token 使用统计
export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
};

// 工具调用
export type ToolCall = {
  id: string;
  name: string;
  input: Record<string, any>;
};

// 消息角色
export type MessageRole = 'user' | 'assistant' | 'system';

// 消息内容
export type MessageContent = string | Array<{ type: string; text?: string; [key: string]: unknown }>;

// 内部消息
export type InternalMessage = {
  role: MessageRole;
  content: MessageContent;
  toolCalls?: ToolCall[];
  toolResults?: Array<{ toolCallId: string; output: string; error?: string }>;
};

// API 配置
export type APIConfig = {
  provider: 'anthropic' | 'openai' | 'custom';
  apiKey: string;
  baseUrl: string;
  model: string;
};

// 模型配置
export type ModelConfig = {
  id: string;
  displayName: string;
  maxTokens: number;
  maxOutputTokens: number;
  supportsVision: boolean;
  supportsTools: boolean;
};

// 用户配置
export type UserConfig = {
  theme: 'light' | 'dark';
  language: string;
  defaultModel: string;
};

// 应用状态
export type AppState = {
  query: QueryState;
  config: Record<string, any>;
};

// 会话状态
export type SessionState = {
  status: 'active' | 'inactive' | 'archived';
  lastActive: Date | null;
};

// UI 状态
export type UIState = {
  theme: 'light' | 'dark';
  sidebarOpen: boolean;
};

// 配置状态
export type ConfigState = {
  loaded: boolean;
  dirty: boolean;
};

// 遥测事件
export type TelemetryEvent = {
  name: string;
  properties?: Record<string, any>;
  timestamp: Date;
};

// 会话元数据
export type SessionMetadata = {
  title?: string;
  tags?: string[];
};

// API 客户端接口
export interface IAPIClient {
  sendMessage(messages: InternalMessage[]): Promise<string>;
  streamMessage(messages: InternalMessage[]): AsyncIterable<string>;
  healthCheck(): Promise<boolean>;
}

// 工具注册表接口
export interface IToolRegistry {
  register(tool: any): void;
  unregister(name: string): void;
  has(name: string): boolean;
  get(name: string): any | null;
  getAll(): any[];
  execute(name: string, params: Record<string, any>, context: any): Promise<any>;
  getStats(): Record<string, { calls: number; failures: number }>;
}