---

# 第四十一部分：桌面端主进程深度参考

## 41.1 CRDT 文档协作引擎（DocumentManager）

基于操作日志的 Conflict-free Replicated Data Type 文档同步：

```typescript
// 核心类型
interface DocOperation {
  id: string              // 操作唯一 ID
  roomId: string          // 所属房间
  userId: string          // 操作者
  type: 'insert' | 'delete'
  position: number        // 文档中的位置
  text?: string           // insert 时的文本内容
  length?: number         // delete 时的删除长度
  lamport: number         // Lamport 逻辑时钟
  parentVersion: number   // 基于哪个文档版本
  timestamp: number       // 物理时间戳
}

// 核心方法
const docManager = new DocumentManager()
docManager.createRoom(roomId, initialContent)
docManager.applyOperation(roomId, operation: DocOperation)
docManager.getState(roomId): DocState
docManager.getOperations(roomId, sinceVersion?)
docManager.syncRoom(roomId, remoteOperations: DocOperation[])
```

**特性**：
- 字符粒度操作（insert/delete）
- Lamport 逻辑时钟排序
- 操作变换（OT-like transform）解决冲突
- 所有操作可交换、可幂等，保证最终一致性

## 41.2 WebSocket 信令服务器（RemoteSignalingServer）

内置 WebSocket 信令服务器 + 远程控制协议：

```typescript
// 远程控制消息类型
type RemoteMessageType =
  | 'pointer-move'    // 鼠标移动
  | 'pointer-down'    // 鼠标按下
  | 'pointer-up'      // 鼠标释放
  | 'pointer-wheel'   // 鼠标滚轮
  | 'key-down'        // 键盘按下
  | 'key-up'          // 键盘释放
  | 'clipboard'       // 剪贴板同步

// 启动信令服务器
const signalingServer = new RemoteSignalingServer()
await signalingServer.start(0)  // 0 = 自动分配端口
// 返回实际端口号
```

**架构**：
```
Controller (远程用户)  ←──WebSocket──→  Host (本机用户)
                                ↓
                    WebRTC DataChannel (P2P)
                                ↓
                    鼠标/键盘/剪贴板事件
```

## 41.3 批量处理引擎（BatchEngine）

主进程批量文件处理引擎：

```typescript
// 批量任务配置
interface BatchConfig {
  concurrency: number           // 并发数
  workflowId: string            // 工作流 ID
  retryCount: number            // 重试次数
  timeout: number               // 超时时间
}

// 批量文件项
interface BatchFileItem {
  id: string
  filePath: string
  fileName: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  output?: string
  error?: string
  durationMs?: number
}

// 核心方法
const batchEngine = new BatchEngine()
batchEngine.createJob(name, workflowId, files, config)
batchEngine.startJob(jobId)
batchEngine.cancelJob(jobId)
batchEngine.getJobStatus(jobId)
batchEngine.on('progress', (jobId, item, index, total) => {})
```

**特性**：
- 并发执行工作流（可配置并发数）
- 实时进度推送（IPC event）
- 协作式取消
- 文件读取 + AI 处理 + 结果回写全链路

## 41.4 桌面端权限管理器（DesktopPermissionManager）

Electron 主进程中的权限管理，危险操作弹出系统确认对话框：

```typescript
// 权限决策类型
type PermissionDecision = 'allow' | 'deny' | 'allow_once' | 'ask'

// 权限上下文
interface PermissionContext {
  tool: string
  action: string
  params: Record<string, unknown>
  path?: string
  command?: string
}

// 工具风险等级
const TOOL_RISK: Record<string, 'safe' | 'medium' | 'high'> = {
  BashTool: 'high',
  FileWriteTool: 'high',
  FileEditTool: 'medium',
  // ...
}

// 核心方法
const pm = getPermissionManager()
pm.checkPermission(context: PermissionContext): Promise<PermissionDecision>
pm.addRule(rule: PermissionRule)
pm.removeRule(ruleId: string)
pm.getRules(): PermissionRule[]
```

## 41.5 桌面端 API 客户端（DesktopApiClient）

将内部 APIRequest 格式转换为 Anthropic/OpenAI 兼容格式并发送请求：

```typescript
// 创建客户端
const client = createDesktopApiClient(config: {
  provider: 'anthropic' | 'openai'
  apiKey: string
  model: string
  baseUrl: string
})

// 发送请求（自动处理 SSE 流式响应)
const stream = client.sendMessage(request: APIRequest)
for await (const chunk of stream) {
  // 处理流式响应块
}
```

**支持的格式转换**：
- Anthropic Messages → OpenAI Chat Completions
- OpenAI Chat Completions → Anthropic Messages
- 工具调用格式互转
- 流式 SSE 解析

## 41.6 LSP 客户端管理器（LspClientManager）

管理 LSP 服务器进程，提供代码智能功能：

```typescript
// LSP 服务器配置
interface LspServerConfig {
  name: string           // 服务器名称（如 'typescript'）
  languageId: string     // 语言 ID
  command: string        // 启动命令
  args: string[]         // 启动参数
}

// 核心方法
const lspManager = getLspClientManager()
lspManager.startServer(config: LspServerConfig)
lspManager.stopServer(serverId: string)
lspManager.getDiagnostics(uri: string): LspDiagnostic[]
lspManager.requestCompletion(serverId, position, document)
lspManager.requestHover(serverId, position, document)
lspManager.on('diagnostics', (serverId, diagnostics) => {})
```

**支持的 LSP 服务器**：
- typescript-language-server（TypeScript/JavaScript）
- 可扩展：gopls, rust-analyzer, pyright 等

## 41.7 插件安全沙箱（pluginSandbox）

多层安全防护系统：

