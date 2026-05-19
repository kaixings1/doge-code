# CLAUDE.md

此文件为 Claude Code (claude.ai/code) 在处理此代码库时提供指导信息。

## 项目概述

**Doge Code** 是 Claude Code 的修改版/分支，具有中文本地化、自定义 API 端点支持和 OpenAI/Anthropic 兼容 API 翻译层。

- **运行环境**: Bun 1.3.5+ 和 Node.js 24+
- **包管理器**: Bun
- **类型**: TypeScript (React/Ink 组件)
- **包名称**: `@doge-code/cli`，二进制名为 `doge`

## 开发命令

```bash
# 安装依赖
bun install

# 启动开发服务器
bun run dev

# 类型检查
bun run tsc --noEmit

# 链接本地包（用于全局测试）
bun link
```

## 常用斜杠命令

| 命令 | 说明 |
|------|------|
| `/login` | 切换 BaseURL、APIKEY、模型 |
| `/clear` | 清空上下文（相当于 fresh session） |
| `/plugins` | 管理插件 |
| `/skills` | 管理技能 |
| `/compact` | 压缩会话以减少 token 消耗 |
| `/context` | 查看 token 使用量 |
| `/model` | 切换模型 |
| `/init` | 重新分析项目，更新 CLAUDE.md |
| `/plan` | 进入计划模式 |
| `/theme` | 创建、切换、管理命名主题 |
| `/vim` | 启用 Vim 可视模式支持 (v/V) |

## 核心架构

### 入口点

- **主入口**: `src/bootstrap-entry.ts` - 加载 `.doge/api.json` 配置并设置环境变量
- **启动入口**: `src/entrypoints/cli.tsx` - CLI/TUI 渲染入口

### 目录结构

```
src/
├── bootstrap-entry.ts   # 启动入口，加载 API 配置
├── core.ts              # 核心应用逻辑
├── commands.ts          # 所有斜杠命令集中注册
├── main.tsx             # 主 UI 渲染（Ink/React）
├── context.ts           # 全局上下文
├── coordinator/         # 任务协调和会话管理
├── bridge/              # API 翻译层（OpenAI ↔ Anthropic Messages）
├── tools/               # 工具定义
├── QueryEngine.ts       # 查询引擎
├── tasks/               # 任务管理
├── state/               # 应用状态管理
├── ink/                 # Ink 框架组件
└── commands/            # 各个斜杠命令实现
```

### 命令系统

所有斜杠命令在 `src/commands.ts` 中集中注册和导出：

- **命令类型**: `local-jsx`（React UI）、`local`（文本）、`prompt`（技能）
- **新增命令**: 在 `src/commands.ts` 导入并添加到 COMMANDS 数组
- **命令文件结构**: `src/commands/<name>/index.ts`（元数据） + 对应 `.tsx`/`.js`（实现）

### Bridge 层（API 翻译）

`src/bridge/` 目录实现 OpenAI Chat Completions 和 Anthropic Messages 格式间的转换：

- `bridgeMain.ts` - 主要桥接逻辑
- `bridgeApi.ts` - API 适配器
- `bridgeEnabled.ts` - 桥接模式开关
- 支持自定义 `baseURL` 和 `API Key`

### OAuth 登录

`src/components/ConsoleOAuthFlow.tsx` 处理登录，支持：

- 自定义 API 端点（OpenAI 兼容, Anthropic 兼容）
- 从预设和保存配置中选择模型
- API Key 配置

## 配置

- **用户配置目录**: `~/.doge/`
- **项目配置**: `.doge/api.json`
- **环境变量**:
  - `ANTHROPIC_MODEL` - 模型名称
  - `ANTHROPIC_BASE_URL` - API 端点
  - `DOGE_API_KEY` - API 密钥
  - `CLAUDE_CODE_COMPATIBLE_API_PROVIDER` - 提供商类型（openai/anthropic）

### API 预设格式

`.doge/api.json` 中的预设包含：
- `provider`: "openai" 或 "anthropic"
- `baseURL`: API 端点地址
- `apiKey`: API 密钥
- `model`: 默认模型
- `savedModels`: 保存的模型列表

## 新增功能

### 核心工具命令

| 工具 | 说明 |
|------|------|
| `/ultrareview` | 云端并行多智能体代码审查 |
| `/less-permission-prompts` | 扫描会话，生成权限白名单 |
| `/effort` | 设置模型效能等级 (low/medium/high/max) |
| `/theme` | 创建、切换、管理命名主题 |
| `/advisor` | 实验性智能顾问分析 |
| `/vim` | Vim 可视模式支持 (v/V) |
| `/terminal-panel` | 终端面板管理 |
| `/context-collapse` | 上下文折叠减少 token 消耗 |

### 工作流与任务

| 命令 | 说明 |
|------|------|
| `/workflow` | 执行工作流脚本 |
| `/task-create` | 创建新任务 |
| `/plan-mode` | 计划模式管理 |

## 说明

- 本项目是 Claude Code 的 fork，非官方仓库
- 全面中文本地化
- 支持自定义 Anthropic/OpenAI 兼容端点
- 配置隔离于 `.doge/` 目录
