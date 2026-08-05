---

# 第三十一部分：桌面端（Electron）完整参考

## 31.1 桌面端架构

桌面端（`desktop/`）是基于 Electron 43 + React 19 + Vite 构建的独立 GUI 应用：

```
desktop/
├── package.json             ← 桌面端独立包配置
├── electron.vite.config.ts  ← Electron-Vite 构建配置
├── electron-builder.yml     ← 打包配置（NSIS/DMG/AppImage）
├── playwright.config.ts     ← E2E 测试配置
├── scripts/                 ← 25+ 构建/开发/打包脚本
├── src/
│   ├── main/                ← Electron 主进程（Node.js）
│   │   ├── index.ts         ← 主进程入口
│   │   ├── entrypoint.ts    ← 桌面模式入口
│   │   ├── apiClient.ts     ← API 客户端（Anthropic/OpenAI 格式转换）
│   │   ├── batchEngine.ts   ← 批量处理引擎
│   │   ├── collaborativeDoc.ts ← CRDT 文档协作引擎
│   │   ├── diagnostic-tools.ts ← 诊断工具
│   │   ├── engineApi.ts     ← QueryEngine 公共 API 层
│   │   ├── lspClientManager.ts ← LSP 客户端管理器
│   │   ├── permissionManager.ts ← 桌面端权限管理器
│   │   ├── pluginManager.ts ← 桌面端插件管理
│   │   ├── pluginMarketplace.ts ← 插件市场服务
│   │   ├── pluginSandbox.ts ← 插件安全与沙箱隔离
│   │   ├── remoteSignaling.ts ← WebSocket 信令服务器
│   │   ├── sessionStore.ts ← 会话持久化
│   │   └── toolExecutor.ts ← 工具执行器
│   ├── preload/             ← Electron 预加载脚本（IPC 桥接）
│   ├── renderer/            ← 渲染进程（React UI）
│   │   ├── App.tsx          ← 主应用组件
│   │   ├── index.tsx        ← 渲染进程入口
│   │   ├── TerminalPanel.tsx ← xterm.js + node-pty 终端模拟器
│   │   ├── components/      ← 60+ UI 组件
│   │   ├── hooks/           ← 28+ React Hooks
│   │   ├── types/           ← TypeScript 类型定义
│   │   └── utils/           ← 渲染进程工具函数
│   └── shared/              ← 主进程/渲染进程共享代码
├── e2e/                     ← Playwright E2E 测试
└── build/                   ← 构建产物
```

## 31.2 桌面端构建脚本

| 脚本 | 命令 | 功能 |
|------|------|------|
| 开发模式 | `node scripts/dev.mjs` | 启动开发服务器（热重载） |
| 构建 | `node scripts/build-vite.mjs` | Vite 构建 |
| 构建（Windows） | `node scripts/build-vite.mjs --platform win` | Windows 平台构建 |
| 构建（macOS） | `node scripts/build-vite.mjs --platform mac` | macOS 平台构建 |
| 构建（Linux） | `node scripts/build-vite.mjs --platform linux` | Linux 平台构建 |
| 打包 | `node scripts/pack.mjs` | electron-builder 打包 |
| 打包（Windows） | `node scripts/pack.mjs --platform win` | Windows 安装包 |
| 打包（macOS） | `node scripts/pack.mjs --platform mac` | macOS DMG |
| 打包（Linux） | `node scripts/pack.mjs --platform linux` | Linux AppImage/deb/rpm |
| 发布 | `node scripts/build-vite.mjs && node scripts/pack.mjs` | 构建+打包 |
| 启动 Electron | `node scripts/launch-electron.mjs` | 开发模式启动 |
| 运行应用 | `node scripts/run-app.mjs` | 运行已构建应用 |
| 调试 | `node scripts/run-debug.mjs` | 调试模式启动 |
| 生成图标 | `node scripts/generate-icons.mjs` | 生成应用图标 |
| 检查 ASAR | `node scripts/check-asar.mjs` | 验证 ASAR 包完整性 |
| 检查文件 | `node scripts/check-files.mjs` | 检查构建产物 |
| 检查包 | `node scripts/check-pkg.mjs` | 验证包结构 |
| 打包检查 | `node scripts/run-pack.mjs` | 打包并验证 |
| 运行+检查 | `scripts/run-and-check.ps1` | PowerShell 构建验证 |