```typescript
// 沙箱配置
interface SandboxConfig {
  maxManifestSize: number        // manifest.json 最大字节
  maxCommandFileSize: number     // 单个命令文件最大字节
  maxAgentFileSize: number       // 单个 agent 文件最大字节
  maxCommandsPerPlugin: number   // 最大命令数
  maxAgentsPerPlugin: number     // 最大 agent 数
  maxNestingDepth: number        // 目录最大嵌套深度
  allowedExtensions: string[]    // 允许的文件扩展名
  blockedPatterns: RegExp[]      // 阻止的内容模式
  trustedSources: string[]       // 信任的安装来源
}

// 验证结果
interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}
```

**五层安全防护**：
1. **Manifest 验证** — JSON Schema 校验 + 字段白名单
2. **内容净化** — 防止 XSS/注入/路径遍历
3. **路径安全** — 规范化路径检查，阻止目录逃逸
4. **资源限制** — 文件大小、数量、嵌套深度限制
5. **来源验证** — 安装来源白名单/黑名单

## 41.8 插件市场服务（pluginMarketplace）

精简版插件市场，支持浏览和安装在线插件：

```typescript
// 市场插件信息
interface MarketplacePlugin {
  name: string
  description?: string
  version?: string
  source: string
  repo?: string
  installed: boolean
}

// 核心方法
const marketplace = getMarketplaces()
marketplace.getPlugins(): Promise<MarketplacePlugin[]>
marketplace.installPlugin(plugin: MarketplacePlugin): Promise<void>
marketplace.uninstallPlugin(name: string): Promise<void>
marketplace.checkUpdates(): Promise<MarketplacePlugin[]>
```

## 41.9 会话持久化（sessionStore）

管理对话会话的保存、加载、列出和删除：

```typescript
// 会话存储在 .doge/sessions/ 目录下
const SESSIONS_DIR = path.join(process.cwd(), '.doge', 'sessions')

// 核心 API
saveSession(messages: InternalMessage[], existingId?: string): string
listSessions(): Array<{ id: string; createdAt: string; messageCount: number }>
loadSession(id: string): InternalMessage[]
deleteSession(id: string): boolean
updateSession(id: string, messages: InternalMessage[]): boolean
saveCrashRecovery(messages: InternalMessage[]): void
getCrashRecovery(): InternalMessage[] | null
clearCrashRecovery(): void
```

## 41.10 工具执行器（toolExecutor）

将 70+ CLI 工具适配为 QueryEngine 格式，并提供桌面端快捷执行器：

```typescript
// 创建适配的工具 Map
const adaptedTools = createAdaptedTools(config: {
  provider: 'anthropic' | 'openai'
  apiKey: string
  model: string
  baseUrl: string
  workingDir: string
})
// 返回 Map<string, ToolDefinition>

// 快捷执行器
executeTool(toolName: string, input: Record<string, unknown>): Promise<ToolResult>
rollbackTool(toolUseId: string): Promise<boolean>
getAllOperations(): Array<{ toolUseId: string; tool: string; input: unknown }>
resetAdaptedToolsCache(): void
```

---

# 第四十二部分：桌面端渲染进程深度参考

## 42.1 渲染进程入口

| 文件 | 功能 |
|------|------|
| `renderer/index.html` | HTML 模板（lang=zh-CN、CSP 策略、黑色背景） |
| `renderer/index.tsx` | 渲染进程入口（导出 App 和 main） |
| `renderer/App.tsx` | 主应用组件（整合所有 60+ 面板） |
| `renderer/TerminalPanel.tsx` | xterm.js + node-pty 终端模拟器 |
| `renderer/theme.ts` | 主题系统（dark/light 双色、26 种颜色变量、90+ 样式） |
| `renderer/shared.tsx` | 共享类型/消息解析/语法高亮/Markdown 渲染 |
| `renderer/types/` | 渲染进程类型定义 |
| `renderer/utils/` | 渲染进程工具函数 |

## 42.1a 桌面端 HTML 模板（index.html）

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';" />
    <title>Doge Code</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./index.js"></script>
  </body>
</html>
```

**特性**：
- `lang="zh-CN"` — 中文界面
- CSP 策略：仅允许同源脚本和样式（`unsafe-inline` 用于样式）
- 黑色背景（`#000`）

## 42.1b 桌面端主题系统（theme.ts）

支持 **dark** 和 **light** 两种主题：

```typescript
type ThemeName = 'dark' | 'light'

interface ThemeColors {
  bg, bgAlt, bgPanel, surface, border, borderSubtle: string
  text, textMuted, textFaint: string
  inputBg, userBubble, assistantBubble: string
  accent, accentDim, errorBg, errorBorder, errorText: string
  successText, warningText: string
  toolBg, toolBorder, statusBorder: string
  codeBg, selectionBg, hoverBg: string
}

// 暗色主题（默认）
THEMES.dark = {
  bg: '#000000', accent: '#4ECB71',  // 绿色强调色
  text: '#F5F5F5', textMuted: '#888888',
  errorText: '#FF6B6B', successText: '#4ECB71', warningText: '#FFA500'
}

// 亮色主题
THEMES.light = {
  bg: '#FFFFFF', accent: '#0066CC',  // 蓝色强调色
  text: '#1A1A1A', textMuted: '#666666',
  errorText: '#CC0000', successText: '#16A34A', warningText: '#D97706'
}

// 自动检测系统主题
getEffectiveTheme('auto'): ThemeName
```

**生成 90+ CSS 样式**：`getStyles(theme)` 返回 container/sidebar/chatView/messageBubble 等样式对象。

## 42.1c 桌面端共享工具（shared.tsx）

**消息内容解析**：
```typescript
type ContentBlock = TextBlock | ToolUseBlock | ThinkingBlock | ImageBlock

parseMessageContent(content: string): ContentBlock[]
// 解析 <tool_use>/<thinking> 标签为结构化块
```

