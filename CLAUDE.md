# CLAUDE.md

此文件为 Claude Code (claude.ai/code) 在处理此代码库时提供指导。

## 项目概述

**Doge Code** — Claude Code 的中文定制版（Fork），特点：
- 完整中文本地化（提示词/UI/错误信息）
- 自定义 API 端点支持（OpenAI ↔ Anthropic 格式转接）
- 多 API 预设管理（`.doge/api.json`，按项目隔离）
- OpenAI Chat Completions ↔ Anthropic Messages 转接层（`src/bridge/`）
- bun 编译为独立 exe（`doge.exe`）
- 伙伴系统、声音提醒、Token 监控等增强

- **运行环境**: Bun 1.3.5+ / Node.js 24+
- **包管理器**: Bun
- **语言**: TypeScript + React (Ink) + JSX
- **二进制入口**: `doge`

## 开发命令

```bash
# 安装依赖
bun install

# 类型检查（耗时较长，仅检查特定文件时用 tsc 带参数）
bun run tsc --noEmit --skipLibCheck

# 开发模式启动（直接运行源码）
bun run dev

# 编译为独立可执行文件
bun run build

# 全局链接（注册 doge 命令）
bun link

# 启动（d.bat 内设环境变量）
d.bat
```

```powershell
# Windows 上编译
complie.bat

# 安装依赖
install.bat
```

## 核心架构

### 启动流程

```
bootstrap-entry.ts  →  加载 .doge/api.json 预设  →  设置环境变量
    ↓
entrypoints/cli.tsx  →  解析 CLI 参数  →  启动 Ink TUI
    ↓
main.tsx  →  init()  →  QueryEngine 主循环
```

**关键文件**：
- `src/bootstrap-entry.ts` — 入口：读取 API 配置（`ANTHROPIC_BASE_URL`、`DOGE_API_KEY`、`ANTHROPIC_MODEL`、`CLAUDE_CODE_COMPATIBLE_API_PROVIDER`），然后导入 CLI
- `src/entrypoints/cli.tsx` — CLI 参数解析 + TUI 渲染入口
- `src/main.tsx` — 应用主循环，初始化 GrowthBook/遥测/策略限制等
- `src/core.ts` — GrowthBook 特性标记（A/B 测试引擎），非核心逻辑
- `src/context.ts` — 全局上下文（Git 状态/系统上下文/用户上下文），`getSystemContext()` / `getUserContext()`

### 命令系统 (`src/commands/` + `src/commands.ts`)

- **注册中心**: `src/commands.ts` — 所有命令通过 lodash `memoize` 懒加载，返回 `getCommands(cwd)` 数组
- **命令结构**: 每个命令目录包含 `index.ts`（元数据导出）+ 实现文件
- **命令类型**:
  - `local-jsx`: React Ink 组件（渲染 UI，如 `/help`）
  - `local`: 纯文本输出
  - `prompt`: 技能/工作流（展开为模型提示）
- **条件加载**: `feature('BRIDGE_MODE')`、`process.env.USER_TYPE === 'ant'` 等编译时/运行时门控

**常用斜杠命令**：

| 分类 | 命令 |
|------|------|
| 会话 | `/clear /backup /resume /rename /rewind /compact` |
| 模型 | `/model /effort /login /bridge` |
| 任务 | `/plan /task-create /ultrareview /agents /buddy` |
| 工具 | `/mcp /mcp-tool-search /plugins /skills` |
| 系统 | `/doctor /metrics /monitor /stats /cost /logger` |
| 调试 | `/ant-trace /sandbox-toggle /debug-tool-call` |

### 工具系统 (`src/tools/` + `src/tools.ts`)