## 31.3 桌面端 package.json 脚本

```json
{
  "dev": "node scripts/dev.mjs",
  "build": "node scripts/build-vite.mjs",
  "build:win": "node scripts/build-vite.mjs --platform win",
  "build:mac": "node scripts/build-vite.mjs --platform mac",
  "build:linux": "node scripts/build-vite.mjs --platform linux",
  "pack": "node scripts/pack.mjs",
  "dist": "node scripts/build-vite.mjs && node scripts/pack.mjs",
  "dist:win": "node scripts/build-vite.mjs --platform win && node scripts/pack.mjs --platform win",
  "lint": "tsc --noEmit",
  "clean": "删除 dist/ 和 release/ 目录"
}
```

## 31.4 桌面端构建目标

| 平台 | 目标格式 | 输出文件 |
|------|----------|----------|
| Windows | NSIS 安装包 | `DogeCode-Setup-{version}.exe` |
| Windows | Portable | `DogeCode-Portable-{version}.exe` |
| macOS | DMG | `DogeCode-{version}-{arch}.dmg` |
| Linux | AppImage | `DogeCode-{version}-{arch}.AppImage` |
| Linux | deb | `DogeCode-{version}-{arch}.deb` |
| Linux | rpm | `DogeCode-{version}-{arch}.rpm` |

## 31.5 桌面端主进程模块

| 模块 | 文件 | 功能 |
|------|------|------|
| 主进程入口 | `main/index.ts` | Electron 主进程初始化、窗口创建、IPC 注册 |
| 桌面入口 | `main/entrypoint.ts` | 桌面模式入口（`doge --desktop`） |
| API 客户端 | `main/apiClient.ts` | Anthropic/OpenAI 格式转换 + SSE 流式请求 |
| 批量引擎 | `main/batchEngine.ts` | 并发批量文件处理 + 进度推送 |
| CRDT 文档 | `main/collaborativeDoc.ts` | 基于操作日志的文档协作引擎 |
| 诊断工具 | `main/diagnostic-tools.ts` | 工具名称数据流诊断 |
| 引擎 API | `main/engineApi.ts` | QueryEngine 类型安全封装 |
| LSP 管理器 | `main/lspClientManager.ts` | LSP 服务器进程管理 + JSON-RPC 通信 |
| 权限管理器 | `main/permissionManager.ts` | 桌面端权限确认对话框 |
| 插件管理器 | `main/pluginManager.ts` | 本地插件扫描/启用/禁用/安装/卸载 |
| 插件市场 | `main/pluginMarketplace.ts` | GitHub 插件市场浏览和安装 |
| 插件沙箱 | `main/pluginSandbox.ts` | 插件安全验证（Manifest/内容/路径/资源） |
| 远程信令 | `main/remoteSignaling.ts` | WebSocket 信令服务器 + 远程控制协议 |
| 会话存储 | `main/sessionStore.ts` | 会话持久化（.doge/sessions/） |
| 工具执行器 | `main/toolExecutor.ts` | 70+ 工具适配 + 快捷执行器 |

## 31.6 桌面端渲染进程组件（60+）

