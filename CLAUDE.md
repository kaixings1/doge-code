# CLAUDE.md

本文件提供给 Claude Code (claude.ai/code) 在此仓库中工作时的指导信息。

## 项目概述

**Doge Code** 是 Claude Code 的修改版/分支，具有中文本地化、自定义 API 端点支持和 OpenAI Anthropic 兼容 API 翻译层。

- **运行环境**: Bun 1.3.5+ 和 Node.js 24+
- **包管理器**: Bun
- **类型**: TypeScript (React 组件)

## 开发命令

```bash
# 安装依赖
bun install

# 启动开发服务器
bun run dev
# 或
bun run ./src/bootstrap-entry.ts

# 查看版本
bun run version

# 构建（编译为exe）
# Windows: complie.bat, install.bat
# 或手动: bun build
```

## 常用命令

| 命令 | 说明 |
|---------|-------------|
| `/login` | 切换 BaseURL、APIKEY、模型 |
| `/clear` | 清空上下文（相当于fresh session） |
| `/plugins` | 管理插件 |
| `/skills` | 管理技能 |
| `/compact` | 压缩会话以减少token消耗 |
| `/context` | 查看token使用量 |
| `/model` | 切换模型 |
| `/init` | 重新分析项目，更新CLAUDE.md |

## 核心架构

### 入口点
- **主入口**: `src/bootstrap-entry.ts`
- **开发入口**: `src/dev-entry.ts`

### 核心目录
- `src/bridge/` - API 翻译层 (OpenAI ↔ Anthropic Messages)
- `src/coordinator/` - 任务协调和会话管理
- `src/components/` - React UI 组件 (TUI)
- `src/tools/` - 工具定义和执行
- `src/query/` - 查询引擎
- `src/tasks/` - 任务管理
- `src/state/` - 应用状态管理
- `src/hooks/` - React hooks
- `src/ink/` - Ink 框架组件

### 关键文件
- `src/core.ts` - 核心应用逻辑
- `src/commands.ts` - 命令定义
- `src/main.tsx` - 主UI渲染
- `src/components/ConsoleOAuthFlow.tsx` - OAuth登录流程

### OAuth 登录
`ConsoleOAuthFlow.tsx` 处理登录，支持：
- 自定义 API 端点 (OpenAI兼容, Anthropic兼容)
- 从预设和保存配置中选择模型
- API Key 配置

### 配置
- 用户配置目录: `~/.doge/`
- 全局配置: `~/.doge/.claude.json`
- 环境变量:
  - `ANTHROPIC_MODEL`
  - `ANTHROPIC_BASE_URL`
  - `DOGE_API_KEY`
  - `CLAUDE_CODE_COMPATIBLE_API_PROVIDER`

## 构建与部署

- **npm 包**: `@doge-code/cli`
- **二进制名称**: `doge`
- 使用 Bun 链接: `bun link`

## 架构详情

### OAuth 认证
- `src/components/ConsoleOAuthFlow.tsx` - 处理登录和自定义端点
- 支持 OpenAI 兼容和 Anthropic 兼容 API
- 预设端点包括本地代理、Ollama、LMStudio 等

### 状态管理
- `src/state/` - 应用状态
- `src/context.ts` - 全局上下文
- `.doge/` 目录存储项目特定配置

### Bridge 层
- `src/bridge/` - API 翻译层
- 在 OpenAI Chat Completions 和 Anthropic Messages 格式间转换
- 支持自定义 baseURL 和 API Key

## 环境要求

- **必需**: Bun 1.3.5+, Node.js 24+
- **配置目录**: `~/.doge/` (用户), `.doge/` (项目)
- **关键环境变量**:
  - `ANTHROPIC_MODEL`
  - `ANTHROPIC_BASE_URL`
  - `DOGE_API_KEY`
  - `CLAUDE_CODE_COMPATIBLE_API_PROVIDER`

## 说明

- 本项目是 Claude Code 的 fork，非官方仓库
- 全面中文本地化
- 支持自定义 Anthropic 兼容端点
- 配置隔离于 `.doge/` 目录

## 新增功能 (src-ext)

### 核心工具
| 工具 | 说明 |
|------|------|
| `/ultrareview` | 云端并行多智能体代码审查 |
| `/less-permission-prompts` | 扫描会话，生成权限白名单 |
| `/effort` | 设置模型效能等级 (low/medium/high/max) |
| `/theme` | 创建、切换、管理命名主题 |
| `/advisor` | 实验性智能顾问分析 |
| `/vim-visual-mode` | Vim 可视模式支持 (v/V) |
| `/terminal-panel` | 终端面板管理 |
| `/context-collapse` | 上下文折叠减少token消耗 |
| `/workflow` | 执行工作流脚本 |
| `/snip` | 截断历史减少上下文 |
| `/task-create` | 创建新任务 |
| `/plan-mode` | 计划模式管理 |
| `/branch` | Git 分支管理 |
| `/compare` | 文件比较工具 |
| `/graphql` | GraphQL 查询工具 |
| `/http` | HTTP 请求工具 |
| `/database` | 数据库操作 |
| `/shell` | 高级 shell 命令执行 |
| `/file-watcher` | 文件变更监听 |
| `/schedule` | 定时任务调度 |
| `/cron` | Cron 作业管理 |
| `/websocket` | WebSocket 客户端 |
| `/event-stream` | 事件流处理 |
| `/queue` | 任务队列管理 |
| `/cache` | 缓存操作 |
| `/logger` | 日志记录工具 |
| `/metrics` | 指标收集 |
| `/monitor` | 系统监控 |
| `/backup` | 备份管理 |
| `/mcp-tool-search` | MCP 工具搜索 |

### 功能特性
- **Opus 4.7 xhigh 效能等级** - 中间等级，平衡速度与智能
- **Auto 模式** - Max 订阅用户可用
- **Vim 可视模式** - 支持 `v` 和 `V` 模式
- **/usage 合并** - `/cost` 和 `/stats` 合并为 `/usage`
- **WebFetch 工具** - 抓取网页内容
- **Terminal Panel** - 全屏滚动优化
- **Workflow Scripts** - 并行工作流执行
- **81个工具** - 覆盖开发、监控、数据库、网络等场景