**轻量语法高亮**（10 种语言）：
- TypeScript/JavaScript、JSON、CSS/SCSS、HTML、Python、Bash、SQL、YAML、Rust、Markdown

**轻量 Markdown 渲染器**：
```typescript
renderMarkdown(text: string, colors: object): string
// 支持：代码块（带语法高亮+复制按钮）、标题、粗体斜体、链接、列表
```

**内联工具调用块**：
```typescript
InlineToolUseBlock({ block, onExecute, executingIds })
// 可折叠展开的工具调用 UI，支持一键执行
```

## 42.1d 桌面端主应用组件（App.tsx）

整合所有面板的核心组件，导入 60+ 子组件和 15+ Hooks：

```typescript
// 核心状态
const [queryState, setQueryState] = useState<QueryState>('idle')
// QueryState: 'idle' | 'responding' | 'needs_user' | 'should_continue' | 'done' | 'crashed' | 'aborted_by_user'

// 核心 Context
export const ThemeContext = React.createContext<ThemeCtx>({ name: 'dark', colors: THEMES.dark, styles: getStyles('dark') })

// 语法高亮（主题感知）
DARK_SYNTAX = { string: '#CE9178', keyword: '#569CD6', number: '#B5CEA8', comment: '#6A9955', property: '#9CDCFE' }
LIGHT_SYNTAX = { string: '#A31515', keyword: '#0000FF', number: '#098658', comment: '#008000', property: '#001080' }
```

**子组件**：
- `FileTree` / `FileExplorerPanel` — 文件浏览
- `GitChanges` / `GitDiff` / `GitBranchManager` / `GitMergePanel` — Git 操作
- `ToolPanel` / `ToolProgressBar` / `ToolErrorBanner` — 工具执行
- `TerminalPanel` — 终端模拟器
- `VirtualMessageList` — 虚拟滚动消息列表
- `MonacoEditorPanel` / `AdvancedCodeEditor` — 代码编辑器
- `AgentPanel` — 代理面板
- `CommandPalette` — 命令面板
- `OperationHistory` — 操作历史
- `PluginPanel` — 插件面板
- `DatabaseBrowser` — 数据库浏览器
- `ApiTestPanel` — API 测试
- `SnippetPanel` — 代码片段
- `LspPanel` — LSP 面板
- `KanbanBoard` / `TimeTracker` / `ProgressReport` — 项目管理
- `CollaborationPanel` — 协作面板
- `DebuggerPanel` — 调试器
- `CodeReviewPanel` / `AICodeReviewPanel` — 代码审查
- `TestRunnerPanel` — 测试运行器
- `WorkflowPanel` — 工作流面板
- `SemanticSearchPanel` — 语义搜索
- `ReferencesPanel` / `CallChainPanel` — 引用/调用链
- `OutlinePanel` / `SymbolOutlinePanel` — 大纲/符号大纲
- `LogViewer` — 日志查看器
- `NotificationsPanel` — 通知面板
- `PermissionPanel` — 权限面板
- `SecurityAuditPanel` / `SecuritySettings` — 安全审计/设置
- `ThemeEditor` / `ThemeMarketplace` — 主题编辑器/市场
- `InlineSuggestion` / `SmartImportSuggestion` — 内联建议/智能导入
- `FindReplacePanel` / `ColorPickerDialog` — 查找替换/颜色选择
- `ProjectStructurePlanner` — 项目结构规划
- `PerformanceRefactorPanel` — 性能重构
- `OutputPanel` — 输出面板
- `ProblemsPanel` / `IssuesPanel` — 问题/Issue 面板
- `ErrorLensOverlay` — 错误透镜叠加
- `VoiceCallPanel` — 语音通话面板
- `BatchEnginePanel` — 批量引擎面板
- `RemoteControlPanel` — 远程控制
- `SessionLock` — 会话锁定
- `EditorSettingsPanel` / `CodeFormatter` — 编辑器设置/代码格式化
- `RecordingPanel` — 录制面板
- `BreadcrumbBar` — 面包屑导航
- `MarkdownRenderer` — Markdown 渲染器

**Hooks**：
- `useFileTree` / `useProblems` / `useErrorLens` — 数据获取
- `useTerminal` / `useCommandHistory` — 终端交互
- `useLsp` / `useDatabase` / `useApiTest` — 工具集成
- `useWorkflowMode` / `useWorkflowAutomation` — 工作流
- `usePreAnalysis` / `useSmartImport` — AI 建议
- `useCallChain` / `useBreadcrumb` / `useSymbolOutline` — 代码分析
- `useGitStats` / `useTimeTracker` — 统计追踪
- `useColorPicker` / `useFindReplace` / `useOutputChannel` — 编辑器
- `useTabManager` / `useNotifications` / `useMemoryUsage` — UI 管理
- `useDesktopVimInput` — Vim 输入模式

---

# 第四十三部分：桌面端构建配置详解

## 43.1 electron-vite.config.ts

| 配置项 | 说明 |
|--------|------|
| `mainEntry` | 主进程入口：`desktop/src/main/index.ts` |
| `entrypointPath` | 桌面入口：`desktop/src/main/entrypoint.ts` |
| `jsToTsResolver` | 将 .js 导入重写为 .ts/.tsx |
| `externalizeDepsPlugin` | 外部化依赖（不打包 node_modules） |
| `@vitejs/plugin-react` | React 插件 |

## 43.2 electron-builder 配置

| 配置项 | 值 |
|--------|-----|
| appId | `com.doge-code.desktop` |
| productName | `DogeCode` |
| 输出目录 | `release/` |
| 压缩方式 | `maximum` |
| ASAR | 启用 |
| ASAR 解包 | `@electron`, `electron-updater`, `node-pty`, `dist/**/*` |
| 自动更新 | GitHub 发布（provider: github） |