| 组件 | 功能 |
|------|------|
| `App.tsx` | 主应用组件（整合所有面板） |
| `TerminalPanel` | xterm.js + node-pty 终端模拟器 |
| `VirtualMessageList` | 虚拟滚动消息列表 |
| `MonacoEditorPanel` | Monaco 代码编辑器面板 |
| `FileTree` / `FileExplorerPanel` | 文件树/文件浏览器 |
| `GitChanges` / `GitDiff` / `GitBranchManager` / `GitMergePanel` | Git 变更/差异/分支/合并 |
| `ToolPanel` / `ToolProgressBar` / `ToolErrorBanner` | 工具面板/进度/错误 |
| `AgentPanel` | 代理面板 |
| `CommandPalette` | 命令面板 |
| `ReferencesPanel` / `CallChainPanel` | 引用/调用链 |
| `HighlightedDiff` / `VersionComparePanel` | 高亮差异/版本比较 |
| `LspPanel` / `ProblemsPanel` | LSP 面板/问题面板 |
| `KanbanBoard` / `TimeTracker` / `ProgressReport` | 看板/时间追踪/进度报告 |
| `DatabaseBrowser` | 数据库浏览器 |
| `ApiTestPanel` | API 测试面板 |
| `SnippetPanel` | 代码片段面板 |
| `PluginPanel` | 插件面板 |
| `SecurityAuditPanel` / `SecuritySettings` | 安全审计/安全设置 |
| `DebuggerPanel` | 调试器面板 |
| `CodeReviewPanel` / `AICodeReviewPanel` | 代码审查/AI 审查 |
| `TestRunnerPanel` | 测试运行器面板 |
| `WorkflowPanel` / `BatchEnginePanel` | 工作流/批量引擎 |
| `CollaborationPanel` / `RemoteControlPanel` | 协作/远程控制 |
| `VoiceCallPanel` | 语音通话面板 |
| `ThemeEditor` / `ThemeMarketplace` | 主题编辑器/主题市场 |
| `InlineSuggestion` / `SmartImportSuggestion` | 内联建议/智能导入 |
| `FindReplacePanel` / `OutlinePanel` / `SymbolOutlinePanel` | 查找替换/大纲/符号大纲 |
| `LogViewer` / `NotificationsPanel` | 日志查看器/通知面板 |
| `PermissionPanel` | 权限面板 |
| `EditorSettingsPanel` / `CodeFormatter` | 编辑器设置/代码格式化 |
| `PerformanceRefactorPanel` | 性能重构面板 |
| `ProjectStructurePlanner` | 项目结构规划 |
| `SemanticSearchPanel` | 语义搜索面板 |
| `IssuesPanel` / `IntegrationPanel` | 问题/集成面板 |
| `BreadcrumbBar` / `ColorPickerDialog` | 面包屑/颜色选择 |
| `SessionLock` | 会话锁定 |
| `OperationHistory` | 操作历史 |
| `ErrorLensOverlay` | 错误透镜叠加 |
| `RecordingPanel` | 录制面板 |
| `AdvancedCodeEditor` | 高级代码编辑器 |
| `EditorEnhancements` | 编辑器增强 |
| `MarkdownRenderer` | Markdown 渲染器 |

## 31.7 桌面端渲染进程 Hooks（28+）

| Hook | 功能 |
|------|------|
| `useFileTree` | 文件树数据管理 |
| `useProblems` | 问题面板数据 |
| `useErrorLens` | 错误透镜分析 |
| `useCommandHistory` | 命令历史 |
| `useTerminal` | 终端交互 |
| `useLsp` | LSP 客户端 |
| `useDatabase` | 数据库操作 |
| `useApiTest` | API 测试 |
| `useWorkflowMode` | 工作流模式 |
| `useWorkflowAutomation` | 工作流自动化 |
| `usePreAnalysis` | 预分析建议 |
| `useSmartImport` | 智能导入 |
| `useSnippetEngine` | 代码片段引擎 |
| `useSymbolOutline` | 符号大纲 |
| `useCallChain` | 调用链分析 |
| `useBreadcrumb` | 面包屑导航 |
| `useFindReplace` | 查找替换 |
| `useGitStats` | Git 统计 |
| `useLogStream` | 日志流 |
| `useMemoryUsage` | 内存使用监控 |
| `useOutputChannel` | 输出通道 |
| `useTabManager` | Tab 管理 |
| `useTimeTracker` | 时间追踪 |
| `useVersionCompare` | 版本比较 |
| `useVirtualList` | 虚拟列表 |
| `useColorPicker` | 颜色选择器 |
| `useEditorConfig` | 编辑器配置 |
| `useNotifications` | 通知管理 |

## 31.8 桌面端依赖

| 依赖 | 说明 |
|------|------|
| `@anthropic-ai/sandbox-runtime` | Anthropic 沙箱运行时 |
| `@monaco-editor/react` | Monaco 编辑器 React 封装 |
| `@xterm/xterm` + `@xterm/addon-fit` | 终端模拟器 |
| `electron-store` | 持久化配置存储 |
| `esbuild` | 构建工具 |
| `execa` | 子进程执行 |
| `monaco-editor` | Monaco 代码编辑器 |
| `node-pty` | 伪终端（PTY） |
| `react` + `react-dom` 19 | UI 框架 |
| `electron` 43 | Electron 运行时 |
| `electron-builder` 26 | 打包工具 |
| `electron-updater` | 自动更新 |
| `@playwright/test` | E2E 测试框架 |

