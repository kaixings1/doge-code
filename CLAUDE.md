# CLAUDE.md

此文件为 Claude Code (claude.ai/code) 在处理此代码库时提供指导。

## 项目概述

**Doge Code** — Claude Code 的中文定制 Fork，核心特性：
- 完整中文本地化（提示词/UI/错误信息）
- OpenAI Chat Completions ↔ Anthropic Messages 双向转接层（`src/bridge/`）
- 78+ 预设 Provider 管理（`src/constants/presets.ts`）
- Bun 编译为独立可执行文件 `doge.exe`
- 配置隔离于 `~/.doge/`，项目级配置 `.doge/api.json`
- 2688+ 个可热加载技能（`.claude/skills/`），223 个内置 Agent（`.claude/agents/`）
- 250+ 个自定义斜杠命令（`.claude/commands/`）

- **运行环境**: Bun 1.3.5+ / Node.js 24+
- **包管理器**: Bun (`package.json` 声明 `"packageManager": "bun@1.3.5"`)
- **语言**: TypeScript + React (Ink TUI) + JSX
- **TypeScript 配置**: `tsconfig.json` — target ESNext, module bundler 模式, JSX react-jsx, strict=false, skipLibCheck=true
- **全局命令名**: `doge`（`bun link` 注册 `@doge-code/cli`）
- **代码检查**: Biome（`biome.json` — 宽松规则，大部分检查已关闭）

## ⚠️ DANGER：本项目运行在 Windows Git Bash 下，禁止用 Bash 写 TS/JS 文件

**🔴 最高优先级规则：写文件必须用 Write、FileWriteTool 或 MultiFileEditTool 工具；文件搜索必须用 Glob、Grep 或 Read 工具**

本项目所有写文件和搜索操作**必须**使用内置工具，禁止通过 Bash 写入或搜索文件。

### ✅ 可用工具清单（直接调用即可，无需导入）

| 工具 | 用途 | 说明 |
|------|------|------|
| **Write** / **FileWriteTool** | 创建/覆盖文件 | 参数: `file_path`=绝对路径, `content`=文件内容 |
| **MultiFileEditTool** | 多文件写入/批量编辑 | 适合一次修改多个文件 |
| **Edit** | 精确替换文件内容 | 参数: `file_path`, `old_string`, `new_string` |
| **Read** | 读取文件内容 | 参数: `file_path`, 可选 `offset`/`limit`/`pages` |
| **Glob** | 文件路径搜索 | 按模式匹配查找文件，**禁止用 `find` 替代** |
| **Grep** | 文件内容搜索 | 全文关键词搜索，**禁止用 `grep`/`rg` 替代** |

所有工具均通过 API 直接操作文件系统，**不经过 shell**，不会遇到 Windows Git Bash 的转义问题。

**规则**：写文件优先使用 `Write`/`FileWriteTool`，搜索文件优先使用 `Glob`/`Grep`，读取文件优先使用 `Read`。

**记录在案、已证实的失败案例（切勿尝试）：**
- `python3 -c "with open(...)"` → MSYS2 吃掉换行和引号，语法报错
- `node -e "fs.writeFileSync(...)"` → 同上
- `cat > file << 'EOF'` → MSYS2 吃掉所有换行符，多行变一行
- `echo 'content' > file` → echo 不处理换行，多行内容无法写入
- `printf '%b' '\n'` → MSYS2 printf 的 `\n` 解析与非 POSIX 实现不一致
- `find . -name "*.ts"` → 应用 Glob 替代（更准确且不会阻塞）
- `grep -r "keyword" src/` → 应用 Grep 替代（更高效且跨平台）

**正确的操作方式（按优先级）：**
1. **`Write`/`FileWriteTool`** — 创建/覆盖文件，传入完整内容字符串
2. **`MultiFileEditTool`** — 多文件编辑，适合批量修改多处
3. **`Edit`** — 精确替换已有文件中的字符串（`old_string` → `new_string`）
4. **`Glob`** — 文件路径搜索（模式匹配，替代 `find`）
5. **`Grep`** — 文件内容搜索（全文搜索，替代 `grep`/`rg`）
6. **`Read`** — 文件内容阅读（替代 `cat`/`head`/`tail`）