## 43.3 Windows 构建目标

| 目标 | 格式 | 输出文件 |
|------|------|----------|
| NSIS 安装包 | `.exe` | `DogeCode-Setup-{version}.exe` |
| Portable | `.exe` | `DogeCode-Portable-{version}.exe` |

**NSIS 配置**：
- 非一键安装（允许选择安装目录）
- 创建桌面/开始菜单快捷方式
- 卸载时保留用户数据

## 43.4 macOS 构建目标

| 目标 | 格式 | 输出文件 |
|------|------|----------|
| DMG | `.dmg` | `DogeCode-{version}-{arch}.dmg` |

**DMG 配置**：
- 支持 x64 + arm64
-  hardened Runtime
- gatekeeper 评估关闭

## 43.5 Linux 构建目标

| 目标 | 格式 | 输出文件 |
|------|------|----------|
| AppImage | `.AppImage` | `DogeCode-{version}-{arch}.AppImage` |
| deb | `.deb` | `DogeCode-{version}-{arch}.deb` |
| rpm | `.rpm` | `DogeCode-{version}-{arch}.rpm` |

---

# 第四十四部分：持久化规则系统（/rules）

## 44.1 概述

`/rules` 命令管理 `.dogerules` 文件，提供跨会话的持久化指令能力。类似 Cursor 的 `.cursorrules`。

规则按以下顺序加载（后者优先级更高）：

| 级别 | 文件路径 | 说明 |
|------|----------|------|
| **全局规则** | `~/.doge/dogerules` | 适用于所有项目的私有规则 |
| **项目规则** | `./.dogerules` | 签入代码库的团队规则 |
| **本地规则** | `./.dogerules.local` | 个人项目规则（gitignore） |

## 44.2 使用方法

```
/rules init              # 创建项目规则文件
/rules add 使用2空格缩进  # 添加规则
/rules add 提交前必须运行测试
/rules show               # 查看规则详情
/rules list               # 列出所有规则
/rules edit # 新规则内容  # 替换整个规则文件
/rules remove 2           # 删除第2行规则
/rules clear              # 清空项目规则
```

## 44.3 规则示例

```markdown
# 编码规范
- 代码风格使用 2 空格缩进
- 提交前必须运行测试
- 使用 TypeScript 而非 JavaScript
- 优先使用函数式编程风格

# 项目约定
- API 路由使用 RESTful 规范
- 数据库查询使用 Prisma ORM
- 日志使用 pino 库
```

## 44.4 技术实现

| 文件 | 功能 |
|------|------|
| `src/commands/rules/index.ts` | `/rules` 命令实现 |
| `src/utils/dogerules.ts` | 规则加载/解析工具 |

```typescript
// 核心接口
interface DogerulesEntry {
  path: string       // 规则来源路径
  content: string    // 规则内容
  priority: number   // 优先级（数字越大优先级越高）
  type: 'global' | 'project' | 'local'
}

// 核心函数
loadDogerules(projectRoot?: string): DogerulesEntry[]
formatDogerulesForSystemPrompt(entries: DogerulesEntry[]): string
hasDogerules(projectRoot?: string): boolean
```

---

# 第四十五部分：用量分析仪表盘（/dashboard）

## 45.1 概述

`/dashboard` 命令启动 Web 可视化仪表盘，实时展示用量统计和费用分析。

## 45.2 使用方法

```
/dashboard open           # 启动仪表盘（浏览器访问 http://127.0.0.1:3456）
/dashboard stop           # 停止仪表盘
/dashboard status         # 查看当前统计
/dashboard export         # 导出数据到 JSON
/dashboard reset          # 重置统计数据
```

**别名**：`/stats`、`/usage`

## 45.3 仪表盘功能

- 📊 **总体统计** — 总费用、总 Token、缓存命中、代码变更、运行时长
- 🤖 **按模型统计** — 各模型的 Token 用量和费用占比
- 📈 **每日趋势** — 按天统计的使用量变化
- 🔄 **自动刷新** — 每 30 秒自动更新数据

## 45.4 API 端点

| 端点 | 说明 |
|------|------|
| `GET /` | Web 仪表盘界面 |
| `GET /api/stats` | JSON 格式统计数据 |
| `GET /api/health` | 健康检查 |

## 45.5 技术实现

| 文件 | 功能 |
|------|------|
| `src/commands/dashboard/index.ts` | `/dashboard` 命令实现 |

```typescript
// 核心函数
startDashboardServer(port: number): Promise<number>
stopDashboardServer(): void
isDashboardRunning(): boolean
getDashboardPort(): number
getDashboardData(): DashboardData
```

---

# 第四十六部分：IDE 扩展

## 46.1 VS Code 扩展

Doge Code 提供 VS Code 扩展，让开发者可以在 IDE 中直接使用 AI 能力。

**安装：**
```bash
cd vscode-extension
npm install
npm run compile
# 在 VS Code 中按 F5 启动调试
```

**功能：**
- 🐕 AI 聊天面板 — 在 VS Code 中与 Doge Code 对话
- 📊 用量统计 — 快速查看当前会话费用
- ⚙️ 配置面板 — 自定义服务器地址和功能开关

**命令：**
- `Doge Code: 打开聊天` — 打开聊天面板
- `Doge Code: 显示用量统计` — 显示费用统计

**技术实现：**
- `.claude/agents/developer-experience/vscode-extension.md` — 扩展开发指南

## 46.2 JetBrains 插件

Doge Code 提供 JetBrains 插件，支持全系列 JetBrains IDE。

**构建：**
```bash
cd jetbrains-plugin
./gradlew buildPlugin
```

**功能：**
- 🐕 侧边栏聊天窗口 — 在 JetBrains IDE 中与 Doge Code 对话
- 📊 用量统计 — 查看费用和 Token 用量
- ⚙️ 设置面板 — 配置服务器地址