- **工具注册**: `src/tools.ts` 集中导入所有工具，通过 `getTools()` 返回 `Tool[]`
- **工具生命周期**: `src/Tool.ts` — 定义 `Tool` 接口和 `toolMatchesName()` 匹配逻辑
- **核心工具**: `BashTool`、`FileEditTool`、`FileReadTool`、`FileWriteTool`、`GlobTool`、`GrepTool`
- **子代理工具**: `AgentTool`、`TaskCreateTool`、`TaskGetTool`、`TaskListTool`、`TaskStopTool`
- **Web 工具**: `WebFetchTool`、`WebSearchTool`、`WebBrowserTool`
- **条件工具**: 通过 `feature()` 门控有条件注册（`PROACTIVE`、`KAIROS`、`BRIDGE_MODE` 等）
- **工具执行上下文**: `ToolUseContext` 对象携带会话状态、权限、文件系统引用等

### Bridge 层 (`src/bridge/`)

OpenAI Chat Completions ↔ Anthropic Messages 格式转换层：

- `bridgeMain.ts` — 核心逻辑：会话创建/轮询/心跳/重连
- `bridgeApi.ts` — API 客户端适配器
- `bridgeMessaging.ts` — WebSocket/SSE 消息处理，UUID 去重
- `bridgeUI.ts` — 桥接状态 UI
- `types.ts` — Bridge 类型定义

**环境变量**：
- `ANTHROPIC_BASE_URL` / `DOGE_API_KEY` / `ANTHROPIC_MODEL` / `CLAUDE_CODE_COMPATIBLE_API_PROVIDER`
- `CLAUDE_CONFIG_DIR` — 全局配置目录
- `CLAUDE_CODE_VERIFY_PLAN` — 计划验证模式

### 查询引擎 (`src/query.ts` + `src/QueryEngine.ts`)

- `query()` — 主循环函数，处理消息 → 工具调用 → 结果 → 继续的循环
- `QueryEngine.ts` — 子代理查询执行引擎，处理 SDK 消息格式和权限管理
- `src/query/config.ts` — 不可变 QueryConfig（会话 ID + 运行时门控）
- `src/query/transitions.ts` — 状态转换逻辑
- `src/query/tokenBudget.ts` — Token 预算管理
- `src/query/stopHooks.ts` — 停止钩子

### 协调器与任务系统

- `src/coordinator/coordinatorMode.ts` — 协调模式（子代理编排）
- `src/coordinator/workerAgent.ts` — Worker Agent 实现
- `src/tasks/` — 各类任务实现：
  - `LocalAgentTask/` — 本地 Agent
  - `LocalMainSessionTask.ts` — 主会话任务
  - `DreamTask/` — 梦境（后台思考）任务
  - `RemoteAgentTask/` — 远程 Agent

### 状态管理

- `src/state/AppState.ts` — 应用状态定义
- `src/state/store.ts` — 状态存储
- `src/bootstrap/state.ts` — 启动时全局状态（会话 ID、项目根目录、成本统计等）

### 插件系统 (`src/utils/plugins/`)

- `pluginLoader.ts` — 插件加载核心
- `loadPluginCommands.ts` — 插件命令加载
- `marketplaceManager.ts` — 市场管理
- `plugins/` 目录存放社区插件

### 技能系统 (`src/skills/`)

- `bundledSkills.ts` — 内置技能定义
- `loadSkillsDir.ts` — 从磁盘加载技能
- `mcpSkills.ts` / `mcpSkillBuilders.ts` — MCP 技能构建

### API 服务 (`src/services/api/`)

- `openaiCompat.ts` — OpenAI 兼容适配层
- `claude.ts` — Anthropic API 调用
- `client.ts` — HTTP 客户端
- `errors.ts` / `errorUtils.ts` — 错误处理
- `withRetry.ts` — 重试逻辑

## 配置体系

### API 预设配置 (`.doge/api.json`)

```json
{
  "activePreset": "default",
  "presets": {
    "default": {
      "provider": "openai",
      "baseURL": "https://api.openrouter.ai/v1/chat/completions",
      "apiKey": "sk-xxx",
      "model": "poolside/laguna-m.1:free",
      "savedModels": ["claude-3-haiku", "deepseek-v4-flash"]
    }
  }
}
```

