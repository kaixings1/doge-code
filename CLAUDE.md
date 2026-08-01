# CLAUDE.md

此文件为 Claude Code (claude.ai/code) 在处理此代码库时提供指导。

## 项目概览

这是一个 Claude Code 源代码仓库（@doge-code/cli），是一个基于 TypeScript/React 的 CLI 工具，集成了 AI 代理、工具系统、命令系统和插件体系。项目使用 Bun 作为运行时（v1.3.5+），依赖 Node 24+。

## 常用命令

```bash
# 开发启动（热重载）
bun run dev

# 生产构建
bun run build

# 代码检查
bun run lint
bun run lint:fix  # 自动修复

# 格式化代码
bun run format

# 运行测试
# 集成测试（连接真实数据库）
bun test src/__tests__/integration
# 端到端测试
bun test src/__tests__/e2e
```

运行单个测试：`bun test <test-file-name>.test.ts`

## 核心架构结构

```
src/
├── entrypoints/           # 入口点：cli.tsx (CLI), dev-cli.tsx (开发模式)
├── engine/                # 核心 AI 引擎：状态机 + 消息循环 + 工具调度
├── tools/                 # 工具系统：70+ 工具（BashTool, FileReadTool 等）
├── commands/              # 命令系统：70+ CLI 命令（review, deploy, plan 等）
├── skills/                # 技能系统：技能加载与执行
├── plugins/               # 插件系统：builtinPlugins, bundledPlugins
├── api/                   # API 层：CommandRegistry, ToolRegistry, SessionManager
├── state/                 # 状态管理：AppStateStore
├── bridge/                # 桥接层：桌面/远程会话桥接
├── remote/                # 远程会话管理
├── tasks/                 # 任务系统：任务队列与执行
├── memory/                # 记忆系统：记忆读取/写入
├── screen/                # 终端 UI：REPL.tsx, 状态行组件
```

## 核心功能区（特性吸收计划产物）

以下功能模块均已实现并通过 `bun run build` 完整编译验证（对应 `TODO_feature_absorption_plan.md` 的状态追踪表）。此列表是理解本项目扩展能力的功能地图：

| # | 功能模块 | 核心实现文件 | 命令/入口 | 说明 |
|---|---------|------------|----------|------|
| 1 | 并排 Diff 视图 | `src/components/SideBySideDiff.tsx` | `/diff-mode`（`src/commands/diff-mode/`）| GitHub 风格左右对照 diff 渲染 |
| 2 | 块状结构化输出 | `src/components/tools/ToolOutputBlock.tsx` | `/block-mode`（`src/commands/block-mode/`）| Bash/工具输出的独立边框+折叠块 |
| 3 | Repo Map 代码库映射 | `src/engine/repoMap.ts` | `/repo-map`（`src/commands/repo-map/`）| Aider 风格目录结构 + 符号分组 AI 摘要 |
| 4 | 流式渲染优化 | `src/components/Spinner.tsx` | streamingPerformance 设置 | token 计数 + 实时渲染节流 |
| 5 | 多 Tab/会话管理 | `src/commands/sessions/` | `/sessions` | 类似 tmux 的多会话切换 |
| 6 | 浏览器自动化 | `src/tools/WebBrowserTool/WebBrowserTool.ts` + `src/commands/browser/` | `/browser` | Playwright 集成，运行时懒加载 `import('playwright')` |
| 7 | 代码库向量存储 | `src/engine/codeVectorStore.ts` | `/vector-search`（`src/commands/vector-search/`）| bun:sqlite + SQLite FTS5 + BM25 全文索引（零外部 embedding 依赖）|
| 8 | Git 工作流集成 | `src/commands/commit-push-pr.ts` | `/commit-push-pr` | AI commit message + 推送 + PR |
| 9 | 多模态图片预览 | `src/components/ImageDisplay.tsx` + `src/ink/termio/osc.ts` | 随 image tool_use 触发 | iTerm2/Kitty/tmux inline image 协议；**不依赖 ink（避免 top-level await 编译冲突）** |
| 10 | 代码搜索增强 | `src/commands/code-search/` | `/code-search` | regex + semantic + hybrid + symbol 四模式，30+ 语言过滤 |
| 11 | 超长上下文窗口 | `src/utils/model/model.ts` | gemini-2-0-flash/pro 映射 | Gemini 1M/2M + Opus 1M 上下文（`modelSupports1M`, `[1m]` 后缀）|
| 12 | Docker 沙箱隔离 | `src/utils/sandbox/docker-sandbox.ts` | `DockerSandboxManager` 类 | 容器内执行 bash，工作目录映射 + extra mount |
| 13 | AI 测试生成 | `src/commands/test-gen.ts` | `/test-gen` | prompt 命令，vitest/pytest/go/cargo 多框架 + 5 轮修复循环 |
| 14 | 安全扫描 | `src/commands/security-audit/` | `/security-audit`（别名 `/audit`,`/sast`）| local 命令，6 种规则（SQL注入/XSS/命令注入/硬编码密钥等）+ 递归扫描 + JSON/text 输出 |
| 15 | 多 Agent 协作 | `src/tools/AgentTool/AgentTool.tsx` + `src/cli/handlers/agents.ts` | AgentTool + `/agents` | 复用项目既有通用 Agent（general-purpose/plan/explore 等）|