```typescript
// 使用 Write 工具创建/覆盖文件：
// file_path: "D:/doge-code/src/xxx.ts"
// content: "多行文件内容\n直接传入"

// 使用 MultiFileEditTool 写入多个文件：
// 在操作中添加多个文件条目即可

// 使用 Edit 工具修改已有文件：
// file_path: "D:/doge-code/src/xxx.ts"
// old_string: "要替换的原文"
// new_string: "替换后的文本"
```

**⚠️ 如果 Write/FileWriteTool/FileEditTool/Glob/Grep/Read 等工具均不可用：请立即停止操作，告知用户「写文件/搜索工具不可用，无法继续」，不要尝试用任何 bash 命令替代。**

## 开发命令

```bash
# ====== 安装与构建 ======
bun install                # 安装依赖
bun link                   # 全局注册 doge 命令
bun run build              # 编译为独立可执行文件 (doge/)
bun run version            # 输出版本号

# ====== 开发启动 ======
bun run dev                # TUI 开发模式（直接运行 bootstrap-entry.ts）
bun run start              # 同 dev

# ====== 代码质量 ======
bun run lint               # Biome 检查 src/（规则宽松）
bun run lint:fix           # Biome 自动修复
bun run format             # Biome 格式化 src/

# ====== Windows 批处理脚本 ======
install.bat                # 安装依赖 + 补充 OpenTelemetry 包
complie.bat                # bun build --compile 为 doge.exe 并复制到 F:\bin\
d.bat                      # 设置环境变量后启动 doge.exe --debug-file（推荐开发用）
run.bat                    # 备用启动脚本
```

**快速更新流程**: `git pull && bun install && bun link`

## 启动与初始化流程

### 入口链

```
bootstrap-entry.ts          # 读取 .doge/api.json → 设置环境变量 → 导入 CLI 入口
    ↓
entrypoints/cli.tsx         # 解析 CLI 参数 → 快速路径（--version / daemon / bridge）→ 启动 Ink TUI
    ↓
main.tsx (4395 行)          # init() → 初始化 GrowthBook/遥测/策略限制 → 启动 QueryEngine
    ↓
query.ts (1503 行)          # 主消息循环：user message → tool calls → tool results → continue/recover/crash
    ↓
QueryEngine.ts (1254 行)    # 子代理查询执行引擎
```

### 关键注册文件

| 文件 | 行数 | 职责 |
|------|------|------|
| `src/commands.ts` | 823 | 命令注册中心（155 个斜杠命令），memoize 懒加载 |
| `src/tools.ts` | 442 | 工具注册中心（85+ 个工具），每目录独立实现 |
| `src/core.ts` | 1236 | 核心逻辑 |
| `src/context.ts` | 220 | 全局上下文聚合（Git 状态/系统上下文/用户上下文） |
| `src/Tool.ts` | ~700 | 工具接口定义 + 生命周期 |

### 启动初始化（main.tsx init()）

`bootstrap-entry.ts` 读取 `.doge/api.json` 配置：
- 找到 `activePreset` → 读取对应 `presets[presetName]`
- 根据 `provider` 字段（`anthropic` / `openai`）设置环境变量
  - `ANTHROPIC_BASE_URL`、`DOGE_API_KEY`、`ANTHROPIC_MODEL`、`CLAUDE_CODE_COMPATIBLE_API_PROVIDER`
- 若未配置 → 使用 `http://0.0.0.0:1` 作为 fallback，避免 SDK 报错

`entrypoints/cli.tsx` 有大量快速路径（`--version`、`daemon`、`bridge`、`remote-control`、`--bg` 等），跳过完整 CLI 加载以优化启动速度。

### 特性标记系统（编译时死代码消除）

使用 Bun `feature()` 宏在 `bun:bundle` 中实现条件编译：

| 标记 | 作用 |
|------|------|
| `BRIDGE_MODE` | OpenAI ↔ Anthropic 桥接模式 |
| `PROACTIVE` / `KAIROS` | 主动功能 / 高级 AI 功能 |
| `AGENT_TRIGGERS` | 定时任务触发器 |
| `VOICE_MODE` | 语音模式 |
| `ULTRAPLAN` | 高级计划模式 |
| `WORKFLOW_SCRIPTS` | 工作流脚本 |
| `CONTEXT_COLLAPSE` | 上下文折叠 |
| `FORK_SUBAGENT` | Fork 子代理 |
| `BG_SESSIONS` | 后台会话管理 |
| `BYOC_ENVIRONMENT_RUNNER` | 自托管运行器 |
| `DAEMON` | 守护进程模式 |