**支持 IDE：**
- IntelliJ IDEA
- PyCharm
- WebStorm
- PhpStorm
- RubyMine
- CLion
- GoLand
- Rider
- 其他 JetBrains 系列 IDE

**技术实现：**
- `src/utils/jetbrains.ts` — JetBrains 插件工具函数

```typescript
// 支持的 IDE 类型
const ideNameToDirMap = {
  pycharm: ['PyCharm'],
  intellij: ['IntelliJIdea', 'IdeaIC'],
  webstorm: ['WebStorm'],
  phpstorm: ['PhpStorm'],
  rubymine: ['RubyMine'],
  clion: ['CLion'],
  goland: ['GoLand'],
  rider: ['Rider'],
  datagrip: ['DataGrip'],
  appcode: ['AppCode'],
  dataspell: ['DataSpell'],
  aqua: ['Aqua'],
  gateway: ['Gateway'],
  fleet: ['Fleet'],
  androidstudio: ['AndroidStudio'],
}

// 核心函数
buildCommonPluginDirectoryPaths(ideName: string): string[]
```

---

# 第四十七部分：Agent 开发指南

## 47.1 概述

Doge Code 支持 cs-* 前缀的专用代理（Agent），用于编排仓库中的技能。每个 Agent：
- 通过相对路径（`../marketing-skill/`）引用技能
- 执行技能包中的 Python 自动化工具
- 遵循既定的工作流和模板
- 保持技能的可移植性和独立性

**关键原则**：Agent 编排技能，而非替代技能。技能保持自包含和可移植。

## 47.2 Agent 文件结构

每个 Agent 文件必须以 YAML 前置元数据开头：

```yaml
---
name: cs-agent-name
description: 该Agent功能的一行描述
skills: skill-folder-name
domain: domain-name
model: sonnet
tools: [Read, Write, Bash, Grep, Glob]
---
```

**字段定义：**
- **name**：Agent 标识符，使用 `cs-` 前缀
- **description**：描述 Agent 用途的单句
- **skills**：此 Agent 引用的技能文件夹
- **domain**：领域类别（marketing, product, engineering, c-level, pm, ra-qm）
- **model**：使用的 Claude 模型（sonnet, opus, haiku）
- **tools**：Agent 可使用的 Claude Code 工具数组

## 47.3 Agent 模板

```markdown
---
name: cs-agent-name
description: 一行描述
skills: skill-folder-name
domain: domain-name
model: sonnet
tools: [Read, Write, Bash, Grep, Glob]
---

# Agent Name

## Purpose
[2-3 paragraphs describing what this agent does]

## Skill Integration
**Skill Location:** `../../domain-skill/skill-name/`

### Python Tools
1. **Tool Name**
   - **Path:** `../../domain-skill/skill-name/scripts/tool.py`
   - **Usage:** `python ../../domain-skill/skill-name/scripts/tool.py [args]`

## Workflows
### Workflow 1: [Name]
**Goal:** Description
**Steps:**
1. Step 1
2. Step 2
3. Step 3

## Integration Examples
[Concrete examples with actual commands]

## Success Metrics
- Metric 1: How to measure
- Metric 2: How to measure

## Related Agents
- [cs-related-agent](../<domain>/cs-related-agent.md)

## References
- [Skill Documentation](../../domain-skill/skill-name/SKILL.md)
```

## 47.4 生产 Agent 列表

| Agent | 领域 | 描述 |
|-------|------|------|
| cs-content-creator | 营销 | AI 驱动内容创建 |
| cs-demand-gen-specialist | 营销 | 需求生成和客户获取 |
| cs-ceo-advisor | C级 | CEO 战略领导力顾问 |
| cs-cto-advisor | C级 | CTO 技术领导力顾问 |
| cs-product-manager | 产品 | RICE 优先级排序 |
| cs-product-strategist | 产品 | 产品策略、OKR 级联 |
| cs-agile-product-owner | 产品 | 敏捷产品所有权 |
| cs-ux-researcher | 产品 | UX 研究、可用性测试 |
| cs-engineering-lead | 工程 | 工程团队协调 |
| cs-senior-engineer | 工程 | 架构决策、代码审查 |
| cs-fullstack-engineer | 工程 | 全栈编排器 |
| cs-frontend-engineer | 工程 | 前端编排器 |
| cs-backend-engineer | 工程 | 后端编排器 |
| cs-growth-strategist | 业务 | 增长策略和收入优化 |
| cs-financial-analyst | 财务 | 财务分析、DCF 估值 |
| cs-project-manager | 项目管理 | Atlassian 集成 |
| cs-quality-regulatory | 法规/质量 | 法规事务和质量管理 |

## 47.5 ClawHub 发布约束

当技能发布到 ClawHub (clawhub.com) 时：
- **cs-前缀仅用于 slug 冲突** — 仅在 ClawHub 注册表上其他发布者已拥有该 slug 时使用
- **无付费/商业服务依赖** — 技能不得要求付费第三方 API 密钥
- **plugin.json** — 仅包含字段：name、description、version、author、homepage、repository、license、skills
- **速率限制**：ClawHub 上每小时 5 个新技能

## 47.6 技术实现

| 文件 | 功能 |
|------|------|
| `.claude/agents/CLAUDE.md` | Agent 开发指南（318 行） |
| `.claude/agents/developer-experience/vscode-extension.md` | VS Code 扩展开发指南 |

---

# 第四十八部分：未文档化工具

以下工具在之前版本中未完整文档化，现补充说明。

## 48.1 已实现的工具

### UltrareviewTool（代码审查）
- **工具名**：`ultrareview`
- **功能**：对代码变更进行 AI 审查
- **参数**：
  - `target`（可选）：审查目标（分支名、PR URL 或提交 SHA）
  - `depth`（可选）：审查深度（`quick`/`standard`/`deep`）