## 31.9 桌面端启动配置

桌面端通过 `.doge/lc2.json` 配置文件读取模型配置：

```json
{
  "activePreset": "default",
  "presets": {
    "default": {
      "provider": "openai",
      "apiKey": "sk-xxx",
      "model": "gpt-4o",
      "baseURL": "https://api.openai.com/v1"
    },
    "local": {
      "provider": "openai",
      "apiKey": "ollama",
      "model": "qwen2.5-coder:32b",
      "baseURL": "http://localhost:11434/v1"
    }
  }
}
```

环境变量 `DOGE_API_JSON` 可指定自定义配置文件路径。

---

# 第三十二部分：测试框架

## 32.1 测试目录结构

```
src/__tests__/
├── e2e/                   ← 端到端测试
├── integration/           ← 集成测试（连接真实数据库/服务）
├── mocks/                 ← 测试 Mock（api.ts, tools.ts）
├── performance/           ← 性能测试（benchmark.test.ts）
├── query/                 ← 查询引擎测试
├── state/                 ← 状态管理测试
├── tools/                 ← 工具测试（ToolRegistry.test.ts）
├── utils/                 ← 工具函数测试（TestHelper.ts）
└── vitest.d.ts            ← Vitest 类型声明
```

## 32.2 桌面端测试

```
desktop/
├── e2e/                   ← Playwright E2E 测试
│   ├── app.spec.ts        ← 应用规格测试
│   ├── app.test.ts        ← 应用功能测试
│   ├── app-e2e.spec.ts    ← 端到端流程测试
│   └── electron-app.ts    ← Electron 测试辅助
└── playwright.config.ts   ← Playwright 配置
```

## 32.3 测试命令

```cmd
:: 运行所有测试
bun test

:: 运行集成测试
bun test src/__tests__/integration

:: 运行 E2E 测试
bun test src/__tests__/e2e

:: 运行性能测试
bun test src/__tests__/performance

:: 运行单个测试文件
bun test ToolRegistry.test.ts

:: 桌面端 E2E 测试（Playwright）
cd desktop && npx playwright test

:: 桌面端类型检查
cd desktop && npm run lint
```

## 32.4 测试 Mock

| 文件 | 说明 |
|------|------|
| `mocks/api.ts` | API 调用 Mock |
| `mocks/tools.ts` | 工具执行 Mock |
| `utils/TestHelper.ts` | 测试辅助函数 |

---

# 第三十三部分：根目录配置与脚本

## 33.1 根目录配置文件

| 文件 | 说明 |
|------|------|
| `package.json` | 根包配置（@doge-code/cli） |
| `tsconfig.json` | TypeScript 配置 |
| `biome.json` | Biome 代码检查/格式化配置 |
| `bunfig.toml` | Bun 运行时配置 |
| `electron-builder.yml` | Electron 构建配置 |
| `CLAUDE.md` | 项目上下文（AI 读取） |
| `README.md` | 项目说明 |
| `ROADMAP.md` | 路线图 |
| `IMPLEMENTATION_PLAN.md` | 实施计划 |
| `TODO_feature_absorption_plan.md` | 特性吸收计划 |
| `UNIMPLEMENTED_FEATURES.md` | 未实现特性清单 |
| `使用说明.md` | 本文档 |

## 33.2 根目录脚本（scripts/）

| 脚本 | 功能 |
|------|------|
| `build.ts` | 构建脚本 |
| `package.ts` | 打包脚本 |
| `release.ts` | 发布脚本 |
| `version.ts` | 版本管理 |
| `check-coverage.ts` | 覆盖率检查 |
| `consolidate-globals.ts` | 全局声明合并 |
| `embed-status-line.ts` | 状态行嵌入 |
| `fix-*.ts` | 各类修复脚本（types/app/global 等） |
| `inject-macro.ts` | 宏注入 |
| `integrate-features.py` | 特性集成 |
| `bridge.ts` / `bridge-client.ts` | 桥接通信 |
| `bridge-secure.ts` | 安全桥接 |
| `gen_auth_config.mjs` | 认证配置生成 |
| `gen_doge_config.mjs` | Doge 配置生成 |
| `gen_presets.cjs` | 预设配置生成 |
| `list_providers.mjs` | 列出可用提供商 |
| `extract_models.mjs` | 模型提取 |
| `check_agents.mjs` | 代理检查 |
| `finalize.mjs` | 最终处理 |
| `postbuild-tools.ts` | 构建后工具 |
| `analyze-logs.ts` | 日志分析 |
| `sync-upstream.sh` | 上游同步 |