### 查询引擎状态机（query.ts）

主循环核心状态：
1. **idle** → 等待用户输入
2. **responding** → 发送请求 + 流式接收响应 + 处理 tool_use
3. **needs_user** → 请求用户授权/输入（权限提升/澄清问题）
4. **should_continue** → 响应完成，自动进入下一轮（工具结果处理完）
5. **done** / **crashed** / **aborted_by_user** → 终止态

关键逻辑：
- `normalizeMessagesForAPI()` — 将内部消息格式转换为 SDK 格式
- `handleToolResults()` — 处理工具调用结果，调度下一轮
- Token 预算控制：`tokenBudget.ts` 中的 `isNearLimit()` / `isAtLimit()`
- 自动压缩：`services/compact/autoCompact.ts` 检测达到阈值时触发

### API 客户端架构

`src/services/api/` 包含两个核心 API 客户端：

- **`claude.ts`** — Anthropic Messages API 原生客户端（通过 `@anthropic-ai/sdk`）
- **`openaiCompat.ts`** — OpenAI Chat Completions API 适配器（通过 Bridge 层转换协议）
- **`bootstrap.ts`** — 启动时选择正确的 API 客户端
- **`withRetry.ts`** — 重试逻辑 + FallbackTriggeredError
- **`errors.ts`** — API 错误分类（PROMPT_TOO_LONG / RATE_LIMIT / AUTH 等）
- **`filesApi.ts`** — 文件上传 API
- **`sessionIngress.ts`** — 会话入口认证

## 核心架构

### 关键子系统

| 子系统 | 目录 | 核心职责 |
|--------|------|----------|
| **查询引擎** | `src/query.ts` + `src/QueryEngine.ts` | 主消息循环、工具调用调度、状态转换、Token 预算控制 |
| **API 客户端** | `src/services/api/claude.ts` + `src/services/api/openaiCompat.ts` | Claude SDK 与 OpenAI 兼容 API 的双向支持 |
| **Bridge 层** | `src/bridge/` (31 文件) | OpenAI ↔ Anthropic 协议转接、会话轮询、SSE/WebSocket、可信设备 |
| **协调器** | `src/coordinator/` (2 文件) | 子代理编排（coordinatorMode.ts / workerAgent.ts） |
| **任务系统** | `src/tasks/` (8 目录/文件) | LocalAgentTask / DreamTask / RemoteAgentTask / LocalMainSessionTask |
| **状态管理** | `src/state/` + `src/bootstrap/state.ts` | AppState 定义、store 持久化、会话级状态 |
| **服务层** | `src/services/` (30+ 子目录) | API 客户端、MCP、遥测分析、策略限制、OAuth、Plugin 服务、上下文集、记忆同步 |
| **MCP 系统** | `src/services/mcp/` + `.mcp.json` | MCP 服务器连接管理、工具调用代理、认证 |
| **技能系统** | `src/skills/` + `src/utils/skills/` | 内置技能、磁盘加载技能（`.claude/skills/`）、MCP 技能构建 |
| **插件系统** | `src/utils/plugins/` (44 文件) + `src/commands/plugin/` (19 文件) | 插件加载器、市场管理器、安装管理 |
| **常量层** | `src/constants/` (22 文件) | 系统提示词、预设、配置、XML 标签、速率限制 |
| **Hooks** | `src/hooks/` (100+ hooks) | 所有 Ink TUI 组件的 React hooks（会话、权限、语音、快捷键等） |
| **UI 组件** | `src/components/` (120+ 文件) | Ink TUI 共享组件（对比查看器/状态栏/PromptInput/TaskList 等） |
| **工具函数** | `src/utils/` (150+ 文件) | 所有非组件逻辑（git/模型/权限/遥测/序列化/文件操作/配置等） |

### 命令与工具目录结构