- **返回**：`findings`（发现列表）、`summary`（审查摘要）、`score`（评分 0-100）
- **文件**：`src/tools/UltrareviewTool/UltrareviewTool.ts`

### WorkflowTool（工作流管理）
- **工具名**：`workflow`
- **功能**：管理工作流脚本
- **参数**：
  - `script`：工作流脚本名称或内容
  - `args`（可选）：脚本参数
  - `mode`（可选）：操作模式（`run`/`list`/`create`/`delete`/`show`）
- **返回**：`success`、`output`、`workflows`（列表）、`steps`（步骤）
- **文件**：`src/tools/WorkflowTool/WorkflowTool.ts`
- **工作流目录**：`%TEMP%/doge-workflows/`

### RemoteTriggerTool（远程触发器）
- **工具名**：`remote_trigger`
- **功能**：管理远程触发器
- **参数**：
  - `action`：操作类型（`list`/`get`/`create`/`update`/`run`）
  - `trigger_id`（可选）：触发器 ID
- **文件**：`src/tools/RemoteTriggerTool/RemoteTriggerTool.ts`

### SnipTool（消息裁剪）
- **工具名**：`snip`
- **功能**：裁剪对话历史中的旧消息
- **参数**：
  - `lines`（可选）：要裁剪的旧消息数
  - `keepRecent`（可选）：保留最近的消息数
  - `target`（可选）：裁剪目标（`user`/`assistant`/`system`/`all`）
  - `preserveSystem`（可选）：是否保留系统消息
- **返回**：`sniped`、`linesRemoved`、`linesKept`、`message`
- **文件**：`src/tools/SnipTool/SnipTool.ts`

### SubscribePRTool（PR 订阅）
- **工具名**：`subscribe_pr`
- **功能**：订阅 PR 状态变化通知
- **文件**：`src/tools/SubscribePRTool/`

### TerminalCaptureTool（终端捕获）
- **工具名**：`terminal_capture`
- **功能**：捕获终端输出
- **文件**：`src/tools/TerminalCaptureTool/`

### VerifyPlanExecutionTool（计划验证）
- **工具名**：`verify_plan_execution`
- **功能**：验证计划执行结果
- **文件**：`src/tools/VerifyPlanExecutionTool/`

### TungstenTool
- **工具名**：`tungsten`
- **功能**：特殊工具（具体功能需参考实现）
- **文件**：`src/tools/TungstenTool/`

## 48.2 桩/未实现工具

以下工具在当前构建中不可用（返回 "Not available in this build"）：

| 工具名 | 文件 | 说明 |
|--------|------|------|
| `push_notification` | `src/tools/PushNotificationTool/` | 推送通知（未实现） |
| `send_user_file` | `src/tools/SendUserFileTool/` | 发送用户文件（未实现） |
| `review_artifact` | `src/tools/ReviewArtifactTool/` | 审查产物（null） |
| `suggest_background_pr` | `src/tools/SuggestBackgroundPRTool/` | 后台 PR 建议（未实现） |
| `synthetic_output` | `src/tools/SyntheticOutputTool/` | 合成输出（未实现） |

### DiscoverSkillsTool（技能发现）
- **工具名**：`discover_skills`
- **功能**：发现可用技能
- **文件**：`src/tools/DiscoverSkillsTool/prompt.ts`
- **说明**：仅导出常量 `DISCOVER_SKILLS_TOOL_NAME`，功能可能由其他模块实现

---

# 第四十九部分：后台服务完整列表

以下服务在之前版本中未完整文档化，现补充说明。

## 49.1 核心服务

| 服务 | 文件 | 功能 |
|------|------|------|
| AgentSummary | `src/services/AgentSummary/` | 代理摘要生成 |
| autoDream | `src/services/autoDream/` | 自动梦境/预测 |
| dashboard | `src/services/dashboard/` | 仪表盘数据服务 |
| MagicDocs | `src/services/MagicDocs/` | 魔法文档生成 |
| PromptSuggestion | `src/services/PromptSuggestion/` | 提示建议 |
| SessionMemory | `src/services/SessionMemory/` | 会话记忆管理 |
| sessionTranscript | `src/services/sessionTranscript/` | 会话记录 |
| settingsSync | `src/services/settingsSync/` | 设置同步 |
| skillSearch | `src/services/skillSearch/` | 技能搜索 |
| teamMemorySync | `src/services/teamMemorySync/` | 团队记忆同步 |
| tips | `src/services/tips/` | 使用提示 |
| tokenEstimation | `src/services/tokenEstimation.ts` | Token 估算 |
| tools | `src/services/tools/` | 工具服务 |
| toolUseSummary | `src/services/toolUseSummary/` | 工具使用摘要 |
| vcr | `src/services/vcr.ts` | 录制/回放（测试用） |
| voice | `src/services/voice.ts` | 语音服务 |

## 49.2 服务详细说明

### AgentSummary（代理摘要）
- **功能**：生成代理执行摘要
- **文件**：`src/services/AgentSummary/`

### autoDream（自动梦境）
- **功能**：自动预测/梦境功能
- **文件**：`src/services/autoDream/`

### dashboard（仪表盘服务）
- **功能**：提供仪表盘数据 API
- **文件**：`src/services/dashboard/`
- **API**：
  - `startDashboardServer(port)` — 启动仪表盘服务器
  - `stopDashboardServer()` — 停止服务器
  - `isDashboardRunning()` — 检查运行状态
  - `getDashboardPort()` — 获取端口号
  - `getDashboardData()` — 获取统计数据

### MagicDocs（魔法文档）
- **功能**：自动生成文档
- **文件**：`src/services/MagicDocs/`