- 项目配置: `.doge/api.json`
- 全局配置: `~/.doge/.claude.json`
- 自定义路径: 环境变量 `DOGE_API_JSON`

## 特性标记系统

使用 Bun 编译时特性标记 (`feature()`)，在 `bun:bundle` 中实现死代码消除：

- `BRIDGE_MODE` — 桥接模式
- `PROACTIVE` / `KAIROS` — 主动/高级功能
- `AGENT_TRIGGERS` — 定时任务
- `VOICE_MODE` — 语音模式
- `ULTRAPLAN` — 高级计划
- `WORKFLOW_SCRIPTS` — 工作流脚本
- `CONTEXT_COLLAPSE` — 上下文折叠
- `FORK_SUBAGENT` — Fork 子代理

## 目录架构

```
src/
├── bootstrap-entry.ts       # 启动入口（加载 API 配置 → 设置环境变量 → 导入 CLI）
├── main.tsx                 # 主逻辑入口（初始化所有服务）
├── context.ts               # 全局上下文（Git 状态/系统/用户上下文）
├── commands.ts              # 命令注册中心（memoize 懒加载）
├── query.ts                 # 主查询循环
├── QueryEngine.ts           # 子代理查询引擎
├── Tool.ts                  # 工具接口 + 生命周期
├── tools.ts                 # 工具定义导出
├── commands/                # 斜杠命令（每个命令一个目录）
│   ├── login/ / model/ / clear/ / plan/ / agents/ / mcp/ / skills/ ...
│   └── init.ts / commit.ts / version.ts ...
├── tools/                   # 工具实现（每个工具一个目录）
│   ├── BashTool/ FileEditTool/ FileReadTool/ FileWriteTool/
│   ├── GlobTool/ GrepTool/ WebFetchTool/ WebSearchTool/
│   ├── AgentTool/ TaskCreateTool/ ...
│   └── MCPTool/ McpToolSearchTool/ ...
├── bridge/                  # OpenAI ↔ Anthropic 格式转接层
│   ├── bridgeMain.ts        # 核心逻辑
│   ├── bridgeApi.ts         # API 适配器
│   ├── bridgeMessaging.ts   # 消息处理
│   └── replBridgeTransport.ts
├── coordinator/             # 任务协调（coordinatorMode.ts / workerAgent.ts）
├── tasks/                   # 任务实现（LocalAgentTask / DreamTask / RemoteAgentTask）
├── state/                   # 应用状态持久化（AppState.ts / store.ts）
├── bootstrap/state.ts       # 启动时全局状态
├── cli/                     # CLI 组件（传输/打印/处理）
├── ink/                     # Ink TUI 框架（自维护版本）
├── screens/                 # 屏幕组件（Doctor / REPL / ResumeConversation）
├── services/                # 服务层
│   ├── api/                 # API 客户端（openaiCompat.ts / claude.ts）
│   ├── mcp/                 # MCP 服务
│   └── analytics/           # 遥测/分析
├── utils/                   # 工具函数（400+ 文件）
│   ├── git/                 # Git 工具
│   ├── plugins/             # 插件系统（loader / marketplace）
│   ├── settings/            # 设置管理
│   ├── mcp/                 # MCP 工具
│   └── memory/              # 记忆工具
├── types/                   # 类型定义
├── constants/               # 常量（prompts / errors / keys / xml ...）
├── hooks/                   # Ink React hooks
└── plugins/                 # 内置插件目录
```

## 重要说明

- 本项目是 Claude Code 的 Fork（Doge Code），非官方仓库
- 全面中文本地化；中文提示词更高效
- 支持自定义 Anthropic/OpenAI 兼容端点
- 配置隔离于 `.doge/` 目录，不与官方 `.claude/` 混用
- `bun:build` 的 `feature()` 标记实现死代码消除——条件导入会被编译时移除
- `src/` 下大量使用 `.js` 扩展名（ESM 模块规范），实际代码为 TypeScript