## 33.3 根目录可执行文件

| 文件 | 功能 |
|------|------|
| `d.bat` | 快速启动（含环境变量） |
| `d_min.bat` | 最小化启动 |
| `compile.bat` | 编译脚本 |
| `commit.bat` | 提交脚本 |
| `doge.exe` | 编译后的 CLI 可执行文件 |
| `install.bat` | 安装脚本 |

## 33.4 vendor/ 目录

第三方依赖的本地副本，避免外部依赖不可用。

## 33.5 shims/ 目录

兼容性填充（polyfill），确保在不同环境下行为一致。

---

# 第三十四部分：本地桥接服务器

## 34.1 概述

`local-bridge-server/server.ts` 是一个最小化的本地桥接服务端，模拟 Anthropic CCR v2 协议，让 `/remote-control` 命令可以在本地运行，无需 Anthropic 账户。

## 34.2 使用方法

```cmd
:: 方式一：直接运行
bun run local-bridge-server/server.ts

:: 方式二：编译为独立可执行文件
bun build local-bridge-server/server.ts --compile --outfile local-bridge

:: 客户端连接（需要设置环境变量）
set CLAUDE_CODE_LOCAL_BRIDGE=1
doge /remote-control
```

## 34.3 技术细节

| 项目 | 说明 |
|------|------|
| 监听端口 | `5678`（可通过 `PORT` 环境变量覆盖） |
| 协议 | 模拟 Anthropic CCR v2 远程控制系统 |
| 会话管理 | 内存中维护会话列表（创建/归档/事件追加） |
| 事件流 | Server-Sent Events (SSE) 推送事件到客户端 |
| 工作器协议 | Worker JWT 握手 + Epoch 心跳机制 |

## 34.4 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 监听端口 | `5678` |
| `CLAUDE_CODE_LOCAL_BRIDGE` | 启用本地桥接模式 | `0` |

---

# 第三十五部分：示例配置与模板

## 35.1 示例目录结构

```
examples/
├── hooks/                           ← Hook 示例
│   └── bash_command_validator_example.py  ← Bash 命令验证器示例
├── mdm/                             ← MDM（移动设备管理）部署模板
│   ├── macos/                       ← macOS MDM 配置
│   │   ├── com.anthropic.claudecode.plist      ← Jamf/Iru Custom Settings
│   │   └── com.anthropic.claudecode.mobileconfig ← 完整配置文件
│   ├── windows/                     ← Windows MDM 配置
│   │   ├── Set-ClaudeCodePolicy.ps1 ← Intune Platform Script
│   │   ├── ClaudeCode.admx          ← Group Policy ADMX 模板
│   │   └── en-US/ClaudeCode.adml   ← ADML 资源文件
│   ├── managed-settings.json        ← 通用受管设置示例
│   └── README.md                    ← MDM 部署文档
└── settings/                        ← 设置文件示例
    ├── settings-lax.json            ← 宽松配置（仅禁用危险功能）
    ├── settings-strict.json         ← 严格配置（限制工具/Hooks/网络）
    ├── settings-bash-sandbox.json   ← Bash 沙箱配置
    └── README.md                    ← 设置文档
```

## 35.2 设置配置对比

| 功能 | lax（宽松） | strict（严格） | bash-sandbox |
|------|:-----------:|:--------------:|:------------:|
| 禁用 `--dangerously-skip-permissions` | ✅ | ✅ | — |
| 阻止插件市场 | ✅ | ✅ | — |
| 阻止用户/项目权限规则 | — | ✅ | ✅ |
| 阻止用户/项目 Hooks | — | ✅ | — |
| 拒绝 WebFetch/WebSearch | — | ✅ | — |
| Bash 工具需要审批 | — | ✅ | — |
| Bash 必须在沙箱内运行 | — | — | ✅ |

