# CLAUDE.md

此文件为 Claude Code (claude.ai/code) 在处理此代码库时提供指导。

## 项目概述

**Doge Code** — Claude Code 的中文定制 Fork，核心特性：
- 完整中文本地化（提示词/UI/错误信息）
- OpenAI Chat Completions ↔ Anthropic Messages 双向转接层（`src/bridge/`）
- 78+ 预设 Provider 管理（`src/constants/presets.ts`）
- Bun 编译为独立可执行文件 `doge.exe`
- 配置隔离于 `~/.doge/`，项目级配置 `.doge/api.json`

- **运行环境**: Bun 1.3.5+ / Node.js 24+
- **包管理器**: Bun (`package.json` 声明 `"packageManager": "bun@1.3.5"`)
- **语言**: TypeScript + React (Ink TUI) + JSX
- **TypeScript 配置**: `tsconfig.json` — target ESNext, module bundler 模式, JSX react-jsx, strict=false, skipLibCheck=true
- **全局命令名**: `doge`（`bun link` 注册 `@doge-code/cli`）

## ⚠️ DANGER：本项目运行在 Windows Git Bash 下，禁止用 Bash 写 TS/JS 文件

**🔴 最高优先级规则（违反必报错）：写文件必须用 `Write` 工具**

本项目已经内置了 `Write` 工具（FileWriteTool，工具名为 `Write`）。
它通过 API 直接写入文件，**不经过 shell**，不会遇到 Windows Git Bash 的转义问题。

**规则**：任何时候需要创建新文件或覆盖已有文件，**必须**使用 `Write` 工具
（参数：`file_path`=绝对路径，`content`=文件内容），而不是通过 bash 写入。

**记录在案、已证实的失败案例：**
- `python3 -c "with open(...)"` → MSYS2 吃掉换行和引号，语法报错
- `node -e "fs.writeFileSync(...)"` → 同上
- `cat > file << 'EOF'` → MSYS2 吃掉所有换行符，多行变一行
- `echo 'content' > file` → echo 不处理换行，多行内容无法写入
- `printf '%b' '\n'` → MSYS2 printf 的 `\n` 解析与非 POSIX 实现不一致

**正确的操作方式（唯一选择）：**
```typescript
// 使用 Write 工具：
// file_path: "D:/doge-code/src/xxx.ts"
// content: "多行文件内容\n直接传入"
```

**⚠️ 如果你发现 Write 工具不可用：请立即停止操作，告知用户「Write 工具不可用，无法写文件」，不要尝试用任何 bash 命令写文件。**

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
entrypoints/cli.tsx         # 解析 CLI 参数 → 启动 Ink TUI 应用
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
| `src/commands.ts` | 823 | 命令注册中心（156 个斜杠命令），memoize 懒加载 |
| `src/tools.ts` | 442 | 工具注册中心（84 个工具），每目录独立实现 |
| `src/core.ts` | 1236 | 核心逻辑 |
| `src/context.ts` | 220 | 全局上下文聚合（Git 状态/系统上下文/用户上下文） |
| `src/Tool.ts` | ~700 | 工具接口定义 + 生命周期 |

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

## 核心架构

### 关键子系统

| 子系统 | 目录 | 核心职责 |
|--------|------|----------|
| **Bridge 层** | `src/bridge/` (31 文件) | OpenAI ↔ Anthropic 消息格式转换、会话轮询、心跳重连、SSE/WebSocket、可信设备 |
| **查询引擎** | `src/query.ts` + `src/QueryEngine.ts` | 主消息循环、工具调用调度、状态转换、Token 预算控制 |
| **协调器** | `src/coordinator/` | 子代理编排（coordinatorMode.ts / workerAgent.ts） |
| **任务系统** | `src/tasks/` | LocalAgentTask / DreamTask / RemoteAgentTask / LocalMainSessionTask |
| **状态管理** | `src/state/` + `src/bootstrap/state.ts` | AppState 定义、store 持久化 |
| **服务层** | `src/services/` | API 客户端(openaiCompat.ts/claude.ts)、MCP、遥测分析、策略限制、OAuth |
| **技能系统** | `src/skills/` + `src/utils/skills/` | 内置技能、磁盘加载技能、MCP 技能构建 |
| **插件系统** | `src/utils/plugins/` + `src/commands/plugin/` (15+ 组件) | pluginLoader / marketplaceManager / 插件市场 UI |
| **Hooks** | `src/hooks/` (100+ hooks) | 所有 Ink TUI 组件的 React hooks（会话管理、权限、语音、快捷键等） |

### 命令与工具目录结构

```
src/commands/          # 156 个斜杠命令，每命令一个目录或文件
├── clear/             # /clear - 清空会话
├── model/             # /model - 切换模型
├── backup/            # /backup - 备份会话
├── compact/           # /compact - 压缩上下文
├── resume/            # /resume - 恢复会话
├── plugin/            # 插件管理（15+ 组件）
├── mcp/               # MCP 服务器管理
├── agents/            # 代理管理
├── buddy/             # 伙伴系统
└── ... (其余 140+)

src/tools/             # 84 个工具实现，每工具一个目录
├── BashTool/          # 终端命令执行
├── FileReadTool/      # 文件读取
├── FileWriteTool/     # 文件写入
├── MultiFileEditTool/ # 多文件编辑
├── GrepTool/          # 全文搜索
├── GlobTool/          # 文件匹配
├── MCPTool/           # MCP 工具调用
└── ... (其余 75+)
```

### 常量与配置

| 文件 | 说明 |
|------|------|
| `src/constants/presets.ts` | 78+ API 预设分组：Chinese AI(9)、US AI(13)、Gateway(6)、Local(5)、Cloud(3)、Tool(7)、Messaging(21) |
| `src/constants/prompts.ts` | 系统提示词模板 |
| `src/constants/system.ts` | 系统级常量 |
| `src/constants/xml.ts` | XML 标签定义 |
| `src/constants/outputStyles.ts` | 输出样式配置 |
| `src/constants/toolLimits.ts` | 工具使用限制 |
| `src/constants/apiLimits.ts` | API 速率限制 |

### 屏幕与组件

| 目录 | 说明 |
|------|------|
| `src/screens/` | 全屏屏幕组件（Doctor/REPL/ResumeConversation） |
| `src/components/` | 共享 Ink TUI 组件（Selector/Spinner/Stats/TaskList/PromptInput 等） |
| `src/ink/` | 自维护 Ink TUI 框架版本 |
| `src/cli/` | CLI 组件（传输/打印/处理） |

## 常用斜杠命令速查

| 分类 | 命令 |
|------|------|
| **会话** | `/clear` `/backup` `/resume` `/rename` `/rewind` `/compact` `/context` |
| **模型/API** | `/model` `/effort` `/login` `/bridge` `/bridge-kick` `/add-model` |
| **任务/Agent** | `/plan` `/task-create` `/ultrareview` `/agents` `/buddy` `/advisor` |
| **插件/工具** | `/mcp` `/mcp-tool-search` `/plugins` `/skills` `/add-dir` |
| **系统/调试** | `/doctor` `/metrics` `/monitor` `/stats` `/cost` `/logger` `/ant-trace` `/sandbox-toggle` `/debug-tool-call` `/cache` |

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