### PromptSuggestion（提示建议）
- **功能**：提供输入提示建议
- **文件**：`src/services/PromptSuggestion/`

### SessionMemory（会话记忆）
- **功能**：管理会话级记忆
- **文件**：`src/services/SessionMemory/`

### sessionTranscript（会话记录）
- **功能**：记录会话完整内容
- **文件**：`src/services/sessionTranscript/`

### settingsSync（设置同步）
- **功能**：跨设备同步设置
- **文件**：`src/services/settingsSync/`

### skillSearch（技能搜索）
- **功能**：搜索可用技能
- **文件**：`src/services/skillSearch/`

### teamMemorySync（团队记忆同步）
- **功能**：同步团队成员记忆
- **文件**：`src/services/teamMemorySync/`

### tips（使用提示）
- **功能**：提供使用提示
- **文件**：`src/services/tips/`

### tokenEstimation（Token 估算）
- **功能**：估算 Token 使用量
- **文件**：`src/services/tokenEstimation.ts`

### tools（工具服务）
- **功能**：工具管理服务
- **文件**：`src/services/tools/`

### toolUseSummary（工具使用摘要）
- **功能**：统计工具使用情况
- **文件**：`src/services/toolUseSummary/`

### vcr（录制/回放）
- **功能**：录制和回放 API 调用（测试用）
- **文件**：`src/services/vcr.ts`

### voice（语音服务）
- **功能**：语音输入/输出服务
- **文件**：`src/services/voice.ts`

---

# 第五十部分：完整命令注册参考

以下列出 `src/commands.ts` 中注册的所有命令，按功能分类。标记 🔒 的命令需要特定功能标志（feature flag）才能启用。

## 50.1 Git 与版本控制

| 命令 | 功能 | 文件 |
|------|------|------|
| `/blame` | Git blame 查看代码作者 | `commands/blame/index.ts` |
| `/branch` | 分支管理 | `commands/branch/index.ts` |
| `/conflict` | 合并冲突解决 | `commands/conflict/index.ts` |
| `/contributors` | Git 贡献者列表 | `commands/contributors/index.ts` |
| `/commit` | 智能提交 | `commands/commit.ts` |
| `/commit-push-pr` | 提交+推送+PR | `commands/commit-push-pr.ts` |
| `/file-history` | 文件历史记录 | `commands/file-history/index.ts` |
| `/git-graph` | Git 图可视化 | `commands/git-graph/index.ts` |
| `/release` | 发布管理 | `commands/release/index.ts` |
| `/stash` | Git 暂存 | `commands/stash/index.ts` |

## 50.2 代码分析与质量

| 命令 | 功能 | 文件 |
|------|------|------|
| `/code-health` | 代码健康度评分 | `commands/code-health/index.ts` |
| `/code-search` | 代码搜索 | `commands/code-search/index.tsx` |
| `/code-review-assistant` | 代码审查助手 | `commands/code-review-assistant/index.ts` |
| `/diff` | 差异查看 | `commands/diff/index.ts` |
| `/diff-mode` | 并排差异视图 | `commands/diff-mode/index.ts` |
| `/diff-review` | 差异审查 | `commands/diff-review/index.ts` |
| `/fmt` | 代码格式化 | `commands/fmt/index.ts` |
| `/imports` | 导入分析 | `commands/imports/index.ts` |
| `/performance` | 性能分析 | `commands/performance/index.ts` |
| `/refactor` | 代码重构 | `commands/refactor.ts` |
| `/security` | 安全扫描 | `commands/security/index.ts` |
| `/symbol` | 符号搜索 | `commands/symbol/index.ts` |
| `/vector-search` | 向量搜索 | `commands/vector-search/index.tsx` |

## 50.3 会话与工作区

| 命令 | 功能 | 文件 |
|------|------|------|
| `/break-cache` | 打破缓存 | `commands/break-cache/index.ts` |
| `/keybindings` | 快捷键绑定 | `commands/keybindings/index.ts` |
| `/mobile` | 移动端调试 | `commands/mobile/index.ts` |
| `/onboarding` | 入职引导 | `commands/onboarding/index.tsx` |
| `/session` | 会话管理 | `commands/session/index.ts` |
| `/sessions` | 多会话管理 | `commands/sessions/index.tsx` |
| `/teleport` | 会话迁移 | `commands/teleport/index.tsx` |
| `/workspace` | 工作区管理 | `commands/workspace.ts` |

## 50.4 工具与监控

| 命令 | 功能 | 文件 |
|------|------|------|
| `/backup` | 备份管理 | `commands/backup/index.ts` |
| `/cache` | 缓存管理 | `commands/cache/index.ts` |
| `/env` | 环境变量 | `commands/env/index.ts` |
| `/event-stream` | 事件流 | `commands/event-stream/index.ts` |
| `/file-watcher` | 文件监视 | `commands/file-watcher/index.ts` |
| `/logger` | 日志记录 | `commands/logger/index.ts` |
| `/logs` | 查看日志 | `commands/logs/index.ts` |
| `/metrics` | 指标查看 | `commands/metrics/index.ts` |
| `/monitor` | 系统监控 | `commands/monitor/index.ts` |
| `/notify` | 通知 | `commands/notify/index.ts` |
| `/ports` | 端口管理 | `commands/ports/index.ts` |
| `/prompt-diff` | 提示差异 | `commands/prompt-diff/index.ts` |
| `/queue` | 队列管理 | `commands/queue/index.ts` |

## 50.5 功能标志命令（🔒 需要启用对应特性）

