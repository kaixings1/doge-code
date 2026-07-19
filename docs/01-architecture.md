  01 - 架构设计（约 30000 字）


  目录


  1. 架构原则
  2. 分层架构
  3. 核心模块划分
  4. 数据流设计
  5. 依赖关系
  6. 扩展机制
  7. 设计模式
  8. 架构决策记录

  ---
  1. 架构原则


  1.1 核心设计原则


  1.1.1 单一职责原则（SRP）


  每个模块只负责一个明确的功能：

  ✅ 正确示例：
  src/tools/FileReadTool/     — 只负责文件读取
  src/tools/FileWriteTool/    — 只负责文件写入
  src/tools/GrepTool/         — 只负责内容搜索

  ❌ 错误示例：
  src/tools/FileSystemTool/   — 混合了读取、写入、搜索

  1.1.2 开闭原则（OCP）


  对扩展开放，对修改关闭：

  // ✅ 扩展开放：通过注册机制添加新工具
  ToolRegistry.register('CustomTool', CustomToolImplementation);

  // ✅ 修改关闭：核心引擎不因新工具而改变
  class QueryEngine {
    async executeTool(toolName: string, params: any) {
      const tool = ToolRegistry.get(toolName);
      return tool.execute(params); // 核心逻辑不变
    }
  }

  1.1.3 依赖倒置原则（DIP）


  高层模块不依赖低层模块，都依赖抽象：

  // ✅ 正确：依赖抽象接口
  interface IAPIClient {
    sendMessage(params: MessageParams): Promise<Response>;
  }

  class QueryEngine {
    constructor(private apiClient: IAPIClient) {}
  }

  // 低层实现
  class ClaudeAPIClient implements IAPIClient { }
  class OpenAIAPIClient implements IAPIClient { }

  1.1.4 接口隔离原则（ISP）


  接口要小而专一：

  // ❌ 臃肿接口
  interface ITool {
    execute(params: any): Promise<any>;
    validate(params: any): boolean;
    formatOutput(result: any): string;
    handleError(error: Error): void;
    logExecution(): void;
  }

  // ✅ 拆分接口
  interface IToolExecutor {
    execute(params: any): Promise<any>;
  }

  interface IToolValidator {
    validate(params: any): ValidationResult;
  }

  interface IToolFormatter {
    formatOutput(result: any): string;
  }

  1.2 架构目标


  1.2.1 可扩展性


  - 工具扩展：通过注册机制添加新工具，无需修改核心引擎
  - 命令扩展：通过目录结构添加新命令，自动发现注册
  - 插件扩展：完整的插件生命周期管理，支持第三方扩展
  - 技能扩展：热加载机制，运行时动态添加技能

  1.2.2 可维护性


  - 模块化：清晰模块边界，低耦合高内聚
  - 类型安全：TypeScript 严格类型检查
  - 文档完整：代码注释 + API 文档 + 架构文档
  - 测试覆盖：单元测试 + 集成测试 + E2E 测试

  1.2.3 性能


  - 快速启动：快速路径优化，跳过不必要加载
  - 流式响应：SSE/WebSocket 流式传输，实时输出
  - 内存优化：会话历史限制，缓存 LRU 策略
  - 并发控制：工具并行执行，连接池管理

  1.2.4 安全性


  - 权限控制：分级权限，用户授权流程
  - 沙箱隔离：插件执行隔离，资源访问控制
  - 输入验证：参数类型检查，注入防护
  - 审计日志：操作记录，安全审计

  ---
  2. 分层架构


  2.1 架构全景图


  ┌─────────────────────────────────────────────────────────────┐
  │                    Presentation Layer                        │
  │  ┌─────────────────────────────────────────────────────┐    │
  │  │  Ink TUI Components (src/components/)                │    │
  │  │  - PromptInput / StatusLine / TaskList / etc.        │    │
  │  └─────────────────────────────────────────────────────┘    │
  │  ┌─────────────────────────────────────────────────────┐    │
  │  │  React Hooks (src/hooks/)                            │    │
  │  │  - useSession / useQuery / useTools / etc.           │    │
  │  └─────────────────────────────────────────────────────┘    │
  └─────────────────────────────────────────────────────────────┘
                                ↓
  ┌─────────────────────────────────────────────────────────────┐
  │                    Application Layer                         │
  │  ┌─────────────────────────────────────────────────────┐    │
  │  │  Query Engine (src/query.ts + QueryEngine.ts)        │    │
  │  │  - 消息循环 / 状态机 / 工具调度 / Token 预算           │    │
  │  └─────────────────────────────────────────────────────┘    │
  │  ┌─────────────────────────────────────────────────────┐    │
  │  │  Command Registry (src/commands.ts + commands/)      │    │
  │  │  - 155+ 斜杠命令注册与执行                             │    │
  │  └─────────────────────────────────────────────────────┘    │
  │  ┌─────────────────────────────────────────────────────┐    │
  │  │  Tool Registry (src/tools.ts + tools/)               │    │
  │  │  - 85+ 工具注册与调度                                 │    │
  │  └─────────────────────────────────────────────────────┘    │
  └─────────────────────────────────────────────────────────────┘
                                ↓
  ┌─────────────────────────────────────────────────────────────┐
  │                    Business Logic Layer                      │
  │  ┌─────────────────────────────────────────────────────┐    │
  │  │  Core Logic (src/core.ts)                            │    │
  │  │  - 消息处理 / 上下文管理 / 结果聚合                     │    │
  │  └─────────────────────────────────────────────────────┘    │
  │  ┌─────────────────────────────────────────────────────┐    │
  │  │  Skill System (src/skills/)                           │    │
  │  │  - 技能加载 / 索引 / 执行                              │    │
  │  └─────────────────────────────────────────────────────┘    │
  │  ┌─────────────────────────────────────────────────────┐    │
  │  │  Plugin System (src/plugins/ + utils/plugins/)        │    │
  │  │  - 插件生命周期 / 依赖解析 / 沙箱                       │    │
  │  └─────────────────────────────────────────────────────┘    │
  └─────────────────────────────────────────────────────────────┘
                                ↓
  ┌─────────────────────────────────────────────────────────────┐
  │                    Service Layer                             │
  │  ┌─────────────────────────────────────────────────────┐    │
  │  │  API Services (src/services/api/)                     │    │
  │  │  - Claude Client / OpenAI Client / Bridge             │    │
  │  └─────────────────────────────────────────────────────┘    │
  │  ┌─────────────────────────────────────────────────────┐    │
  │  │  MCP Service (src/services/mcp/)                      │    │
  │  │  - Connection / Tool Proxy / Resource                 │    │
  │  └─────────────────────────────────────────────────────┘    │
  │  ┌─────────────────────────────────────────────────────┐    │
  │  │  Analytics Service (src/services/analytics/)          │    │
  │  │  - 遥测 / 性能监控 / 用户行为                          │    │
  │  └─────────────────────────────────────────────────────┘    │
  │  ┌─────────────────────────────────────────────────────┐    │
  │  │  Policy Service (src/services/policy/)                │    │
  │  │  - 策略限制 / 额度管理 / 功能开关                       │    │
  │  └─────────────────────────────────────────────────────┘    │
  └─────────────────────────────────────────────────────────────┘
                                ↓
  ┌─────────────────────────────────────────────────────────────┐
  │                    Infrastructure Layer                      │
  │  ┌─────────────────────────────────────────────────────┐    │
  │  │  File System (src/utils/fs/)                          │    │
  │  │  - 文件读写 / 目录扫描 / Git 操作                       │    │
  │  └─────────────────────────────────────────────────────┘    │
  │  ┌─────────────────────────────────────────────────────┐    │
  │  │  Network (src/utils/network/)                         │    │
  │  │  - HTTP 客户端 / SSE / WebSocket                       │    │
  │  └─────────────────────────────────────────────────────┘    │
  │  ┌─────────────────────────────────────────────────────┐    │
  │  │  Process (src/utils/process/)                         │    │
  │  │  - 子进程管理 / Shell 执行 / 超时控制                   │    │
  │  └─────────────────────────────────────────────────────┘    │
  │  ┌─────────────────────────────────────────────────────┐    │
  │  │  Storage (src/utils/storage/)                         │    │
  │  │  - 配置存储 / 会话持久化 / 缓存                         │    │
  │  └─────────────────────────────────────────────────────┘    │
  └─────────────────────────────────────────────────────────────┘

  2.2 各层职责


  2.2.1 Presentation Layer（表示层）


  职责：
  - 渲染终端 UI（Ink TUI）
  - 处理用户输入
  - 显示输出结果
  - 状态显示与更新

  关键模块：
  - src/components/ — 120+ UI 组件
  - src/hooks/ — 100+ React hooks
  - src/screens/ — 全屏屏幕组件
  - src/ink/ — 自维护 Ink 框架

  设计约束：
  - 纯 UI 逻辑，不包含业务逻辑
  - 通过 Hooks 访问应用状态
  - 组件可复用、可组合

  2.2.2 Application Layer（应用层）


  职责：
  - 协调业务逻辑执行
  - 管理应用状态
  - 处理命令与工具调度
  - 消息循环控制

  关键模块：
  - src/query.ts — 主消息循环（1503 行）
  - src/QueryEngine.ts — 查询执行引擎（1254 行）
  - src/commands.ts — 命令注册中心（823 行）
  - src/tools.ts — 工具注册中心（442 行）

  设计约束：
  - 不直接操作基础设施
  - 通过 Service 层访问外部资源
  - 管理跨模块事务

  2.2.3 Business Logic Layer（业务逻辑层）


  职责：
  - 实现核心业务规则
  - 技能与插件管理
  - 上下文构建与维护
  - 消息处理与转换

  关键模块：
  - src/core.ts — 核心逻辑（1236 行）
  - src/context.ts — 全局上下文（220 行）
  - src/skills/ — 技能系统
  - src/plugins/ — 插件管理

  设计约束：
  - 不依赖具体实现
  - 可独立测试
  - 业务规则集中管理

  2.2.4 Service Layer（服务层）


  职责：
  - 封装外部系统访问
  - API 客户端管理
  - MCP 连接管理
  - 遥测与策略服务

  关键模块：
  - src/services/api/ — API 客户端
  - src/services/mcp/ — MCP 服务
  - src/services/analytics/ — 遥测分析
  - src/services/policy/ — 策略限制

  设计约束：
  - 提供统一接口
  - 处理错误与重试
  - 管理连接生命周期

  2.2.5 Infrastructure Layer（基础设施层）


  职责：
  - 文件系统操作
  - 网络通信
  - 进程管理
  - 存储访问

  关键模块：
  - src/utils/fs/ — 文件系统
  - src/utils/network/ — 网络工具
  - src/utils/process/ — 进程工具
  - src/utils/storage/ — 存储工具

  设计约束：
  - 平台无关抽象
  - 错误传播
  - 资源管理

  ---
  3. 核心模块划分


  3.1 模块依赖图


  ┌─────────────────────────────────────────────────────────────┐
  │                      bootstrap-entry                         │
  │                    (环境变量设置 + 配置加载)                   │
  └──────────────────────────┬──────────────────────────────────┘
                             ↓
  ┌─────────────────────────────────────────────────────────────┐
  │                     entrypoints/cli                          │
  │                    (CLI 参数解析 + 快速路径)                   │
  └──────────────────────────┬──────────────────────────────────┘
                             ↓
  ┌─────────────────────────────────────────────────────────────┐
  │                         main.tsx                             │
  │            (初始化 + 状态管理 + UI 渲染入口)                   │
  └──────────────────────────┬──────────────────────────────────┘
                             ↓
           ┌─────────────────┼─────────────────┐
           ↓                 ↓                 ↓
  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
  │  query.ts   │    │ commands.ts │    │  tools.ts   │
  │ (消息循环)  │    │ (命令注册)  │    │ (工具注册)  │
  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘
         │                  │                  │
         └──────────────────┼──────────────────┘
                            ↓
                   ┌─────────────────┐
                   │     core.ts     │
                   │  (核心逻辑)     │
                   └────────┬────────┘
                            ↓
           ┌────────────────┼────────────────┐
           ↓                ↓                ↓
  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
  │   skills/   │   │  plugins/   │   │   bridge/   │
  │  (技能系统) │   │ (插件系统)  │   │ (协议转换)  │
  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
         │                 │                 │
         └─────────────────┼─────────────────┘
                           ↓
                  ┌─────────────────┐
                  │   services/     │
                  │  (服务层)       │
                  └────────┬────────┘
                           ↓
           ┌───────────────┼───────────────┐
           ↓               ↓               ↓
  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
  │   utils/    │  │  constants/ │  │   types/    │
  │ (工具函数)  │  │  (常量)     │  │  (类型)     │
  └─────────────┘  └─────────────┘  └─────────────┘

  3.2 核心模块详细划分


  3.2.1 启动模块


  src/bootstrap/
  ├── bootstrap-entry.ts      # 启动入口（环境变量设置）
  ├── config.ts               # 配置加载逻辑
  ├── env.ts                  # 环境变量处理
  ├── preset.ts               # 预设管理
  └── state.ts                # 启动状态

  职责：
  - 读取配置文件（~/.doge/api.json 或 .doge/api.json）
  - 设置环境变量（ANTHROPIC_API_KEY、ANTHROPIC_BASE_URL 等）
  - 加载预设配置
  - 初始化启动状态

  3.2.2 入口模块


  src/entrypoints/
  ├── cli.tsx                 # CLI 入口（参数解析 + 快速路径）
  ├── daemon.ts               # 守护进程入口
  ├── bridge.ts               # Bridge 服务器入口
  └── remote.ts               # 远程控制入口

  职责：
  - 解析 CLI 参数
  - 快速路径判断（--version、--help、daemon 等）
  - 启动对应模式

  3.2.3 查询引擎模块


  src/query/
  ├── query.ts                # 主消息循环
  ├── QueryEngine.ts          # 查询执行引擎
  ├── states/
  │   ├── idle.ts             # idle 状态
  │   ├── responding.ts       # responding 状态
  │   ├── needs_user.ts       # needs_user 状态
  │   └── done.ts             # 终止状态
  ├── handlers/
  │   ├── toolHandler.ts      # 工具调用处理
  │   ├── messageHandler.ts   # 消息处理
  │   └── errorHandler.ts     # 错误处理
  └── utils/
      ├── tokenBudget.ts      # Token 预算控制
      ├── autoCompact.ts      # 自动压缩
      └── recovery.ts         # 错误恢复

  职责：
  - 状态机管理
  - 消息循环控制
  - 工具调用调度
  - Token 预算控制
  - 错误恢复

  3.2.4 命令模块


  src/commands/
  ├── commands.ts             # 命令注册中心
  ├── clear/                  # /clear 命令
  ├── model/                  # /model 命令
  ├── backup/                 # /backup 命令
  ├── resume/                 # /resume 命令
  ├── compact/                # /compact 命令
  ├── mcp/                    # /mcp 命令
  ├── plugin/                 # /plugins 命令（19 文件）
  ├── agents/                 # /agents 命令
  ├── buddy/                  # /buddy 命令
  ├── database/               # /database 命令
  └── ... (155+ 命令)

  职责：
  - 命令注册与发现
  - 命令解析与执行
  - 命令结果处理

  3.2.5 工具模块


  src/tools/
  ├── tools.ts                # 工具注册中心
  ├── BashTool/               # Bash 执行
  ├── FileReadTool/           # 文件读取
  ├── FileWriteTool/          # 文件写入
  ├── MultiFileEditTool/      # 多文件编辑
  ├── GrepTool/               # 内容搜索
  ├── GlobTool/               # 文件匹配
  ├── MCPTool/                # MCP 工具代理
  ├── AgentTool/              # 子代理执行
  ├── SkillTool/              # 技能执行
  ├── WebSearchTool/          # 网络搜索
  ├── WebFetchTool/           # 网页抓取
  ├── TodoWriteTool/          # 待办事项
  └── ... (85+ 工具)

  职责：
  - 工具注册与发现
  - 工具执行与超时控制
  - 权限检查
  - 结果格式化

  3.2.6 Bridge 模块


  src/bridge/
  ├── index.ts                # Bridge 入口
  ├── protocol/
  │   ├── openai-to-anthropic.ts    # OpenAI → Anthropic
  │   ├── anthropic-to-openai.ts    # Anthropic → OpenAI
  │   └── messageConverter.ts       # 消息转换
  ├── transport/
  │   ├── sse.ts              # SSE 流式传输
  │   ├── websocket.ts        # WebSocket 流式传输
  │   └── polling.ts          # 轮询机制
  ├── session/
  │   ├── sessionManager.ts   # 会话管理
  │   ├── sessionStore.ts     # 会话存储
  │   └── sessionAuth.ts      # 会话认证
  └── error/
      ├── errorMapper.ts      # 错误映射
      └── retryPolicy.ts      # 重试策略

  职责：
  - OpenAI ↔ Anthropic 协议转换
  - 流式传输适配
  - 会话管理
  - 错误处理与重试

  3.2.7 服务模块


  src/services/
  ├── api/
  │   ├── claude.ts           # Claude API 客户端
  │   ├── openaiCompat.ts     # OpenAI 兼容客户端
  │   ├── bootstrap.ts        # 客户端选择
  │   ├── withRetry.ts        # 重试逻辑
  │   ├── errors.ts           # 错误分类
  │   └── filesApi.ts         # 文件上传 API
  ├── mcp/
  │   ├── connection.ts       # MCP 连接管理
  │   ├── toolProxy.ts        # 工具代理
  │   ├── resourceProxy.ts    # 资源代理
  │   └── auth.ts             # MCP 认证
  ├── analytics/
  │   ├── telemetry.ts        # 遥测
  │   ├── metrics.ts          # 性能指标
  │   └── usage.ts            # 使用统计
  ├── policy/
  │   ├── limits.ts           # 策略限制
  │   ├── quota.ts            # 额度管理
  │   └── features.ts         # 功能开关
  ├── compact/
  │   ├── autoCompact.ts      # 自动压缩
  │   └── strategies.ts       # 压缩策略
  └── ... (30+ 子目录)

  职责：
  - API 客户端封装
  - MCP 服务集成
  - 遥测与监控
  - 策略与限制

  ---
  4. 数据流设计


  4.1 主流程数据流


  用户输入
      ↓
  ┌─────────────────────────────────────────────────────────────┐
  │  Presentation Layer                                          │
  │  PromptInput → handleUserInput() → dispatch({ type: 'SEND' }) │
  └──────────────────────────┬──────────────────────────────────┘
                             ↓
  ┌─────────────────────────────────────────────────────────────┐
  │  Application Layer                                           │
  │  QueryEngine → transition('responding')                      │
  │  → normalizeMessages() → buildRequest()                      │
  └──────────────────────────┬──────────────────────────────────┘
                             ↓
  ┌─────────────────────────────────────────────────────────────┐
  │  Service Layer                                               │
  │  APIClient → sendMessage(request) → streamResponse()         │
  └──────────────────────────┬──────────────────────────────────┘
                             ↓
  ┌─────────────────────────────────────────────────────────────┐
  │  Business Logic Layer                                        │
  │  ResponseHandler → parseResponse() → detectToolUse()         │
  │  → executeTools() → aggregateResults()                       │
  └──────────────────────────┬──────────────────────────────────┘
                             ↓
  ┌─────────────────────────────────────────────────────────────┐
  │  Infrastructure Layer                                        │
  │  ToolExecutor → executeTool() → returnResults()              │
  └──────────────────────────┬──────────────────────────────────┘
                             ↓
           ┌─────────────────┼─────────────────┐
           ↓                 ↓                 ↓
      渲染输出          继续对话           终止会话

  4.2 工具调用数据流


  API 响应包含 tool_use
      ↓
  ┌─────────────────────────────────────────────────────────────┐
  │  QueryEngine                                                 │
  │  detectToolUse(response) → extractToolCalls()                │
  └──────────────────────────┬──────────────────────────────────┘
                             ↓
  ┌─────────────────────────────────────────────────────────────┐
  │  ToolRegistry                                                │
  │  getTool(toolName) → validateParams(params)                  │
  └──────────────────────────┬──────────────────────────────────┘
                             ↓
  ┌─────────────────────────────────────────────────────────────┐
  │  Permission Check                                            │
  │  checkPermission(tool, params) → requestAuthorization()     │
  │  → userApprove()                                             │
  └──────────────────────────┬──────────────────────────────────┘
                             ↓
  ┌─────────────────────────────────────────────────────────────┐
  │  Tool Execution                                              │
  │  tool.execute(params) → handleProgress() → returnResult()   │
  └──────────────────────────┬──────────────────────────────────┘
                             ↓
  ┌─────────────────────────────────────────────────────────────┐
  │  Result Processing                                           │
  │  formatResult(result) → buildToolResult()                    │
  │  → append to conversation                                    │
  └──────────────────────────┬──────────────────────────────────┘
                             ↓
                  继续消息循环（发送工具结果）

  4.3 命令处理数据流


  用户输入 /command args
      ↓
  ┌─────────────────────────────────────────────────────────────┐
  │  PromptInput                                                 │
  │  parseCommand(input) → extractCommand() → { name, args }     │
  └──────────────────────────┬──────────────────────────────────┘
                             ↓
  ┌─────────────────────────────────────────────────────────────┐
  │  CommandRegistry                                             │
  │  getCommand(name) → validateArgs(args)                       │
  └──────────────────────────┬──────────────────────────────────┘
                             ↓
  ┌─────────────────────────────────────────────────────────────┐
  │  Command Execution                                           │
  │  command.execute(args) → handleInteractive() / executeDirect() │
  └──────────────────────────┬──────────────────────────────────┘
                             ↓
           ┌─────────────────┼─────────────────┐
           ↓                 ↓                 ↓
      直接返回结果      启动交互流程        启动后台任务
           ↓                 ↓                 ↓
      显示输出          渲染 UI 组件       异步执行并通知

  ---
  5. 依赖关系


  5.1 模块依赖矩阵

  ┌─────────────────┬────────────────────────────────────┐
  │      模块       │               依赖项               │
  ├─────────────────┼────────────────────────────────────┤
  │ bootstrap-entry │ config, env, preset                │
  ├─────────────────┼────────────────────────────────────┤
  │ cli             │ bootstrap, query, commands, tools  │
  ├─────────────────┼────────────────────────────────────┤
  │ main            │ query, services, hooks, components │
  ├─────────────────┼────────────────────────────────────┤
  │ query           │ core, services/api, tools, skills  │
  ├─────────────────┼────────────────────────────────────┤
  │ commands        │ core, services, utils              │
  ├─────────────────┼────────────────────────────────────┤
  │ tools           │ core, utils, services/mcp          │
  ├─────────────────┼────────────────────────────────────┤
  │ core            │ context, utils                     │
  ├─────────────────┼────────────────────────────────────┤
  │ skills          │ utils, constants                   │
  ├─────────────────┼────────────────────────────────────┤
  │ plugins         │ utils, commands, tools             │
  ├─────────────────┼────────────────────────────────────┤
  │ bridge          │ services/api, utils                │
  ├─────────────────┼────────────────────────────────────┤
  │ services        │ utils, constants                   │
  ├─────────────────┼────────────────────────────────────┤
  │ utils           │ constants, types                   │
  ├─────────────────┼────────────────────────────────────┤
  │ constants       │ types                              │
  ├─────────────────┼────────────────────────────────────┤
  │ types           │ —                                  │
  └─────────────────┴────────────────────────────────────┘

  5.2 循环依赖检测


  # 使用工具检测循环依赖
  npx madge --circular src/

  避免循环依赖的策略：
  1. 提取共享接口到 types/
  2. 使用依赖注入而非直接导入
  3. 事件总线解耦
  4. 分层架构（单向依赖）

  ---
  6. 扩展机制


  6.1 工具扩展


  注册机制：

  // src/tools.ts
  const toolRegistry = new Map<string, Tool>();

  export function registerTool(name: string, tool: Tool) {
    toolRegistry.set(name, tool);
  }

  export function getTool(name: string): Tool | undefined {
    return toolRegistry.get(name);
  }

  实现新工具：

  // src/tools/MyCustomTool/index.ts
  import { Tool } from '../../Tool.js';
  import type { ToolResult } from '../../types.js';

  export class MyCustomTool extends Tool {
    name = 'my_custom_tool';
    description = 'My custom tool description';

    parameters = {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'Input parameter' }
      },
      required: ['input']
    };

    async execute(params: { input: string }): Promise<ToolResult> {
      // 实现逻辑
      return {
        success: true,
        output: `Processed: ${params.input}`
      };
    }
  }

  // 注册工具
  import { registerTool } from '../../tools.js';
  registerTool('my_custom_tool', new MyCustomTool());

  6.2 命令扩展


  目录结构约定：

  src/commands/
  └── my-command/
      ├── index.ts      # 命令实现
      └── types.ts     # 类型定义

  命令注册：

  // src/commands.ts
  import { lazy } from './utils/lazy.js';

  export const commands = {
    '/my-command': lazy(() => import('./my-command/index.js').then(m => m.default)),
    // ... 其他命令
  };

  实现新命令：

  // src/commands/my-command/index.ts
  import type { Command } from '../../types.js';

  export default {
    name: '/my-command',
    description: 'My custom command',

    async execute(args: string[], context: CommandContext) {
      // 实现逻辑
      return {
        success: true,
        message: 'Command executed'
      };
    }
  } as Command;

  6.3 插件扩展


  插件清单：

  {
    "name": "my-plugin",
    "version": "1.0.0",
    "main": "dist/index.js",
    "contributes": {
      "commands": [
        { "name": "/my-plugin-command", "handler": "./commands/my-command.js" }
      ],
      "tools": [
        { "name": "my_plugin_tool", "handler": "./tools/my-tool.js" }
      ],
      "hooks": [
        { "event": "onQueryStart", "handler": "./hooks/query.js" }
      ]
    }
  }

  插件生命周期：

  // 插件入口
  export function activate(context: PluginContext) {
    // 注册命令
    context.registerCommand('/my-command', myCommandHandler);

    // 注册工具
    context.registerTool('my_tool', myToolHandler);

    // 注册钩子
    context.onQueryStart((query) => {
      console.log('Query started:', query);
    });
  }

  export function deactivate() {
    // 清理资源
  }

  6.4 技能扩展


  SKILL.md 格式：

  ---
  name: my-skill
  description: My custom skill
  tools:
    - file_read
    - file_write
    - bash
  ---

  # My Skill

  Skill implementation details...

  ## Usage

  How to use this skill...

  加载流程：

  // src/skills/loadSkillsDir.ts
  export async function loadSkillsDir(dir: string): Promise<Skill[]> {
    const skills: Skill[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillFile = path.join(dir, entry.name, 'SKILL.md');
        if (await fs.exists(skillFile)) {
          const skill = await parseSkillFile(skillFile);
          skills.push(skill);
        }
      }
    }

    return skills;
  }

  ---
  7. 设计模式


  7.1 状态模式


  应用场景：查询引擎状态机

  // src/query/states/QueryState.ts
  export interface QueryState {
    name: string;
    enter(): Promise<void>;
    exit(): Promise<void>;
    handleEvent(event: QueryEvent): Promise<void>;
  }

  // src/query/states/IdleState.ts
  export class IdleState implements QueryState {
    name = 'idle';

    async enter() {
      console.log('Entering idle state');
    }

    async exit() {
      console.log('Exiting idle state');
    }

    async handleEvent(event: QueryEvent) {
      if (event.type === 'USER_INPUT') {
        await this.context.transition('responding');
      }
    }
  }

  // src/query/QueryEngine.ts
  export class QueryEngine {
    private currentState: QueryState;
    private states: Map<string, QueryState>;

    async transition(stateName: string) {
      await this.currentState.exit();
      this.currentState = this.states.get(stateName)!;
      await this.currentState.enter();
    }
  }

  7.2 策略模式


  应用场景：压缩策略

  // src/services/compact/strategies.ts
  export interface CompactStrategy {
    name: string;
    compact(messages: Message[]): Promise<Message[]>;
  }

  export class SummaryStrategy implements CompactStrategy {
    name = 'summary';

    async compact(messages: Message[]): Promise<Message[]> {
      // 生成摘要
      const summary = await generateSummary(messages);
      return [{ role: 'system', content: summary }];
    }
  }

  export class TruncateStrategy implements CompactStrategy {
    name = 'truncate';

    async compact(messages: Message[]): Promise<Message[]> {
      // 截断旧消息
      return messages.slice(-10);
    }
  }

  // 使用
  export class AutoCompact {
    private strategy: CompactStrategy;

    setStrategy(strategy: CompactStrategy) {
      this.strategy = strategy;
    }

    async compact(messages: Message[]): Promise<Message[]> {
      return this.strategy.compact(messages);
    }
  }

  7.3 观察者模式


  应用场景：事件系统

  // src/utils/events.ts
  export class EventEmitter {
    private listeners: Map<string, Set<Function>> = new Map();

    on(event: string, handler: Function): () => void {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, new Set());
      }
      this.listeners.get(event)!.add(handler);

      return () => this.off(event, handler);
    }

    emit(event: string, data: any): void {
      const handlers = this.listeners.get(event);
      if (handlers) {
        handlers.forEach(handler => handler(data));
      }
    }

    off(event: string, handler: Function): void {
      const handlers = this.listeners.get(event);
      if (handlers) {
        handlers.delete(handler);
      }
    }
  }

  // 使用
  const emitter = new EventEmitter();
  const unsub = emitter.on('query:start', (data) => {
    console.log('Query started:', data);
  });

  emitter.emit('query:start', { queryId: '123' });
  unsub();

  7.4 工厂模式


  应用场景：API 客户端创建

  // src/services/api/factory.ts
  export interface APIClient {
    sendMessage(params: MessageParams): Promise<Response>;
  }

  export class APIClientFactory {
    static create(provider: string, config: APIConfig): APIClient {
      switch (provider) {
        case 'anthropic':
          return new ClaudeAPIClient(config);
        case 'openai':
          return new OpenAIAPIClient(config);
        default:
          throw new Error(`Unknown provider: ${provider}`);
      }
    }
  }

  // 使用
  const client = APIClientFactory.create('anthropic', {
    apiKey: 'sk-...',
    model: 'claude-3-5-sonnet-20241022'
  });

  7.5 装饰器模式


  应用场景：工具增强

  // src/tools/decorators.ts
  export interface Tool {
    execute(params: any): Promise<ToolResult>;
  }

  export class ToolDecorator implements Tool {
    constructor(protected tool: Tool) {}

    async execute(params: any): Promise<ToolResult> {
      return this.tool.execute(params);
    }
  }

  export class LoggingDecorator extends ToolDecorator {
    async execute(params: any): Promise<ToolResult> {
      console.log(`Executing tool with params:`, params);
      const result = await super.execute(params);
      console.log(`Tool result:`, result);
      return result;
    }
  }

  export class RetryDecorator extends ToolDecorator {
    private maxRetries: number;

    constructor(tool: Tool, maxRetries: number = 3) {
      super(tool);
      this.maxRetries = maxRetries;
    }

    async execute(params: any): Promise<ToolResult> {
      let lastError: Error;

      for (let i = 0; i < this.maxRetries; i++) {
        try {
          return await super.execute(params);
        } catch (error) {
          lastError = error as Error;
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
      }

      throw lastError!;
    }
  }

  // 使用
  let tool = new FileReadTool();
  tool = new LoggingDecorator(tool);
  tool = new RetryDecorator(tool, 3);

  7.6 适配器模式


  应用场景：Bridge 协议转换

  // src/bridge/adapters.ts
  export interface MessageAdapter {
    adaptRequest(request: any): any;
    adaptResponse(response: any): any;
  }

  export class OpenAIToAnthropicAdapter implements MessageAdapter {
    adaptRequest(request: OpenAIRequest): AnthropicRequest {
      return {
        model: request.model,
        messages: request.messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        max_tokens: request.max_tokens,
        stream: request.stream
      };
    }

    adaptResponse(response: AnthropicResponse): OpenAIResponse {
      return {
        id: response.id,
        choices: [{
          message: {
            role: 'assistant',
            content: response.content[0].text
          },
          finish_reason: response.stop_reason
        }]
      };
    }
  }

  ---
  8. 架构决策记录


  ADR-001: 使用 Bun 作为运行时


  状态：已采纳

  背景：
  - Node.js 启动慢，包管理器 npm/yarn 性能一般
  - 需要编译为独立可执行文件
  - TypeScript 支持需要额外配置

  决策：
  使用 Bun 作为主要运行时和包管理器。

  理由：
  - 启动速度快（比 Node.js 快 3-5 倍）
  - 内置 TypeScript 支持（无需 ts-node）
  - 内置打包器（可直接编译为单文件可执行文件）
  - 包管理器速度快（比 npm/yarn/pnpm 快 10-20 倍）
  - ESM 优先设计

  后果：
  - ✅ 启动性能显著提升
  - ✅ 开发体验改善（热重载、类型检查）
  - ✅ 部署简化（单文件可执行）
  - ⚠️ 需要团队学习 Bun 特性
  - ⚠️ 某些 Node.js 生态库可能不兼容（需测试）

  ---
  ADR-002: 使用 Ink 作为 TUI 框架


  状态：已采纳

  背景：
  - 需要跨平台终端 UI
  - 需要响应式组件化开发
  - 需要丰富的交互（输入、选择、列表等）

  决策：
  使用 Ink（React for CLI）作为 TUI 框架，并自维护一个副本。

  理由：
  - React 模型，团队熟悉度高
  - 组件化开发，代码复用性好
  - 响应式更新，状态管理方便
  - 丰富的生态系统
  - TypeScript 支持良好

  后果：
  - ✅ 开发效率高（React 开发者上手快）
  - ✅ UI 组件复用性好
  - ✅ 状态管理清晰
  - ⚠️ 需要 React 运行时开销（可接受）
  - ⚠️ 某些终端特性需要自定义实现（自维护）

  ---
  ADR-003: OpenAI ↔ Anthropic 协议转换


  状态：已采纳

  背景：
  - 需要支持多种 API Provider（Claude、GPT、国内模型等）
  - OpenAI Chat Completions 是行业标准
  - Anthropic Messages API 是 Claude 原生接口

  决策：
  实现 Bridge 层，支持 OpenAI ↔ Anthropic 双向协议转换。

  理由：
  - 用户可自由选择 Provider
  - 兼容 OpenAI 生态工具
  - 支持 OpenAI 格式的国内模型（DeepSeek、GLM 等）
  - 提供 Anthropic 原生性能优势

  后果：
  - ✅ Provider 选择灵活
  - ✅ 生态兼容性好
  - ⚠️ 协议转换复杂（需要仔细处理边缘情况）
  - ⚠️ 流式传输适配复杂

  ---
  ADR-004: 工具权限分级控制


  状态：已采纳

  背景：
  - 某些工具具有危险性
  - 需要防止 AI 滥用工具
  - 需要用户授权机制

  决策：
  实现三级权限控制：低/中/高。

  权限分级：

  ┌──────┬──────────────────────────┬──────────────────────────┐
  │ 级别 │         工具示例         │           行为           │
  ├──────┼──────────────────────────┼──────────────────────────┤
  │ 低   │ file_read, glob, grep    │ 自动执行，无需授权       │
  ├──────┼──────────────────────────┼──────────────────────────┤
  │ 中   │ file_write, bash         │ 首次执行需授权，后续自动 │
  ├──────┼──────────────────────────┼──────────────────────────┤
  │ 高   │ file_delete, system_exec │ 每次执行需授权           │
  └──────┴──────────────────────────┴──────────────────────────┘

  理由：
  - 安全性与便利性平衡
  - 用户可控风险
  - 防止 AI 意外破坏

  后果：
  - ✅ 安全性提升
  - ✅ 用户控制感强
  - ⚠️ 授权流程可能打断体验（可配置跳过）

  ---
  ADR-005: 技能热加载机制


  状态：已采纳

  背景：
  - 技能数量庞大（2688+）
  - 启动时全量加载耗时长
  - 用户可能只使用部分技能

  决策：
  实现技能热加载，按需加载。

  理由：
  - 启动速度快（只扫描目录，不加载体）
  - 内存占用低
  - 用户可动态添加技能
  - 便于技能分发与更新

  后果：
  - ✅ 启动性能提升
  - ✅ 内存占用降低
  - ⚠️ 首次使用技能有加载延迟
  - ⚠️ 技能索引需要维护

  ---
  ADR-006: TypeScript 严格模式关闭


  状态：临时接受（需要改进）

  背景：
  - 项目初期快速迭代
  - 某些第三方库类型定义不完善
  - 团队 TypeScript 经验不一

  决策：
  临时关闭 TypeScript 严格模式（strict: false），逐步启用。

  理由：
  - 快速迭代，不阻塞开发
  - 允许隐式 any，减少类型定义工作
  - skipLibCheck: true 跳过第三方库检查

  后果：
  - ✅ 开发速度快
  - ⚠️ 潜在类型错误
  - ⚠️ 代码质量下降风险
  - 🔄 改进计划：逐步启用严格模式，优先检查核心模块

  ---
  ADR-007: 主文件拆分策略


  状态：已采纳

  背景：
  - main.tsx 过大（4395 行）
  - 职责过多（初始化 + 状态管理 + UI 渲染）
  - 维护困难

  决策：
  将 main.tsx 拆分为多个模块。

  拆分方案：

  main.tsx (入口，<100 行)
  ├── core/init.ts (初始化逻辑，~500 行)
  ├── core/stateManager.ts (状态管理，~300 行)
  ├── core/lifecycle.ts (生命周期，~400 行)
  └── components/MainUI.tsx (UI 组件，~3000 行)

  理由：
  - 单一职责原则
  - 可测试性提升
  - 维护性改善

  后果：
  - ✅ 代码可维护性提升
  - ✅ 测试覆盖更容易
  - ⚠️ 需要重构工作（分阶段进行）

  ---
  ADR-008: 插件沙箱隔离


  状态：已采纳

  背景：
  - 第三方插件可能不安全
  - 需要防止插件破坏主程序
  - 需要限制插件权限

  决策：
  使用 VM2 沙箱隔离插件执行。

  理由：
  - 插件代码隔离
  - 防止插件访问敏感 API
  - 资源限制（CPU/内存/时间）
  - 白名单机制控制模块访问

  后果：
  - ✅ 安全性提升
  - ✅ 插件故障不影响主程序
  - ⚠️ 插件开发复杂度增加
  - ⚠️ 性能略有损失（可接受）

  ---
  总结


  本章详细阐述了 Doge Code 的架构设计，包括：

  1. 架构原则：单一职责、开闭原则、依赖倒置、接口隔离
  2. 分层架构：表示层、应用层、业务逻辑层、服务层、基础设施层
  3. 核心模块划分：启动、入口、查询引擎、命令、工具、Bridge、服务
  4. 数据流设计：主流程、工具调用、命令处理
  5. 依赖关系：模块依赖矩阵、循环依赖检测
  6. 扩展机制：工具、命令、插件、技能
  7. 设计模式：状态模式、策略模式、观察者模式、工厂模式、装饰器模式、适配器模式
  8. 架构决策记录：8 个关键决策及其理由、后果

  下一章将深入探讨 核心引擎（第 02 章），包括查询引擎、状态机、消息循环、Token 预算控制等详细实现。

  ---
  请保存以上内容到文件：

  notepad D:\doge-code\docs\01-architecture.md

  保存后请告诉我，我将继续输出第 02 章：核心引擎（约 50000 字）。