```
src/commands/          # 155 个斜杠命令，每命令一个目录或文件
├── clear/             # /clear - 清空会话
├── model/             # /model - 切换模型
├── backup/            # /backup - 备份会话
├── compact/           # /compact - 压缩上下文
├── resume/            # /resume - 恢复会话
├── plugin/            # /plugins - 插件管理（19 组件文件）
├── mcp/               # /mcp - MCP 服务器管理
├── agents/            # /agents - 代理管理
├── buddy/             # /buddy - 伙伴系统
├── database/          # /database - 数据库工具
└── ... (其余 140+)

src/tools/             # 85+ 个工具实现，每工具一个目录
├── BashTool/          # 终端命令执行
├── FileReadTool/      # 文件读取
├── FileWriteTool/     # 文件写入（Write 工具）
├── MultiFileEditTool/ # 多文件编辑
├── GrepTool/          # 全文搜索
├── GlobTool/          # 文件匹配
├── MCPTool/           # MCP 工具调用
├── AgentTool/         # 子代理执行
├── SkillTool/         # 技能执行
├── WebSearchTool/     # 网络搜索
├── WebFetchTool/      # 网页抓取
├── AgentTool/         # 自定义 Agent 执行
├── TodoWriteTool/     # 待办事项记录
└── ... (其余 70+)
```

### 插件系统架构

插件系统分为两层：

**加载层** (`src/utils/plugins/`, 44 文件):
- `pluginsLoader.ts` / `marketplaceManager.ts` — 核心加载
- `loadPluginCommands.ts` / `loadPluginAgents.ts` / `loadPluginHooks.ts` — 注册
- `dependencyResolver.ts` — 依赖解析
- `installedPluginsManager.ts` — 已安装插件管理
- `mcpPluginIntegration.ts` — MCP 插件集成

**命令层** (`src/commands/plugin/`, 19 文件):
- `index.ts` — `/plugins` 命令入口
- `BrowseMarketplace.tsx` / `AddMarketplace.tsx` — 市场 UI
- `ManagePlugins.tsx` / `ManageMarketplaces.tsx` — 管理 UI
- `PluginOptionsFlow.tsx` / `PluginTrustWarning.tsx` — 配置/信任

### MCP 服务架构

`src/services/mcp/` — 完整的 MCP (Model Context Protocol) 子系统：
- 连接管理、工具代理、资源管理
- `McpAuthTool` / `MCPTool` / `McpToolSearchTool` 等工具
- `.mcp.json` 配置文件定义 MCP 服务器：
  ```json
  {
    "mcpServers": {
      "github": { "command": "cmd", "args": ["/c", "npx", "-y", "@modelcontextprotocol/server-github"] },
      "claude-kit": { "command": "cmd", "args": ["/c", "npx", "-y", "@chris1807/claude-kit"] },
      "playwright": { "command": "cmd", "args": ["/c", "npx", "@playwright/mcp"] }
    }
  }
  ```

### 常量与配置

| 文件 | 说明 |
|------|------|
| `src/constants/presets.ts` | 78+ API 预设分组：Chinese AI(9)、US AI(13)、Gateway(6)、Local(5)、Cloud(3)、Tool(7)、Messaging(21) |
| `src/constants/prompts.ts` | 系统提示词模板（被大幅汉化精简） |
| `src/constants/system.ts` | 系统级常量 |
| `src/constants/xml.ts` | XML 标签定义 |
| `src/constants/outputStyles.ts` | 输出样式配置 |
| `src/constants/toolLimits.ts` | 工具使用限制 |
| `src/constants/apiLimits.ts` | API 速率限制 |
| `src/constants/betas.ts` | Beta 功能标记 |
| `src/constants/keys.ts` | 快捷键定义 |

### 屏幕与组件

| 目录 | 说明 |
|------|------|
| `src/screens/` | 全屏屏幕组件（Doctor/REPL/ResumeConversation） |
| `src/components/` (120+ 文件) | 共享 Ink TUI 组件（Selector/Spinner/Stats/TaskList/PromptInput/StatusLine 等） |
| `src/components/design-system/` | 设计系统组件 |
| `src/components/permissions/` | 权限对话框组件 |
| `src/components/skills/` | 技能管理 UI |
| `src/ink/` | 自维护 Ink TUI 框架版本 |
| `src/cli/` | CLI 组件（传输/打印/处理） |

### 模型与 Provider 系统