## 35.3 MDM 部署方式

| 平台 | 部署方式 | 配置文件 |
|------|----------|----------|
| macOS | Jamf/Iru Custom Settings | `com.anthropic.claudecode.plist` |
| macOS | 完整配置描述文件 | `com.anthropic.claudecode.mobileconfig` |
| Windows | Intune Platform Script | `Set-ClaudeCodePolicy.ps1` |
| Windows | Group Policy / Intune ADMX | `ClaudeCode.admx` + `ClaudeCode.adml` |
| 任意平台 | 系统配置目录 | `managed-settings.json` |

---

# 第三十六部分：桌面端辅助脚本

## 36.1 主进程辅助脚本

| 脚本 | 功能 |
|------|------|
| `browser-shim.ts` | Electron 主进程浏览器 API 垫片（document/window 等全局变量桩） |
| `require-shim.ts` | ESM 环境下注入 require() 支持 |
| `diagnostic-tools.ts` | 工具名称数据流诊断 |
| `patch_aps.py` | API 客户端补丁（Python） |
| `surgical_fix.py` | 精准修复脚本（Python） |
| `fix_api_client.js` | API 客户端修复脚本 |
| `repair_apiClient.js` | API 客户端修复 |
| `rebuild_apiclient.py` | API 客户端重建（Python） |
| `fix_apiclient.py` | API 客户端修复（Python） |
| `fix_block.py` | 阻塞代码修复（Python） |
| `fix_context.py` | 上下文修复（Python） |
| `fix_api.ps1` | API 客户端修复（PowerShell） |

> 注意：这些脚本主要用于开发和调试，普通用户无需使用。

---

# 第三十七部分：上下文与状态管理

## 37.1 React 上下文（src/context/）

| 上下文 | 功能 |
|--------|------|
| `fpsMetrics.tsx` | 帧率性能指标上下文 |
| `mailbox.tsx` | 邮箱桥接上下文 |
| `modalContext.tsx` | 模态框上下文 |
| `notifications.tsx` | 通知上下文 |
| `overlayContext.tsx` | 覆盖层上下文 |
| `promptOverlayContext.tsx` | 提示覆盖上下文 |
| `QueuedMessageContext.tsx` | 排队消息上下文 |
| `stats.tsx` | 统计数据上下文 |
| `voice.tsx` | 语音上下文 |

## 37.2 全局状态（src/state/）

| 模块 | 功能 |
|------|------|
| `AppStateStore.ts` | 全局应用状态存储 |
| `selectors.ts` | 状态选择器 |
| `projectOnboardingState.ts` | 项目入职引导状态 |
| `sticky-bucket-service.ts` | 粘性桶服务（A/B 测试分桶） |

## 37.3 GrowthBook 功能标记

| 组件 | 功能 |
|------|------|
| `GrowthBook.ts` | GrowthBook 客户端 |
| `GrowthBookClient.ts` | GrowthBook SDK 封装 |

---

# 第三十八部分：入口与启动流程

## 38.1 CLI 入口链

```
用户输入 "doge"
    ↓
doge.exe / bun run dev
    ↓
src/bootstrap-entry.ts     ← 启动入口（检测模式/快速路径）
    ↓
    ├── CLI 模式 → src/entrypoints/cli.tsx     ← CLI/TUI 入口
    ├── 开发模式 → src/dev-entry.ts            ← 开发模式入口
    └── 桌面模式 → desktop/src/main/entrypoint.ts ← Electron 启动
```

## 38.2 主进程入口（src/main.tsx）

React 主应用组件，整合所有 UI 组件：
- 状态行（StatusLine）
- 消息列表（Messages）
- 文本输入（TextInput / PromptInput）
- 对话框系统

## 38.3 桌面端入口

```
desktop/src/main/index.ts     ← Electron 主进程
    ├── 注册 IPC 处理器
    ├── 初始化 QueryEngine
    ├── 初始化 DocumentManager（CRDT 协作）
    ├── 初始化 BatchEngine（批量处理）
    ├── 启动 RemoteSignalingServer
    ├── 初始化 LSP 客户端管理器
    └── 创建浏览器窗口
```

## 38.4 启动配置

