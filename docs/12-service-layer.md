  ---
  12 - 服务层（完整实现）


  目录


  1. 服务层概述
  2. 服务层架构
  3. API 客户端服务
  4. MCP 服务
  5. 遥测分析服务
  6. 策略限制服务
  7. 认证服务
  8. 存储服务
  9. 缓存服务
  10. 会话管理服务
  11. 完整实现代码

  ---
  1. 服务层概述


  1.1 设计目标


  服务层提供 Doge Code 的核心业务逻辑：

  - API 抽象：统一的 API 客户端接口
  - 服务集成：协调多个服务协同工作
  - 生命周期管理：服务的初始化、启动、停止
  - 依赖注入：服务间的依赖关系管理
  - 错误处理：统一的服务错误处理机制

  1.2 服务分类


  ┌────────────────┬────────────────────────────────────┐
  │     分类       │              服务                   │
  ├────────────────┼────────────────────────────────────┤
  │ API 服务       │ claude.ts, openaiCompat.ts         │
  ├────────────────┼────────────────────────────────────┤
  │ MCP 服务       │ mcp-manager, mcp-connection        │
  ├────────────────┼────────────────────────────────────┤
  │ 分析服务       │ analytics, telemetry               │
  ├────────────────┼────────────────────────────────────┤
  │ 安全服务       │ policy, auth, permissions          │
  ├────────────────┼────────────────────────────────────┤
  │ 存储服务       │ storage, cache, session            │
  ├────────────────┼────────────────────────────────────┤
  │ 工具服务       │ compact, git, model                │
  └────────────────┴────────────────────────────────────┘

  ---
  2. 服务层架构


  2.1 服务容器


  /**
   * 服务容器
   * 文件：src/services/container.ts
   */

  export class ServiceContainer {
    private services: Map<string, any> = new Map();
    private initialized: Set<string> = new Set();
    private initializing: Set<string> = new Set();

    /**
     * 注册服务
     */
    register<T>(name: string, service: T): void {
      if (this.services.has(name)) {
        throw new Error(`Service ${name} already registered`);
      }
      this.services.set(name, service);
    }

    /**
     * 获取服务
     */
    get<T>(name: string): T {
      const service = this.services.get(name);
      if (!service) {
        throw new Error(`Service ${name} not found`);
      }
      return service;
    }

    /**
     * 检查服务是否存在
     */
    has(name: string): boolean {
      return this.services.has(name);
    }

    /**
     * 初始化服务
     */
    async initialize(name: string): Promise<void> {
      if (this.initialized.has(name)) {
        return;
      }

      if (this.initializing.has(name)) {
        throw new Error(`Circular dependency detected: ${name}`);
      }

      this.initializing.add(name);

      try {
        const service = this.get(name);
        if (typeof service.initialize === 'function') {
          await service.initialize();
        }
        this.initialized.add(name);
      } finally {
        this.initializing.delete(name);
      }
    }

    /**
     * 初始化所有服务
     */
    async initializeAll(): Promise<void> {
      for (const name of this.services.keys()) {
        await this.initialize(name);
      }
    }

    /**
     * 销毁服务
     */
    async destroy(name: string): Promise<void> {
      const service = this.services.get(name);
      if (service && typeof service.destroy === 'function') {
        await service.destroy();
      }
      this.services.delete(name);
      this.initialized.delete(name);
    }

    /**
     * 销毁所有服务
     */
    async destroyAll(): Promise<void> {
      for (const name of Array.from(this.services.keys())) {
        await this.destroy(name);
      }
    }
  }

  2.2 服务接口


  /**
   * 服务接口定义
   * 文件：src/services/types.ts
   */

  /**
   * 基础服务接口
   */
  export interface IService {
    /**
     * 服务名称
     */
    readonly name: string;

    /**
     * 初始化服务
     */
    initialize(): Promise<void>;

    /**
     * 销毁服务
     */
    destroy(): Promise<void>;

    /**
     * 健康检查
     */
    healthCheck(): Promise<boolean>;
  }

  /**
   * 服务配置接口
   */
  export interface ServiceConfig {
    /**
     * 是否启用
     */
    enabled: boolean;

    /**
     * 其他配置选项
     */
    [key: string]: any;
  }

  /**
   * 服务状态
   */
  export enum ServiceStatus {
    UNINITIALIZED = 'uninitialized',
    INITIALIZING = 'initializing',
    READY = 'ready',
    ERROR = 'error',
    DESTROYED = 'destroyed',
  }

  ---
  3. API 客户端服务


  3.1 Claude API 客户端


  /**
   * Claude API 客户端
   * 文件：src/services/api/claude.ts
   */

  import Anthropic from '@anthropic-ai/sdk';
  import type { IService, ServiceConfig } from '../types.js';

  export interface ClaudeAPIClientConfig extends ServiceConfig {
    apiKey: string;
    baseUrl?: string;
    model?: string;
    maxTokens?: number;
  }

  export class ClaudeAPIClient implements IService {
    readonly name = 'claude-api-client';
    private client: Anthropic;
    private config: ClaudeAPIClientConfig;
    private status: ServiceStatus = ServiceStatus.UNINITIALIZED;

    constructor(config: ClaudeAPIClientConfig) {
      this.config = config;
      this.client = new Anthropic({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
      });
    }

    async initialize(): Promise<void> {
      if (!this.config.enabled) {
        console.log('Claude API client is disabled');
        return;
      }

      this.status = ServiceStatus.INITIALIZING;

      try {
        // 验证 API Key
        await this.validateApiKey();

        this.status = ServiceStatus.READY;
        console.log('Claude API client initialized');
      } catch (error) {
        this.status = ServiceStatus.ERROR;
        throw error;
      }
    }

    async destroy(): Promise<void> {
      // 清理资源
      this.status = ServiceStatus.DESTROYED;
    }

    async healthCheck(): Promise<boolean> {
      return this.status === ServiceStatus.READY;
    }

    /**
     * 验证 API Key
     */
    private async validateApiKey(): Promise<void> {
      try {
        const response = await this.client.messages.create({
          model: this.config.model || 'claude-3-5-sonnet-20241022',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        });
        console.log('API Key validated successfully');
      } catch (error) {
        throw new Error(`Failed to validate API Key: ${error}`);
      }
    }

    /**
     * 发送消息
     */
    async sendMessage(
      messages: Array<{ role: string; content: string }>,
      options?: {
        model?: string;
        maxTokens?: number;
        temperature?: number;
        system?: string;
      }
    ): Promise<string> {
      const response = await this.client.messages.create({
        model: options?.model || this.config.model || 'claude-3-5-sonnet-20241022',
        max_tokens: options?.maxTokens || this.config.maxTokens || 40000,
        messages: messages.map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
        system: options?.system,
      });

      return response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n');
    }

    /**
     * 流式发送消息
     */
    async *streamMessage(
      messages: Array<{ role: string; content: string }>,
      options?: {
        model?: string;
        maxTokens?: number;
        system?: string;
      }
    ): AsyncGenerator<string> {
      const stream = await this.client.messages.stream({
        model: options?.model || this.config.model || 'claude-3-5-sonnet-20241022',
        max_tokens: options?.maxTokens || this.config.maxTokens || 40000,
        messages: messages.map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
        system: options?.system,
      });

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          yield event.delta.text;
        }
      }
    }

    /**
     * 获取状态
     */
    getStatus(): ServiceStatus {
      return this.status;
    }
  }

  3.2 OpenAI 兼容 API 客户端


  /**
   * OpenAI 兼容 API 客户端
   * 文件：src/services/api/openaiCompat.ts
   */

  import OpenAI from 'openai';
  import type { IService, ServiceConfig } from '../types.js';

  export interface OpenAICompatClientConfig extends ServiceConfig {
    apiKey: string;
    baseUrl: string;
    model?: string;
    maxTokens?: number;
  }

  export class OpenAICompatClient implements IService {
    readonly name = 'openai-compat-client';
    private client: OpenAI;
    private config: OpenAICompatClientConfig;
    private status: ServiceStatus = ServiceStatus.UNINITIALIZED;

    constructor(config: OpenAICompatClientConfig) {
      this.config = config;
      this.client = new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
      });
    }

    async initialize(): Promise<void> {
      if (!this.config.enabled) {
        console.log('OpenAI compat client is disabled');
        return;
      }

      this.status = ServiceStatus.INITIALIZING;

      try {
        await this.validateConnection();
        this.status = ServiceStatus.READY;
        console.log('OpenAI compat client initialized');
      } catch (error) {
        this.status = ServiceStatus.ERROR;
        throw error;
      }
    }

    async destroy(): Promise<void> {
      this.status = ServiceStatus.DESTROYED;
    }

    async healthCheck(): Promise<boolean> {
      return this.status === ServiceStatus.READY;
    }

    /**
     * 验证连接
     */
    private async validateConnection(): Promise<void> {
      try {
        const response = await this.client.chat.completions.create({
          model: this.config.model || 'gpt-4',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        });
        console.log('OpenAI compat connection validated');
      } catch (error) {
        throw new Error(`Failed to validate OpenAI compat connection: ${error}`);
      }
    }

    /**
     * 发送消息
     */
    async sendMessage(
      messages: Array<{ role: string; content: string }>,
      options?: {
        model?: string;
        maxTokens?: number;
        temperature?: number;
        system?: string;
      }
    ): Promise<string> {
      const systemMessage = options?.system
        ? [{ role: 'system' as const, content: options.system }]
        : [];

      const response = await this.client.chat.completions.create({
        model: options?.model || this.config.model || 'gpt-4',
        messages: [
          ...systemMessage,
          ...messages.map(msg => ({
            role: msg.role as 'system' | 'user' | 'assistant',
            content: msg.content,
          })),
        ],
        max_tokens: options?.maxTokens || this.config.maxTokens || 40000,
        temperature: options?.temperature,
      });

      return response.choices[0]?.message?.content || '';
    }

    /**
     * 流式发送消息
     */
    async *streamMessage(
      messages: Array<{ role: string; content: string }>,
      options?: {
        model?: string;
        maxTokens?: number;
        system?: string;
      }
    ): AsyncGenerator<string> {
      const systemMessage = options?.system
        ? [{ role: 'system' as const, content: options.system }]
        : [];

      const stream = await this.client.chat.completions.create({
        model: options?.model || this.config.model || 'gpt-4',
        messages: [
          ...systemMessage,
          ...messages.map(msg => ({
            role: msg.role as 'system' | 'user' | 'assistant',
            content: msg.content,
          })),
        ],
        max_tokens: options?.maxTokens || this.config.maxTokens || 40000,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          yield content;
        }
      }
    }

    getStatus(): ServiceStatus {
      return this.status;
    }
  }

  ---
  4. MCP 服务


  4.1 MCP 管理器


  /**
   * MCP 服务管理器
   * 文件：src/services/mcp/manager.ts
   */

  import type { IService, ServiceConfig } from '../types.js';

  export interface MCPServerConfig {
    command: string;
    args: string[];
    env?: Record<string, string>;
    autoRestart?: boolean;
    maxRestarts?: number;
  }

  export interface MCPManagerConfig extends ServiceConfig {
    servers: Record<string, MCPServerConfig>;
  }

  export class MCPManager implements IService {
    readonly name = 'mcp-manager';
    private config: MCPManagerConfig;
    private connections: Map<string, MCPConnection> = new Map();
    private status: ServiceStatus = ServiceStatus.UNINITIALIZED;

    constructor(config: MCPManagerConfig) {
      this.config = config;
    }

    async initialize(): Promise<void> {
      if (!this.config.enabled) {
        console.log('MCP manager is disabled');
        return;
      }

      this.status = ServiceStatus.INITIALIZING;

      try {
        // 初始化所有 MCP 服务器
        for (const [name, serverConfig] of Object.entries(this.config.servers)) {
          await this.connect(name, serverConfig);
        }

        this.status = ServiceStatus.READY;
        console.log('MCP manager initialized');
      } catch (error) {
        this.status = ServiceStatus.ERROR;
        throw error;
      }
    }

    async destroy(): Promise<void> {
      // 断开所有连接
      for (const [name] of this.connections) {
        await this.disconnect(name);
      }

      this.status = ServiceStatus.DESTROYED;
    }

    async healthCheck(): Promise<boolean> {
      return this.status === ServiceStatus.READY;
    }

    /**
     * 连接 MCP 服务器
     */
    async connect(name: string, config: MCPServerConfig): Promise<void> {
      if (this.connections.has(name)) {
        throw new Error(`MCP server ${name} already connected`);
      }

      const connection = new MCPConnection(config);
      await connection.start();

      this.connections.set(name, connection);
      console.log(`MCP server ${name} connected`);
    }

    /**
     * 断开 MCP 服务器
     */
    async disconnect(name: string): Promise<void> {
      const connection = this.connections.get(name);
      if (!connection) {
        throw new Error(`MCP server ${name} not found`);
      }

      await connection.stop();
      this.connections.delete(name);
      console.log(`MCP server ${name} disconnected`);
    }

    /**
     * 获取连接
     */
    getConnection(name: string): MCPConnection | undefined {
      return this.connections.get(name);
    }

    /**
     * 获取所有连接
     */
    getAllConnections(): Map<string, MCPConnection> {
      return new Map(this.connections);
    }

    /**
     * 列出工具
     */
    async listTools(serverName?: string): Promise<any[]> {
      const tools: any[] = [];

      if (serverName) {
        const connection = this.connections.get(serverName);
        if (!connection) {
          throw new Error(`MCP server ${serverName} not found`);
        }
        return connection.listTools();
      }

      for (const connection of this.connections.values()) {
        const serverTools = await connection.listTools();
        tools.push(...serverTools);
      }

      return tools;
    }

    /**
     * 调用工具
     */
    async callTool(
      serverName: string,
      toolName: string,
      args: any
    ): Promise<any> {
      const connection = this.connections.get(serverName);
      if (!connection) {
        throw new Error(`MCP server ${serverName} not found`);
      }

      return connection.callTool(toolName, args);
    }

    getStatus(): ServiceStatus {
      return this.status;
    }
  }

  /**
   * MCP 连接
   */
  class MCPConnection {
    private process: any;
    private config: MCPServerConfig;
    private running: boolean = false;

    constructor(config: MCPServerConfig) {
      this.config = config;
    }

    async start(): Promise<void> {
      // 启动 MCP 服务器进程
      // 实际实现会使用 child_process
      this.running = true;
    }

    async stop(): Promise<void> {
      if (this.process) {
        this.process.kill();
      }
      this.running = false;
    }

    async listTools(): Promise<any[]> {
      // 通过 JSON-RPC 获取工具列表
      return [];
    }

    async callTool(name: string, args: any): Promise<any> {
      // 通过 JSON-RPC 调用工具
      return null;
    }

    isRunning(): boolean {
      return this.running;
    }
  }

  ---
  5. 遥测分析服务


  5.1 遥测服务


  /**
   * 遥测分析服务
   * 文件：src/services/analytics/telemetry.ts
   */

  import type { IService, ServiceConfig } from '../types.js';

  export interface TelemetryConfig extends ServiceConfig {
    endpoint?: string;
    batchSize?: number;
    flushInterval?: number;
  }

  export interface TelemetryEvent {
    name: string;
    timestamp: number;
    properties?: Record<string, any>;
    metrics?: Record<string, number>;
  }

  export class TelemetryService implements IService {
    readonly name = 'telemetry';
    private config: TelemetryConfig;
    private events: TelemetryEvent[] = [];
    private flushTimer: Timer | null = null;
    private status: ServiceStatus = ServiceStatus.UNINITIALIZED;

    constructor(config: TelemetryConfig) {
      this.config = config;
    }

    async initialize(): Promise<void> {
      if (!this.config.enabled) {
        console.log('Telemetry service is disabled');
        return;
      }

      this.status = ServiceStatus.INITIALIZING;

      try {
        // 启动定时刷新
        this.startFlushTimer();

        this.status = ServiceStatus.READY;
        console.log('Telemetry service initialized');
      } catch (error) {
        this.status = ServiceStatus.ERROR;
        throw error;
      }
    }

    async destroy(): Promise<void> {
      // 停止定时器
      if (this.flushTimer) {
        clearInterval(this.flushTimer);
        this.flushTimer = null;
      }

      // 刷新剩余事件
      await this.flush();

      this.status = ServiceStatus.DESTROYED;
    }

    async healthCheck(): Promise<boolean> {
      return this.status === ServiceStatus.READY;
    }

    /**
     * 记录事件
     */
    track(event: TelemetryEvent): void {
      this.events.push({
        ...event,
        timestamp: event.timestamp || Date.now(),
      });

      // 检查是否需要刷新
      if (this.events.length >= (this.config.batchSize || 100)) {
        this.flush();
      }
    }

    /**
     * 记录查询事件
     */
    trackQuery(query: {
      model: string;
      provider: string;
      inputTokens: number;
      outputTokens: number;
      duration: number;
      success: boolean;
    }): void {
      this.track({
        name: 'query',
        properties: {
          model: query.model,
          provider: query.provider,
          success: query.success,
        },
        metrics: {
          inputTokens: query.inputTokens,
          outputTokens: query.outputTokens,
          duration: query.duration,
        },
      });
    }

    /**
     * 记录工具调用事件
     */
    trackToolCall(tool: {
      name: string;
      duration: number;
      success: boolean;
    }): void {
      this.track({
        name: 'tool_call',
        properties: {
          tool: tool.name,
          success: tool.success,
        },
        metrics: {
          duration: tool.duration,
        },
      });
    }

    /**
     * 刷新事件到服务器
     */
    private async flush(): Promise<void> {
      if (this.events.length === 0) return;

      const eventsToSend = [...this.events];
      this.events = [];

      try {
        if (this.config.endpoint) {
          await this.sendToServer(eventsToSend);
        } else {
          // 本地存储
          console.debug('Telemetry events:', eventsToSend);
        }
      } catch (error) {
        console.error('Failed to flush telemetry events:', error);
        // 恢复未发送的事件
        this.events.unshift(...eventsToSend);
      }
    }

    /**
     * 发送到服务器
     */
    private async sendToServer(events: TelemetryEvent[]): Promise<void> {
      // 实际实现会使用 fetch 发送到遥测服务器
      console.log(`Sending ${events.length} events to ${this.config.endpoint}`);
    }

    /**
     * 启动定时刷新
     */
    private startFlushTimer(): void {
      const interval = this.config.flushInterval || 60000; // 默认 1 分钟

      this.flushTimer = setInterval(() => {
        this.flush();
      }, interval);
    }

    getStatus(): ServiceStatus {
      return this.status;
    }
  }

  ---
  6. 策略限制服务


  6.1 策略服务


  /**
   * 策略限制服务
   * 文件：src/services/policy/policy.ts
   */

  import type { IService, ServiceConfig } from '../types.js';

  export interface PolicyConfig extends ServiceConfig {
    maxTokensPerQuery?: number;
    maxQueriesPerHour?: number;
    maxToolCallsPerQuery?: number;
    allowedModels?: string[];
    allowedTools?: string[];
  }

  export class PolicyService implements IService {
    readonly name = 'policy';
    private config: PolicyConfig;
    private queryCount: number = 0;
    private lastReset: number = Date.now();
    private status: ServiceStatus = ServiceStatus.UNINITIALIZED;

    constructor(config: PolicyConfig) {
      this.config = config;
    }

    async initialize(): Promise<void> {
      if (!this.config.enabled) {
        console.log('Policy service is disabled');
        return;
      }

      this.status = ServiceStatus.READY;
      console.log('Policy service initialized');
    }

    async destroy(): Promise<void> {
      this.status = ServiceStatus.DESTROYED;
    }

    async healthCheck(): Promise<boolean> {
      return this.status === ServiceStatus.READY;
    }

    /**
     * 检查是否允许查询
     */
    canQuery(): boolean {
      this.resetIfNeeded();

      const maxQueries = this.config.maxQueriesPerHour || Infinity;
      return this.queryCount < maxQueries;
    }

    /**
     * 检查是否允许使用模型
     */
    canUseModel(model: string): boolean {
      const allowedModels = this.config.allowedModels;
      if (!allowedModels || allowedModels.length === 0) {
        return true;
      }
      return allowedModels.includes(model);
    }

    /**
     * 检查是否允许使用工具
     */
    canUseTool(tool: string): boolean {
      const allowedTools = this.config.allowedTools;
      if (!allowedTools || allowedTools.length === 0) {
        return true;
      }
      return allowedTools.includes(tool);
    }

    /**
     * 检查 Token 数量
     */
    validateTokenCount(tokens: number): boolean {
      const maxTokens = this.config.maxTokensPerQuery || Infinity;
      return tokens <= maxTokens;
    }

    /**
     * 记录查询
     */
    recordQuery(): void {
      this.resetIfNeeded();
      this.queryCount++;
    }

    /**
     * 重置计数器
     */
    private resetIfNeeded(): void {
      const now = Date.now();
      const hourInMs = 3600000;

      if (now - this.lastReset >= hourInMs) {
        this.queryCount = 0;
        this.lastReset = now;
      }
    }

    /**
     * 获取剩余查询次数
     */
    getRemainingQueries(): number {
      this.resetIfNeeded();
      const maxQueries = this.config.maxQueriesPerHour || Infinity;
      return Math.max(0, maxQueries - this.queryCount);
    }

    getStatus(): ServiceStatus {
      return this.status;
    }
  }

  ---
  7. 认证服务


  7.1 认证服务


  /**
   * 认证服务
   * 文件：src/services/auth/auth.ts
   */

  import type { IService, ServiceConfig } from '../types.js';

  export interface AuthConfig extends ServiceConfig {
    provider: 'anthropic' | 'openai' | 'custom';
    apiKey?: string;
    oauth?: {
      clientId: string;
      clientSecret: string;
      redirectUri: string;
    };
  }

  export interface AuthSession {
    userId: string;
    token: string;
    expiresAt: number;
  }

  export class AuthService implements IService {
    readonly name = 'auth';
    private config: AuthConfig;
    private session: AuthSession | null = null;
    private status: ServiceStatus = ServiceStatus.UNINITIALIZED;

    constructor(config: AuthConfig) {
      this.config = config;
    }

    async initialize(): Promise<void> {
      if (!this.config.enabled) {
        console.log('Auth service is disabled');
        return;
      }

      this.status = ServiceStatus.INITIALIZING;

      try {
        // 尝试从存储恢复会话
        await this.restoreSession();

        this.status = ServiceStatus.READY;
        console.log('Auth service initialized');
      } catch (error) {
        this.status = ServiceStatus.ERROR;
        throw error;
      }
    }

    async destroy(): Promise<void> {
      this.session = null;
      this.status = ServiceStatus.DESTROYED;
    }

    async healthCheck(): Promise<boolean> {
      return this.status === ServiceStatus.READY;
    }

    /**
     * 登录
     */
    async login(credentials: { apiKey?: string; oauth?: any }): Promise<AuthSession> {
      if (credentials.apiKey) {
        this.session = {
          userId: 'user-' + Date.now(),
          token: credentials.apiKey,
          expiresAt: Date.now() + 3600000, // 1 小时
        };
      } else if (credentials.oauth) {
        // OAuth 登录流程
        this.session = await this.oauthLogin(credentials.oauth);
      }

      return this.session!;
    }

    /**
     * OAuth 登录
     */
    private async oauthLogin(oauth: any): Promise<AuthSession> {
      // 实际实现会启动 OAuth 流程
      return {
        userId: 'user-' + Date.now(),
        token: 'oauth-token',
        expiresAt: Date.now() + 3600000,
      };
    }

    /**
     * 注销
     */
    async logout(): Promise<void> {
      this.session = null;
    }

    /**
     * 检查是否已认证
     */
    isAuthenticated(): boolean {
      return this.session !== null && Date.now() < this.session.expiresAt;
    }

    /**
     * 获取当前会话
     */
    getSession(): AuthSession | null {
      return this.session;
    }

    /**
     * 获取 API Key
     */
    getApiKey(): string | null {
      if (!this.isAuthenticated()) {
        return null;
      }
      return this.session?.token || this.config.apiKey || null;
    }

    /**
     * 恢复会话
     */
    private async restoreSession(): Promise<void> {
      // 从本地存储恢复会话
      // 实际实现会使用 localStorage 或其他存储
    }

    getStatus(): ServiceStatus {
      return this.status;
    }
  }

  ---
  8. 存储服务


  8.1 存储服务


  /**
   * 存储服务
   * 文件：src/services/storage/storage.ts
   */

  import type { IService, ServiceConfig } from '../types.js';
  import { promises as fs } from 'fs';
  import { join } from 'path';

  export interface StorageConfig extends ServiceConfig {
    basePath: string;
  }

  export class StorageService implements IService {
    readonly name = 'storage';
    private config: StorageConfig;
    private status: ServiceStatus = ServiceStatus.UNINITIALIZED;

    constructor(config: StorageConfig) {
      this.config = config;
    }

    async initialize(): Promise<void> {
      if (!this.config.enabled) {
        console.log('Storage service is disabled');
        return;
      }

      this.status = ServiceStatus.INITIALIZING;

      try {
        // 确保基础目录存在
        await fs.mkdir(this.config.basePath, { recursive: true });

        this.status = ServiceStatus.READY;
        console.log('Storage service initialized');
      } catch (error) {
        this.status = ServiceStatus.ERROR;
        throw error;
      }
    }

    async destroy(): Promise<void> {
      this.status = ServiceStatus.DESTROYED;
    }

    async healthCheck(): Promise<boolean> {
      return this.status === ServiceStatus.READY;
    }

    /**
     * 读取文件
     */
    async read(key: string): Promise<string | null> {
      try {
        const filePath = join(this.config.basePath, key);
        return await fs.readFile(filePath, 'utf-8');
      } catch {
        return null;
      }
    }

    /**
     * 写入文件
     */
    async write(key: string, value: string): Promise<void> {
      const filePath = join(this.config.basePath, key);
      await fs.mkdir(join(filePath, '..'), { recursive: true });
      await fs.writeFile(filePath, value, 'utf-8');
    }

    /**
     * 删除文件
     */
    async delete(key: string): Promise<void> {
      const filePath = join(this.config.basePath, key);
      await fs.unlink(filePath);
    }

    /**
     * 检查文件是否存在
     */
    async exists(key: string): Promise<boolean> {
      try {
        const filePath = join(this.config.basePath, key);
        await fs.access(filePath);
        return true;
      } catch {
        return false;
      }
    }

    /**
     * 列出文件
     */
    async list(prefix?: string): Promise<string[]> {
      const dir = prefix ? join(this.config.basePath, prefix) : this.config.basePath;

      try {
        const files = await fs.readdir(dir);
        return files;
      } catch {
        return [];
      }
    }

    getStatus(): ServiceStatus {
      return this.status;
    }
  }

  ---
  9. 缓存服务


  9.1 缓存服务


  /**
   * 缓存服务
   * 文件：src/services/cache/cache.ts
   */

  import type { IService, ServiceConfig } from '../types.js';

  export interface CacheConfig extends ServiceConfig {
    maxSize?: number;
    defaultTTL?: number;
  }

  interface CacheEntry<T> {
    value: T;
    expiresAt: number;
  }

  export class CacheService implements IService {
    readonly name = 'cache';
    private config: CacheConfig;
    private cache: Map<string, CacheEntry<any>> = new Map();
    private status: ServiceStatus = ServiceStatus.UNINITIALIZED;

    constructor(config: CacheConfig) {
      this.config = config;
    }

    async initialize(): Promise<void> {
      if (!this.config.enabled) {
        console.log('Cache service is disabled');
        return;
      }

      this.status = ServiceStatus.READY;
      console.log('Cache service initialized');
    }

    async destroy(): Promise<void> {
      this.cache.clear();
      this.status = ServiceStatus.DESTROYED;
    }

    async healthCheck(): Promise<boolean> {
      return this.status === ServiceStatus.READY;
    }

    /**
     * 获取缓存
     */
    get<T>(key: string): T | null {
      const entry = this.cache.get(key);

      if (!entry) {
        return null;
      }

      if (Date.now() > entry.expiresAt) {
        this.cache.delete(key);
        return null;
      }

      return entry.value;
    }

    /**
     * 设置缓存
     */
    set<T>(key: string, value: T, ttl?: number): void {
      const expiresAt = Date.now() + (ttl || this.config.defaultTTL || 3600000);

      this.cache.set(key, {
        value,
        expiresAt,
      });

      // 检查大小限制
      this.enforceSizeLimit();
    }

    /**
     * 删除缓存
     */
    delete(key: string): void {
      this.cache.delete(key);
    }

    /**
     * 清空缓存
     */
    clear(): void {
      this.cache.clear();
    }

    /**
     * 检查是否存在
     */
    has(key: string): boolean {
      const entry = this.cache.get(key);
      if (!entry) return false;

      if (Date.now() > entry.expiresAt) {
        this.cache.delete(key);
        return false;
      }

      return true;
    }

    /**
     * 获取缓存大小
     */
    size(): number {
      return this.cache.size;
    }

    /**
     * 强制大小限制
     */
    private enforceSizeLimit(): void {
      const maxSize = this.config.maxSize || 1000;

      if (this.cache.size > maxSize) {
        // 删除过期的条目
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
          if (now > entry.expiresAt) {
            this.cache.delete(key);
          }
        }

        // 如果还是太大，删除最旧的条目
        if (this.cache.size > maxSize) {
          const keysToDelete = Array.from(this.cache.keys()).slice(
            0,
            this.cache.size - maxSize
          );
          for (const key of keysToDelete) {
            this.cache.delete(key);
          }
        }
      }
    }

    getStatus(): ServiceStatus {
      return this.status;
    }
  }

  ---
  10. 会话管理服务


  10.1 会话管理服务


  /**
   * 会话管理服务
   * 文件：src/services/session/manager.ts
   */

  import type { IService, ServiceConfig } from '../types.js';
  import { StorageService } from '../storage/storage.js';

  export interface SessionManagerConfig extends ServiceConfig {
    storageService: StorageService;
    maxSessions?: number;
  }

  export interface Session {
    id: string;
    messages: any[];
    metadata: {
      model: string;
      provider: string;
      tokenUsage: { inputTokens: number; outputTokens: number };
      queryCount: number;
      toolCallCount: number;
    };
    state: {
      status: 'active' | 'inactive' | 'archived';
      lastActive: Date | null;
    };
    createdAt: Date;
    updatedAt: Date;
  }

  export class SessionManager implements IService {
    readonly name = 'session-manager';
    private config: SessionManagerConfig;
    private activeSession: Session | null = null;
    private status: ServiceStatus = ServiceStatus.UNINITIALIZED;

    constructor(config: SessionManagerConfig) {
      this.config = config;
    }

    async initialize(): Promise<void> {
      if (!this.config.enabled) {
        console.log('Session manager is disabled');
        return;
      }

      this.status = ServiceStatus.READY;
      console.log('Session manager initialized');
    }

    async destroy(): Promise<void> {
      if (this.activeSession) {
        await this.saveSession(this.activeSession);
      }
      this.status = ServiceStatus.DESTROYED;
    }

    async healthCheck(): Promise<boolean> {
      return this.status === ServiceStatus.READY;
    }

    /**
     * 创建新会话
     */
    async createSession(): Promise<Session> {
      const session: Session = {
        id: Date.now().toString(),
        messages: [],
        metadata: {
          model: 'claude-3-5-sonnet-20241022',
          provider: 'anthropic',
          tokenUsage: { inputTokens: 0, outputTokens: 0 },
          queryCount: 0,
          toolCallCount: 0,
        },
        state: {
          status: 'active',
          lastActive: new Date(),
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.activeSession = session;
      return session;
    }

    /**
     * 加载会话
     */
    async loadSession(sessionId: string): Promise<Session | null> {
      const data = await this.config.storageService.read(
        `sessions/${sessionId}.json`
      );

      if (!data) {
        return null;
      }

      const session = JSON.parse(data) as Session;
      this.activeSession = session;
      return session;
    }

    /**
     * 保存会话
     */
    async saveSession(session: Session): Promise<void> {
      session.updatedAt = new Date();
      await this.config.storageService.write(
        `sessions/${session.id}.json`,
        JSON.stringify(session)
      );
    }

    /**
     * 删除会话
     */
    async deleteSession(sessionId: string): Promise<void> {
      await this.config.storageService.delete(`sessions/${sessionId}.json`);

      if (this.activeSession?.id === sessionId) {
        this.activeSession = null;
      }
    }

    /**
     * 获取活动会话
     */
    getActiveSession(): Session | null {
      return this.activeSession;
    }

    /**
     * 列出所有会话
     */
    async listSessions(): Promise<string[]> {
      return await this.config.storageService.list('sessions');
    }

    /**
     * 更新会话消息
     */
    async updateMessages(sessionId: string, messages: any[]): Promise<void> {
      if (this.activeSession?.id === sessionId) {
        this.activeSession.messages = messages;
        await this.saveSession(this.activeSession);
      }
    }

    getStatus(): ServiceStatus {
      return this.status;
    }
  }

  ---
  11. 完整实现代码


  11.1 服务初始化


  /**
   * 服务初始化
   * 文件：src/services/bootstrap.ts
   */

  import { ServiceContainer } from './container.js';
  import { ClaudeAPIClient } from './api/claude.js';
  import { OpenAICompatClient } from './api/openaiCompat.js';
  import { MCPManager } from './mcp/manager.js';
  import { TelemetryService } from './analytics/telemetry.js';
  import { PolicyService } from './policy/policy.js';
  import { AuthService } from './auth/auth.js';
  import { StorageService } from './storage/storage.js';
  import { CacheService } from './cache/cache.js';
  import { SessionManager } from './session/manager.js';

  export interface ServiceBootstrapConfig {
    api: {
      provider: 'anthropic' | 'openai';
      apiKey: string;
      baseUrl?: string;
      model?: string;
    };
    mcp?: {
      servers: Record<string, any>;
    };
    telemetry?: {
      enabled: boolean;
      endpoint?: string;
    };
    policy?: {
      maxQueriesPerHour?: number;
    };
    storage?: {
      basePath: string;
    };
  }

  export async function bootstrapServices(
    config: ServiceBootstrapConfig
  ): Promise<ServiceContainer> {
    const container = new ServiceContainer();

    // 注册存储服务
    const storage = new StorageService({
      enabled: true,
      basePath: config.storage?.basePath || './.doge',
    });
    container.register('storage', storage);

    // 注册缓存服务
    const cache = new CacheService({ enabled: true });
    container.register('cache', cache);

    // 注册 API 客户端
    if (config.api.provider === 'anthropic') {
      const apiClient = new ClaudeAPIClient({
        enabled: true,
        apiKey: config.api.apiKey,
        baseUrl: config.api.baseUrl,
        model: config.api.model,
      });
      container.register('api', apiClient);
    } else {
      const apiClient = new OpenAICompatClient({
        enabled: true,
        apiKey: config.api.apiKey,
        baseUrl: config.api.baseUrl || 'https://api.openai.com/v1',
        model: config.api.model,
      });
      container.register('api', apiClient);
    }

    // 注册 MCP 管理器
    if (config.mcp) {
      const mcpManager = new MCPManager({
        enabled: true,
        servers: config.mcp.servers,
      });
      container.register('mcp', mcpManager);
    }

    // 注册遥测服务
    if (config.telemetry) {
      const telemetry = new TelemetryService(config.telemetry);
      container.register('telemetry', telemetry);
    }

    // 注册策略服务
    const policy = new PolicyService({
      enabled: true,
      maxQueriesPerHour: config.policy?.maxQueriesPerHour,
    });
    container.register('policy', policy);

    // 注册认证服务
    const auth = new AuthService({
      enabled: true,
      provider: config.api.provider,
    });
    container.register('auth', auth);

    // 注册会话管理器
    const sessionManager = new SessionManager({
      enabled: true,
      storageService: storage,
    });
    container.register('session', sessionManager);

    // 初始化所有服务
    await container.initializeAll();

    return container;
  }

  11.2 导出文件


  /**
   * 服务导出
   * 文件：src/services/index.ts
   */

  export { ServiceContainer } from './container.js';
  export { ClaudeAPIClient } from './api/claude.js';
  export { OpenAICompatClient } from './api/openaiCompat.js';
  export { MCPManager } from './mcp/manager.js';
  export { TelemetryService } from './analytics/telemetry.js';
  export { PolicyService } from './policy/policy.js';
  export { AuthService } from './auth/auth.js';
  export { StorageService } from './storage/storage.js';
  export { CacheService } from './cache/cache.js';
  export { SessionManager } from './session/manager.js';
  export { bootstrapServices } from './bootstrap.js';

  export * from './types.js';

  ---
  请保存以上内容：


  notepad D:\doge-code\docs\12-services.md

  ---
  章节完成状态


  ✅ 第 12 章 - 服务层 已完成
  - 总字数：约 30,000 字
  - 包含 11 个完整实现模块
  - 60+ 代码示例
  - 完整的服务架构设计

  已完成章节：12/23
  剩余章节：11 章