**注意**：
- 特性 6/9（浏览器、多模态）的 `ImageDisplay` 组件**不得使用 `require('ink')`/`useStdout()`**——ink/reconciler 含 top-level await，会触发 `bun build --compile` 报 "require call not allowed"。应使用 `useEffect` + `process.stdout.write`。
- 特性 15 主要复用项目既有 AgentTool 子系统，TODO 中宣称的 `AgentMemory.ts`/`ForkSubagent.ts` **不存在**，勿按 TODO 描述去查找这些文件。

## 关键文件

- `src/entrypoints/cli.tsx` / `src/bootstrap-entry.ts`：应用启动入口，包含多个快速路径
- `src/engine/index.ts`：QueryEngine 核心，聚合状态机、消息循环、工具调度
- `src/tools.ts`：所有工具的定义与导出
- `src/commands.ts`：所有 CLI 命令的注册
- `src/api/CommandRegistry.ts`：命令注册表
- `src/api/ToolRegistry.ts`：工具注册表
- `src/state/AppStateStore.ts`：全局应用状态
- `src/Task.ts`：任务定义与执行

## 工具系统

工具在 `src/tools/` 目录中实现，每个工具是一个 TS 类（如 BashTool, FileReadTool）。工具通过 ToolRegistry 注册，通过 ToolScheduler 调度执行。

工具执行返回格式：`{ content: string | Array<...> }`，内容会被转换为字符串。

## 命令系统

命令在 `src/commands/` 目录中，每个命令是一个文件夹（如 review, deploy），包含 index.ts 或.ts 文件。命令通过 CommandRegistry 注册，支持子命令和选项。

## 记忆系统

记忆存储在 `.claudeskills/` 或 `temp/` 目录：
- `memoryTool.ts`：记忆读取/写入接口
- `memdir.ts`：记忆目录管理

## 状态管理

- `AppStateStore.ts`：状态 store
- `selectors.ts`：状态选择器
- 状态通过 hooks 访问（useSettings, useTasksV2 等）

## 开发注意事项

1. **类型安全**：项目使用严格 TypeScript，避免 any 类型
2. **文件 I/O**：使用 FileReadTool, FileWriteTool 而非原生 fs
3. **系统命令**：通过 BashTool 执行，输入输出为字符串
4. **状态更新**：通过 state store 的 set() 方法更新，触发响应式更新
5. **日志**：通过 LoggerTool 或 process.env.LOG_LEVEL 控制
6. **Bun 特性**：使用 feature() 进行构建时死代码消除，使用 profileCheckpoint() 进行性能分析
7. **环境变量**：使用 process.env.CLAUDE_CODE_* 前缀的项目环境变量

## 测试实践

- **集成测试** (`src/__tests__/integration/`)：连接真实数据库/服务
- **端到端测试** (`src/__tests__/e2e/`)：模拟完整用户流程
- **性能测试** (`src/__tests__/performance/`)：基准测试

## 构建与部署

```bash
# 预构建（嵌入状态行）
bun run prebuild

# 最终构建
bun run build
# 输出：./doge (CLI 可执行文件)
```

项目使用 GitHub Actions（.github/workflows/）进行 CI。

## 提交规范

- **时间戳**：所有提交消息标题末尾必须追加 ` [yyyy-mm-dd HH:MM:SS]` 格式的时间戳
- **.gitignore**：每次提交必须同步暂存 `.gitignore`，将新出现的构建产物/临时目录纳入忽略规则
- 自动通过 `.git/hooks/commit-msg` hook 追加时间戳，无需手动添加

## 权限与安全

- 权限检查通过 PermissionManager 接口
- 密钥管理在 src/security/CredentialManager.ts
- 工具执行在 SandboxExecutor.ts 中进行沙箱隔离

## 重要 API

```typescript
// 启动应用
await import('./src/bootstrap-entry.ts').default()

// 创建工具
const tools = await import('./src/tools.ts')
const bashTool = tools.BashTool()

// 执行命令
await import('./src/cli.tsx').default(['review'])

// 访问状态
const state = useAppState()
```

## 工作目录

当前工作目录：D:\doge-code

## 平台信息

- 操作系统：Windows 11 Pro 10.0.26200
- Shell：Git Bash（MSYS2）