`src/utils/model/` (16 文件):
- `model.ts` — 核心模型选择逻辑
- `modelCapabilities.ts` — 各模型能力声明
- `aliases.ts` — 模型别名
- `providers.ts` — Provider 枚举和检测
- `validateModel.ts` — 模型有效性校验
- `modelCost.ts` — Token 计价
- `configs.ts` — Provider 特定配置

### 技能系统

- **内置技能**: `src/skills/` — 编译时打包进二进制
- **磁盘技能**: `.claude/skills/` (2688+ 个目录) — 运行时热加载，每目录一个 SKILL.md
- **加载逻辑**: `src/skills/loadSkillsDir.ts` + `src/utils/skills/skillChangeDetector.ts`
- **MCP 技能**: `src/skills/mcpSkills.ts` + `src/skills/mcpSkillBuilders.ts`

### Git 与版本管理

- 提交时自动添加 `Co-Authored-By: kaixings <30445355@qq.com>`
- `src/utils/git/` — git 配置解析、文件系统操作、.gitignore 处理
- 标准提交流程：修改 → lint (`biome check src/`) → 构建测试 → 提交

### 配置隔离

- **用户级**: `~/.doge/` — 全局配置、会话数据、缓存
- **项目级**: `.doge/api.json` — 项目 API 配置（活跃预设、模型选择）
- **环境变量优先**: `DOGE_API_JSON` 可覆盖 api.json 路径
- `.doge/` 目录下 90+ 个预设 JSON，每个对应不同 Provider/模型组合

## 常用斜杠命令速查

| 分类 | 命令 |
|------|------|
| **会话** | `/clear` `/backup` `/resume` `/rename` `/rewind` `/compact` `/context` |
| **模型/API** | `/model` `/effort` `/login` `/bridge` `/bridge-kick` `/add-model` `/remove-model` |
| **任务/Agent** | `/plan` `/task-create` `/ultrareview` `/agents` `/buddy` `/advisor` `/brief` |
| **插件/工具** | `/mcp` `/mcp-tool-search` `/plugins` `/skills` `/add-dir` `/database` |
| **系统/调试** | `/doctor` `/metrics` `/monitor` `/stats` `/cost` `/logger` `/ant-trace` `/sandbox-toggle` `/debug-tool-call` `/cache` `/diagnose` |
| **代码/协作** | `/commit` `/commit-push-pr` `/review` `/pr_comments` `/diff` `/branch` `/init` `/issue` |

## 常用环境变量

| 变量 | 说明 |
|------|------|
| `DOGE_API_JSON` | 指定 api.json 路径（开发用） |
| `BASH_DEFAULT_TIMEOUT_MS` | Bash 工具默认超时（默认 600000） |
| `STREAM_IDLE_TIMEOUT_MS` | 流空闲超时（默认 600000） |
| `CLAUDE_CODE_MAX_CONTEXT_TOKENS` | 最大上下文 Token（默认 128000） |
| `CLAUDE_CODE_MAX_OUTPUT_TOKENS` | 最大输出 Token（默认 40000） |
| `CLAUDE_CODE_VERBOSE` | 开启详细日志 |
| `CLAUDE_CODE_COMPATIBLE_API_PROVIDER` | API 兼容模式（openai/anthropic） |

## ⚠️ Windows 开发注意事项

### Git Bash (MSYS2) 路径与转义限制

- 文件系统路径使用 Windows 原生格式（`D:/doge-code/...`）
- Bash Tool 底层由 MSYS2 驱动，**反斜杠 `\` 会自动转换为 `/`**
- 避免在 bash 命令中直接使用 `\n` 等转义序列，改用 `chr(10)` 或 `String.fromCharCode(10)`
- 不使用 Linux 路径（`/tmp/`、`/dev/`、`/etc/`）
- 临时文件放当前工作目录，不用 `/tmp`

### ESM 模块约定

- `src/` 下大量 `.ts` 文件使用 `.js` 扩展名进行导入（TypeScript ESM 惯例）
- 导入路径使用 `.js` 后缀指向 `.ts` 源文件
- `"type": "module"` 在 `package.json` 中声明

### 开发调试技巧

- `d.bat` 启动时自动删除旧的 debug.log / debug.txt
- `--debug-file ./debug.txt` 输出详细日志
- `--dangerously-skip-permissions` 跳过权限确认（开发环境使用）
- `--verbose` 输出详细日志
- `--add-dir .` 将当前目录添加到项目列表
