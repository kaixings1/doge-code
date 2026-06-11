# CLAUDE.md

此文件为 Claude Code (claude.ai/code) 在处理此代码库时提供指导。

## 项目概述

**Doge Code** 是 Claude Code 的中文定制版，具有：
- 完整中文本地化
- 自定义 API 端点支持（OpenAI/Anthropic 兼容）
- OpenAI ↔ Anthropic Messages 格式转接层
- 自定义模型与模型列表管理
- 配置隔离于 `.doge/` 目录

- **运行环境**: Bun 1.3.5+ / Node.js 24+
- **包管理器**: Bun
- **类型**: TypeScript + React + Ink
- **包名**: `@doge-code/cli`
- **二进制**: `doge`

## 开发命令

```bash
# 安装依赖
bun install

# 类型检查
bun run tsc --noEmit

# 运行开发模式
bun run dev
bun run start

# 链接本地包（全局使用）
bun link

# 查看帮助
bun run dev -- --help
```

## 构建命令

```bash
# 准备 npm 发布包
bun run prepare-release-package

# 编译（通过 bun 构建）
bun build ./src/bootstrap-entry.ts --outdir ./dist
```

## 常用斜杠命令

**会话管理**: `/clear /backup /resume /rename /share /history`

**模型控制**: `/model /effort /bridge`

**任务**: `/plan /task-create /ultrareview /agents`

**系统**: `/doctor /metrics /monitor /stats /insights /logger`

**工具**: `/mcp /mcp-tool-search /plugins /skills`

**环境**: `/env /remote-env /oauth-refresh /settings`

**调试**: `/ant-trace /sandbox-toggle /debug-tool-call`

## 核心架构

### 入口点

- **主入口**: `src/bootstrap-entry.ts` - 加载 `.doge/api.json` 配置，设置环境变量，导入 CLI
- **开发入口**: `src/dev-entry.ts` - 开发模式入口
- **CLI 渲染入口**: `src/entrypoints/cli.tsx` - CLI/TUI 渲染入口
- **核心逻辑**: `src/core.ts` - 应用核心处理
- **Ink UI 主渲染**: `src/main.tsx`

### 目录结构

```
src/
├── bootstrap-entry.ts          # 启动入口，加载 API 配置
├── dev-entry.ts                # 开发入口
├── entrypoints/cli.tsx         # CLI 渲染入口
├── commands.ts                 # 命令注册中心（lodash memoize 缓存）
├── core.ts                     # 核心应用逻辑
├── main.tsx                    # Ink UI 主渲染
├── QueryEngine.ts              # 核心查询处理
├── Tool.ts                     # 工具生命周期
├── tools.ts                    # 工具定义导出
├── bridge/                     # API 格式转换层
│   ├── bridgeMain.ts           # 桥接核心逻辑
│   ├── bridgeApi.ts            # 桥接适配器
│   ├── bridgeMessaging.ts      # 桥接消息处理（WebSocket/SSE）
│   └── replBridgeTransport.ts  # 桥接传输层
├── coordinator/                # 任务协调和会话管理
├── tasks/                      # 任务编排
├── jobs/                       # 后台任务执行
├── state/                      # 应用状态持久化
├── tools/                      # 工具定义
├── skills/                     # 技能加载和管理
│   ├── bundledSkills.ts        # 内置技能
│   └── loadSkillsDir.ts        # 从磁盘加载技能
├── plugins/                    # 插件系统
├── context.ts                  # 跨模块共享状态
├── services/                   # 服务层（API、分析、认证等）
├── cli/                        # CLI 组件（传输、打印等）
├── ink/                        # Ink UI 组件
├── screens/                    # 屏幕组件
└── types/                      # 类型定义
```

### 命令系统架构

**命令注册流程**：
1. `src/commands.ts` 集中导入所有命令，使用 `memoize` 缓存
2. 每个命令文件结构：
   - `src/commands/<name>/index.ts` - 导出命令元数据
   - `src/commands/<name>/<impl>.tsx` 或 `.ts` - 实现（React UI 或纯文本）
3. 命令类型：
   - `local-jsx`: React Ink 组件（渲染 UI）
   - `local`: 纯文本输出
   - `prompt`: 技能/工作流（展开为模型提示）

**命令加载**：
- `getCommands(cwd)` - 懒加载所有命令（技能、插件、工作流）
- `meetsAvailabilityRequirement(cmd)` - 根据认证/提供商要求过滤命令
- `isCommandEnabled(cmd)` - 根据功能开关判断命令是否启用
- `INTERNAL_ONLY_COMMANDS` - 仅限内部使用的命令列表
- `REMOTE_SAFE_COMMANDS` - 远程模式可用命令集合
- `BRIDGE_SAFE_COMMANDS` - 桥接模式可用命令集合

### Bridge 层（API 翻译）

`src/bridge/` 实现 OpenAI Chat Completions ↔ Anthropic Messages 格式转换：

- **桥接模式**: 内部仍使用 Anthropic Messages 结构，转发到 OpenAI 兼容端点
- **配置**: `.doge/api.json` 中设置 `provider` 和 `baseURL`

**环境变量**：
- `ANTHROPIC_BASE_URL` - API 端点地址
- `DOGE_API_KEY` - API 密钥（非官方变量）
- `ANTHROPIC_MODEL` - 默认模型名称
- `CLAUDE_CODE_COMPATIBLE_API_PROVIDER` - 提供商类型："openai"/"anthropic"

**关键文件**：
- `bridgeMessaging.ts` - WebSocket/SSE 消息处理，UUID 去重，控制请求响应
- `bridgeMain.ts` - 转接核心逻辑
- `bridgeApi.ts` - API 适配器实现
- 特性开关: `feature('BRIDGE_MODE')` - Bun 编译时特性

### 状态管理架构

- **全局上下文**: `src/context.ts` - 跨模块共享状态
- **协调器**: `src/coordinator/` - 任务编排和会话生命周期
- **状态存储**: `src/state/` - 应用状态持久化
- **启动状态**: `src/bootstrap/state.ts` - 启动状态管理

### 工具系统

- **工具定义**: `src/tools/` - 工具注册和调用
- **工具管理器**: `src/Tool.ts` - 工具生命周期
- **工具列表**: `src/tools.ts` - 导出所有可用工具

### 技能系统

- **技能加载**: `src/skills/loadSkillsDir.ts` - 从磁盘加载技能
- **内置技能**: `src/skills/bundledSkills.ts` - 内置技能定义
- **插件技能**: `src/plugins/builtinPlugins.ts` - 内置插件技能
- **插件加载**: `src/utils/plugins/loadPluginCommands.ts` - 插件命令加载

## 配置体系

### 配置目录

- **项目配置**: `.doge/api.json` - 当前激活的预设存储在此
- **全局配置**: `~/.doge/.claude.json` - 继承官方配置结构

### API 预设 (`.doge/api.json`)

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

## 说明

- 本项目是 Claude Code 的 fork：Doge Code，非官方仓库
- 全面中文本地化，中文提示词更高效
- 支持自定义 Anthropic/OpenAI 兼容端点
- 配置隔离于 `.doge/` 目录
- 详见 README.md