| 文件 | 功能 |
|------|------|
| `src/setup.ts` | 全局初始化设置 |
| `src/bootstrap/bootstrap-entry.ts` | 引导入口 |
| `src/bootstrap/bootstrapMacro.ts` | 引导宏（构建时优化） |
| `src/GrowthBook.ts` | 功能标记初始化 |
| `src/source-manager.ts` | 源管理器 |

---

# 第三十九部分：工具与类型定义

## 39.1 工具系统

| 文件 | 功能 |
|------|------|
| `src/Tool.ts` | 工具接口和类型定义 |
| `src/tools.ts` | 所有 70+ 工具的注册和导出 |
| `src/api/ToolRegistry.ts` | 工具注册表 |
| `Scheduler` | 工具调度器（并发/权限/错误处理） |

## 39.2 类型定义（src/types/）

| 文件 | 功能 |
|------|------|
| `command.ts` | 命令类型 |
| `hooks.ts` | Hook 类型 |
| `ids.ts` | ID 类型 |
| `logs.ts` | 日志类型 |
| `message.ts` | 消息类型 |
| `mongrule.ts` | 规则引擎类型 |
| `permissions.ts` | 权限类型 |
| `plugin.ts` | 插件类型 |
| `statusLine.ts` | 状态行类型 |
| `tools.ts` | 工具类型 |
| `utils.ts` | 通用工具类型 |
| `connectorText.ts` | 连接器文本类型 |
| `fileSuggestion.ts` | 文件建议类型 |
| `generated/` | 生成的类型 |
| `growthbook.ts` | GrowthBook 类型 |
| `js-cookie.d.ts` | Cookie 类型声明 |
| `messageQueueTypes.ts` | 消息队列类型 |
| `notebook.ts` | Notebook 类型 |
| `textInputTypes.ts` | 文本输入类型 |

## 39.3 任务系统

| 组件 | 功能 |
|------|------|
| `src/Task.ts` | 任务接口和类型 |
| `src/tasks.ts` | 任务注册 |
| `src/api/SessionManager.ts` | 会话管理器 |

---

# 第四十部分：辅助功能

## 40.1 历史记录

| 文件 | 功能 |
|------|------|
| `src/history.ts` | 历史记录管理（搜索/过滤/恢复） |

## 40.2 Ink（终端 UI）

| 文件 | 功能 |
|------|------|
| `src/ink.ts` | Ink 终端 UI 框架封装 |

## 40.3 查询引擎

| 文件 | 功能 |
|------|------|
| `src/query.ts` | 查询接口 |
| `src/QueryEngine.ts` | 查询引擎（独立于 engine/index.ts 的轻量版） |
| `src/engine/repoMap.ts` | Repo Map 代码库映射 |
| `src/engine/codeVectorStore.ts` | 向量存储（FTS5 + BM25） |

## 40.4 输出样式

| 文件 | 功能 |
|------|------|
| `src/outputStyles/` | 输出样式定义 |

## 40.5 动画

| 文件 | 功能 |
|------|------|
| `src/constants/spinnerVerbs.ts` | 加载动画动词 |
| `src/constants/turnCompletionVerbs.ts` | 轮次完成动词 |

## 40.6 性能

| 文件 | 功能 |
|------|------|
| `src/performance/` | 性能监控和分析 |

## 40.7 辅助模块

| 模块 | 功能 |
|------|------|
| `src/mongrule.ts` | 规则引擎 |
| `src/sticky-bucket-service.ts` | A/B 测试分桶 |
| `src/feature-repository.ts` | 特性仓库 |
| `src/dialogLaunchers.tsx` | 对话框启动器 |
| `src/interactiveHelpers.tsx` | 交互辅助函数 |
| `src/replLauncher.tsx` | REPL 启动器 |
| `src/auto-wrapper.ts` | 自动包装器 |

## 40.8 安全模块（src/security/）

| 文件 | 功能 |
|------|------|
| `AuditLogger.ts` | 审计日志 |
| `CommandFilter.ts` | 命令过滤 |
| `CredentialManager.ts` | 密钥管理 |
| `InputValidator.ts` | 输入验证 |
| `OutputSanitizer.ts` | 输出净化 |
| `PathGuard.ts` | 路径守卫 |
| `PermissionManager.ts` | 权限管理器 |
| `SandboxExecutor.ts` | 沙箱执行器 |