| 命令 | 功能标志 | 功能 |
|------|----------|------|
| 🔒 `/proactive` | `PROACTIVE` | 主动建议 |
| 🔒 `/voice` | `VOICE_MODE` | 语音功能 |
| 🔒 `/bridge` | `BRIDGE_MODE` | 桥接模式 |
| 🔒 `/remoteControlServer` | `DAEMON` + `BRIDGE_MODE` | 远程控制服务器 |
| 🔒 `/force-snip` | `HISTORY_SNIP` | 强制历史裁剪 |
| 🔒 `/workflows` | `WORKFLOW_SCRIPTS` | 工作流脚本 |
| 🔒 `/remote-setup` | `CCR_REMOTE_SETUP` | 远程设置 |
| 🔒 `/subscribe-pr` | `KAIROS_GITHUB_WEBHOOKS` | PR 订阅 |
| 🔒 `/ultraplan` | `ULTRAPLAN` | 超级计划 |
| 🔒 `/torch` | `TORCH` | Torch 功能 |
| 🔒 `/peers` | `UDS_INBOX` | 对等节点 |
| 🔒 `/fork` | `FORK_SUBAGENT` | 子代理分叉 |
| 🔒 `/brief` | `KAIROS` | 摘要功能 |
| 🔒 `/assistant` | `KAIROS` | 助手功能 |

## 50.6 其他命令

| 命令 | 功能 | 文件 |
|------|------|------|
| `/autocomplete` | 智能补全 | `commands/autocomplete/index.ts` |
| `/auto-commit` | 自动提交 | `commands/auto-commit/index.ts` |
| `/background` | 后台任务 | `commands/background/index.ts` |
| `/bookmark` | 书签管理 | `commands/bookmark/index.ts` |
| `/changelog` | 变更日志 | `commands/changelog/index.ts` |
| `/context-collapse` | 上下文压缩 | `commands/context-collapse/index.ts` |
| `/cost-history` | 费用历史 | `commands/cost-history/index.ts` |
| `/custom-cmd` | 自定义命令 | `commands/custom-cmd/index.ts` |
| `/deps-viz` | 依赖可视化 | `commands/deps-viz/index.ts` |
| `/documentation-index` | 文档索引 | `commands/documentation-index/index.ts` |
| `/errors` | 错误列表 | `commands/errors/index.ts` |
| `/feedback` | 反馈 | `commands/feedback/index.ts` |
| `/files` | 文件管理 | `commands/files/index.ts` |
| `/focus` | 专注模式 | `commands/focus/index.ts` |
| `/game` | 游戏 | `commands/game/index.ts` |
| `/getting-started` | 入门指南 | `commands/getting-started/index.ts` |
| `/graphql` | GraphQL | `commands/graphql/index.ts` |
| `/hooks` | Hook 管理 | `commands/hooks/index.ts` |
| `/http` | HTTP 调试 | `commands/http/index.ts` |
| `/i18n-extract` | 国际化提取 | `commands/i18n-extract.ts` |
| `/insights` | 洞察分析 | `commands/insights/index.ts` |
| `/less-permission-prompts` | 减少权限提示 | `commands/less-permission-prompts/index.ts` |
| `/mcp-tool-search` | MCP 工具搜索 | `commands/mcp-tool-search/index.ts` |
| `/passes` | 通行证 | `commands/passes/index.ts` |
| `/privacy-settings` | 隐私设置 | `commands/privacy-settings/index.ts` |
| `/pr-review` | PR 审查 | `commands/pr-review/index.ts` |
| `/powerup` | 增强 | `commands/powerup/index.ts` |
| `/project-purge` | 项目清理 | `commands/project-purge/index.ts` |
| `/share` | 分享 | `commands/share/index.ts` |
| `/snippet` | 代码片段 | `commands/snippet/index.ts` |
| `/tc` | TC 功能 | `commands/tc/index.ts` |
| `/templates` | 模板管理 | `commands/templates/index.ts` |
| `/terminalSetup` | 终端设置 | `commands/terminalSetup/index.ts` |
| `/test-run` | 运行测试 | `commands/test-run/index.ts` |
| `/thinkback` | 回溯 | `commands/thinkback/index.ts` |
| `/thinkback-play` | 回溯播放 | `commands/thinkback-play/index.ts` |
| `/wiki` | Wiki | `commands/wiki/index.ts` |

## 50.7 功能标志环境变量

| 环境变量 | 说明 |
|----------|------|
| `CLAUDE_CODE_FEATURE_PROACTIVE` | 启用主动建议 |
| `CLAUDE_CODE_FEATURE_KAIROS` | 启用 KAIROS 功能（助手、摘要） |
| `CLAUDE_CODE_FEATURE_KAIROS_BRIEF` | 启用 KAIROS 摘要 |
| `CLAUDE_CODE_FEATURE_BRIDGE_MODE` | 启用桥接模式 |
| `CLAUDE_CODE_FEATURE_DAEMON` | 启用守护进程 |
| `CLAUDE_CODE_FEATURE_VOICE_MODE` | 启用语音模式 |
| `CLAUDE_CODE_FEATURE_HISTORY_SNIP` | 启用历史裁剪 |
| `CLAUDE_CODE_FEATURE_WORKFLOW_SCRIPTS` | 启用工作流脚本 |
| `CLAUDE_CODE_FEATURE_CCR_REMOTE_SETUP` | 启用远程设置 |
| `CLAUDE_CODE_FEATURE_KAIROS_GITHUB_WEBHOOKS` | 启用 GitHub Webhook |
| `CLAUDE_CODE_FEATURE_ULTRAPLAN` | 启用超级计划 |
| `CLAUDE_CODE_FEATURE_TORCH` | 启用 Torch |
| `CLAUDE_CODE_FEATURE_UDS_INBOX` | 启用 UDS 收件箱 |
| `CLAUDE_CODE_FEATURE_FORK_SUBAGENT` | 启用子代理分叉 |
| `CLAUDE_CODE_FEATURE_EXPERIMENTAL_SKILL_SEARCH` | 启用实验性技能搜索 |
