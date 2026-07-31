# 日常编程功能扩展 — 详细任务拆分

> 三个功能并行开发，各由独立代理负责实现。

---

## Feature 1: LogViewer 实时日志流

**目标：** LogViewer 从静态日志展示升级为实时日志流，支持自动滚动 + 日志级别过滤 + 暂停/恢复。

### 任务拆分

| # | 子任务 | 细节 |
|---|--------|------|
| 1.1 | IPC: 新增 `doge:log-stream` 通道 | main 端用 setInterval 轮询 `userData/logs/doge.log`，支持 `on(event, callback)` / `removeAllListeners()` |
| 1.2 | preload: 暴露 `window.dogeAPI.logStream` | 封装 ipcRenderer.send/receive，返回 `{ start(level, limit), stop(), onNewLog }` |
| 1.3 | useLogStream hook | renderer 自定义 hook，管理 WebSocket-like 连接状态：`logs, connected, levelFilter, pause, togglePause, clear` |
| 1.4 | LogViewer UI 改造 | 顶部 toolbar: 级别 filter (DEBUG/INFO/WARN/ERROR), 暂停/恢复 button, 清空 button; 底部 auto-scroll checkbox |
| 1.5 | 虚拟滚动优化 | 当日志 > 500 条时启用虚拟滚动（复用 VirtualMessageList 模式） |

### 文件清单

- `desktop/src/main/index.ts` — IPC handler `doge:log-stream`
- `desktop/src/preload/index.ts` — `logStream` API
- `desktop/src/renderer/hooks/useLogStream.ts` — 新 hook
- `desktop/src/renderer/components/LogViewerPanel.tsx` — 改造现有组件

---

## Feature 2: 版本对比 UI

**目标：** 可视化浏览 git 历史 + commit 详情 + 文件版本 diff，集成到 Git 面板。

### 任务拆分

| # | 子任务 | 细节 |
|---|--------|------|
| 2.1 | IPC: 新增 `doge:git-diff` + `doge:git-show` | `git diff <sha> <sha> -- <file>` 和 `git show <sha>:<file>` |
| 2.2 | preload: 暴露 `window.dogeAPI.gitDiff/show` | 参数: `(cwd, commitSha, filePath?)` |
| 2.3 | useVersionCompare hook | 管理状态: `commits[], selectedCommit, diffResult, fileContent, loading` |
| 2.4 | VersionComparePanel UI | 三栏布局: 左侧 commit 列表 (graph + 消息 + 时间), 右侧 diff 视图 (Monaco diff editor 或语法高亮) |
| 2.5 | 集成到 GitBranchManager | 点击 commit 展开 diff 侧栏，支持双 commit 对比 |

### 文件清单

- `desktop/src/main/index.ts` — IPC handlers `doge:git-diff` / `doge:git-show`
- `desktop/src/preload/index.ts` — `gitDiff` / `gitShow` API
- `desktop/src/renderer/hooks/useVersionCompare.ts` — 新 hook
- `desktop/src/renderer/components/VersionComparePanel.tsx` — 新组件
- `desktop/src/renderer/components/GitBranchManager.tsx` — 集成

---

## Feature 3: 代码片段模板引擎

**目标：** 代码片段从基础 CRUD 升级为模板引擎，支持变量替换 + Tab 占位符跳转 + 片段预览。

### 任务拆分

| # | 子任务 | 细节 |
|---|--------|------|
| 3.1 | 模板语法设计 | `{{variable}}` 变量, `${1:placeholder}` TabStop, `${2:default|enum}` 枚举选择 |
| 3.2 | SnippetTemplateEngine 类 | 纯 TS 类，方法: `render(template, context) → string`, `getTabStops(template) → TabStop[]` |
| 3.3 | useSnippetEngine hook | 管理 `snippets[], selectedSnippet, editingFields[], preview` |
| 3.4 | SnippetEditor UI | 表单: 变量自动提取 + 输入框, Tab 顺序导航, 实时预览 Monaco 编辑器 |
| 3.5 | SnippetPalette 改造 | 命令面板输入模板名 → 自动填充变量 → Tab 跳转 → 插入编辑器 |

### 文件清单

- `desktop/src/renderer/utils/SnippetTemplateEngine.ts` — 新类
- `desktop/src/renderer/hooks/useSnippetEngine.ts` — 新 hook
- `desktop/src/renderer/components/SnippetEditorPanel.tsx` — 新组件
- `desktop/src/renderer/components/SnippetPalette.tsx` — 改造

---

## 实施顺序

1. 三个代理**并行启动**，各负责一个 feature
2. 每个代理完成: 实现代码 → TypeScript 检查 → 提交
3. 主代理汇总三个 PR 状态

---

## Feature 4: 文件资源管理器 (File Explorer)

**目标：** 仿 VS Code 侧边栏文件树，支持展开/折叠、右键菜单（新建/删除/重命名/复制路径）、文件图标、搜索过滤。

### 任务拆分

| # | 子任务 | 细节 |
|---|--------|------|
| 4.1 | IPC: `doge:file-tree` + `doge:file-mkdir` + `doge:file-delete` | main 端用 `fs.readdir` + `fs.stat` 递归列出目录，支持创建/删除文件 |
| 4.2 | preload: 暴露 `window.dogeAPI.fileTree` | API: `getTree(cwd, depth?) → FileNode[]`, `createFile(dir, name)`, `deleteFile(path)`, `renameFile(path, newName)` |
| 4.3 | useFileTree hook | renderer 自定义 hook，管理 `treeData[], expanded[], selectedPath, contextMenu` |
| 4.4 | FileExplorerPanel UI | 树形组件: 展开折叠图标 + 文件名 + 文件类型图标; 顶部搜索过滤框; 右键菜单 |
| 4.5 | 集成到 App.tsx | 左侧边栏增加 📁 文件资源管理器按钮，切换面板显示 |

### 文件清单

- `desktop/src/main/index.ts` — IPC handlers
- `desktop/src/preload/index.ts` — `fileTree` API
- `desktop/src/renderer/hooks/useFileTree.ts` — 新 hook
- `desktop/src/renderer/components/FileExplorerPanel.tsx` — 新组件

---

## Feature 5: 集成终端 (Integrated Terminal)

**目标：** 仿 VS Code 集成终端面板，底部可展开/收起，支持多标签、shell 命令执行、输出流式展示。

### 任务拆分

| # | 子任务 | 细节 |
|---|--------|------|
| 5.1 | IPC: `doge:terminal-create` + `doge:terminal-write` + `doge:terminal-resize` | main 端用 `node-pty` spawn shell，通过 IPC 转发 stdout/stderr |
| 5.2 | preload: 暴露 `window.dogeAPI.terminal` | API: `create(shell?) → Terminal`, `write(id, data)`, `resize(id, cols, rows)`, `kill(id)` |
| 5.3 | useTerminal hook | renderer 自定义 hook，管理 `terminals[], activeTerminalId, output[]` |
| 5.4 | TerminalPanel UI | 底部面板: xterm.js 或自定义终端渲染; 顶部标签栏; 新终端按钮; 下拉选择 shell |
| 5.5 | 集成到 App.tsx | 底部增加 终端 标签按钮，可拖拽调整高度 |

### 文件清单

- `desktop/src/main/index.ts` — IPC handlers
- `desktop/src/preload/index.ts` — `terminal` API
- `desktop/src/renderer/hooks/useTerminal.ts` — 新 hook
- `desktop/src/renderer/components/TerminalPanel.tsx` — 新组件

---

## Feature 6: Error Lens（错误透镜）

**目标：** 仿 VS Code Error Lens 扩展，在编辑器行内实时显示诊断错误/警告信息，支持配置显示级别。

### 任务拆分

| # | 子任务 | 细节 |
|---|--------|------|
| 6.1 | LSP Diagnostics 监听 | 通过 `window.dogeAPI.onDiagnostic` 或轮询获取当前文件的 LSP 诊断结果 |
| 6.2 | ErrorLensProvider 类 | 纯 TS 类，管理 `diagnostics[] → 按行分组 → 行内消息渲染` |
| 6.3 | useErrorLens hook | 管理状态: `errors[], warnings[], showInline, showGutter` |
| 6.4 | ErrorLensOverlay UI | Monaco 编辑器内嵌 overlay 层: 行尾红色/黄色气泡显示错误消息 |
| 6.5 | 集成到 MonacoEditorPanel | 切换 ErrorLens 开关，配置显示级别（error/warn/info） |

### 文件清单

- `desktop/src/renderer/hooks/useErrorLens.ts` — 新 hook
- `desktop/src/renderer/components/ErrorLensOverlay.tsx` — 新组件
- `desktop/src/renderer/components/MonacoEditorPanel.tsx` — 集成

---

## Feature 7: Symbol/Outline 视图

**目标：** 仿 VS Code Outline 面板，解析当前文件的符号（函数、类、变量、接口），提供快速导航。

### 任务拆分

| # | 子任务 | 细节 |
|---|--------|------|
| 7.1 | LSP DocumentSymbol API | 调用 `window.dogeAPI.documentSymbol(filePath)` 获取符号列表 |
| 7.2 | SymbolExtractor 类 | 纯 TS 类，解析 LSP 返回的 SymbolInformation → 树形结构 |
| 7.3 | useSymbolOutline hook | 管理状态: `symbols[], selectedSymbol, filter` |
| 7.4 | SymbolOutlinePanel UI | 树形列表: 图标区分类型 (函数/类/变量/接口); 搜索过滤; 点击跳转到对应行 |
| 7.5 | 集成到 App.tsx | 右侧面板增加 📋 符号大纲按钮 |

### 文件清单

- `desktop/src/main/index.ts` — IPC `doge:document-symbol`
- `desktop/src/preload/index.ts` — `documentSymbol` API
- `desktop/src/renderer/hooks/useSymbolOutline.ts` — 新 hook
- `desktop/src/renderer/components/SymbolOutlinePanel.tsx` — 新组件

---

## Feature 8: Breadcrumb 面包屑导航

**目标：** 仿 VS Code breadcrumb，在编辑器顶部显示当前光标所在符号的层级路径，支持点击跳转。

### 任务拆分

| # | 子任务 | 细节 |
|---|--------|------|
| 8.1 | LSP SymbolHierarchy API | 调用 `window.dogeAPI.documentSymbol` 获取当前文件所有符号 |
| 8.2 | BreadcrumbBuilder 类 | 纯 TS 类，根据光标位置计算当前符号的父级链 → breadcrumb 路径 |
| 8.3 | useBreadcrumb hook | 管理状态: `path[], hoveredIndex`，监听 Monaco 光标位置变化 |
| 8.4 | BreadcrumbBar UI | 顶部水平条: `src/components/utils.ts > exportFunction() > handleClick`，分隔符使用 `>` |
| 8.5 | 集成到 MonacoEditorPanel | 在编辑器顶部添加 breadcrumb bar |

### 文件清单

- `desktop/src/renderer/hooks/useBreadcrumb.ts` — 新 hook
- `desktop/src/renderer/components/BreadcrumbBar.tsx` — 新组件
- `desktop/src/renderer/components/MonacoEditorPanel.tsx` — 集成

---

## Feature 9: Problems 问题面板

**目标：** 仿 VS Code Problems 面板，聚合所有文件的 LSP 诊断错误/警告，支持过滤（文件/级别）和快速跳转。

### 任务拆分

| # | 子任务 | 细节 |
|---|--------|------|
| 9.1 | IPC: `doge:all-diagnostics` | main 端收集所有 open 文件的 LSP 诊断结果 |
| 9.2 | useProblems hook | 管理状态: `problems[], filter(level/file), selectedProblem` |
| 9.3 | ProblemsPanel UI | 表格: 文件路径 | 行号 | 级别(🔴/🟡) | 消息; 底部过滤栏 |
| 9.4 | 跳转功能 | 点击问题 → 在 Monaco 中打开文件并跳转到对应行 |
| 9.5 | 集成到 App.tsx | 底部面板增加 ⚠️ 问题按钮 |

### 文件清单

- `desktop/src/main/index.ts` — IPC handler
- `desktop/src/preload/index.ts` — `allDiagnostics` API
- `desktop/src/renderer/hooks/useProblems.ts` — 新 hook
- `desktop/src/renderer/components/ProblemsPanel.tsx` — 新组件

---

## Feature 10: Color Picker（颜色选择器）

**目标：** 在 Monaco 编辑器中检测到颜色值（hex/rgb/hsl）时，悬停显示颜色预览 + 点击打开颜色选择器。

### 任务拆分

| # | 子任务 | 细节 |
|---|--------|------|
| 10.1 | ColorTokenProvider 类 | 纯 TS 类，用正则匹配颜色值: `#[0-9a-fA-F]{3,8}` / `rgb(...)` / `hsl(...)` |
| 10.2 | ColorHoverWidget | Monaco 自定义 hover provider，悬停显示颜色方块 + hex 值 |
| 10.3 | ColorPickerDialog UI | 弹出颜色选择器: 色相滑块 + 输入框 + 实时预览 |
| 10.4 | useColorPicker hook | 管理 `hoveredColor, pickerOpen, selectedColor` |
| 10.5 | 集成到 MonacoEditorPanel | 注册 hover provider + 点击替换颜色值 |

### 文件清单

- `desktop/src/renderer/utils/ColorTokenProvider.ts` — 新类
- `desktop/src/renderer/hooks/useColorPicker.ts` — 新 hook
- `desktop/src/renderer/components/ColorPickerDialog.tsx` — 新组件
- `desktop/src/renderer/components/MonacoEditorPanel.tsx` — 集成

---

## Feature 11: Find/Replace 增强面板

**目标：** 仿 VS Code 搜索面板，支持正则、全词匹配、区分大小写、替换、批量替换 + 搜索结果高亮导航。

### 任务拆分

| # | 子任务 | 细节 |
|---|--------|------|
| 11.1 | FindReplaceEngine 类 | 纯 TS 类，方法: `find(text, query, options) → Match[]`, `replace(text, query, replacement, options) → string` |
| 11.2 | useFindReplace hook | 管理 `query, replacement, matches[], currentMatchIndex, options(caseSensitive, regex, wholeWord)` |
| 11.3 | FindReplacePanel UI | 搜索框 + 替换框 + 选项切换(正则/大小写/全词) + 导航按钮(上一个/下一个) + 替换/全部替换按钮 |
| 11.4 | Monaco 集成 | `findMatches` 使用 Monaco `findMatches` API; 高亮当前匹配项; 支持 CTRL+F 快捷键 |
| 11.5 | 键盘快捷键 | Ctrl+F 打开搜索, Ctrl+H 打开替换, F3/Shift+F3 导航, Alt+Enter 全选 |

### 文件清单

- `desktop/src/renderer/utils/FindReplaceEngine.ts` — 新类
- `desktop/src/renderer/hooks/useFindReplace.ts` — 新 hook
- `desktop/src/renderer/components/FindReplacePanel.tsx` — 新组件

---

## Feature 12: Output/Debug Console 面板

**目标：** 底部面板支持多个输出通道（构建日志、调试输出、任务输出、插件日志），可切换通道 + 清空 + 自动滚动。

### 任务拆分

| # | 子任务 | 细节 |
|---|--------|------|
| 12.1 | OutputChannelManager 类 | 纯 TS 类，管理 `channels[]`，每个 channel 有 `name, entries[]`，支持 `append(channel, message)` |
| 12.2 | useOutputChannel hook | 管理 `channels[], activeChannel, autoScroll` |
| 12.3 | OutputPanel UI | 顶部通道切换标签; 底部日志列表（时间戳 + 级别颜色）; 工具栏（清空/自动滚动/过滤） |
| 12.4 | 集成到 App.tsx | 底部面板增加 📤 输出按钮; 各功能模块可向 OutputChannel 写入日志 |
| 12.5 | 虚拟滚动优化 | 当日志 > 1000 条时启用虚拟滚动（复用 VirtualMessageList 模式） |

### 文件清单

- `desktop/src/renderer/utils/OutputChannelManager.ts` — 新类
- `desktop/src/renderer/hooks/useOutputChannel.ts` — 新 hook
- `desktop/src/renderer/components/OutputPanel.tsx` — 新组件

---

## 功能总览矩阵

| 功能 | 优先级 | 状态 | 预估行数 |
|------|--------|------|---------|
| LogViewer 实时日志流 | P0 | ✅ 已完成 | +350 |
| 版本对比 UI | P0 | ✅ 已完成 | +350 |
| 代码片段模板引擎 | P1 | ✅ 已完成 | +300 |
| 文件资源管理器 | P0 | 🔲 待实现 | ~500 |
| 集成终端 | P0 | 🔲 待实现 | ~600 |
| Error Lens | P1 | 🔲 待实现 | ~300 |
| Symbol/Outline | P1 | 🔲 待实现 | ~350 |
| Breadcrumb | P2 | 🔲 待实现 | ~200 |
| Problems 面板 | P1 | 🔲 待实现 | ~300 |
| Color Picker | P2 | 🔲 待实现 | ~250 |
| Find/Replace 增强 | P1 | 🔲 待实现 | ~400 |
| Output/Debug Console | P1 | 🔲 待实现 | ~350 |

> **P0** = 核心功能，优先实现  
> **P1** = 重要功能，提升开发体验  
> **P2** = 锦上添花，差异化功能

---

## 技术栈总结

| 组件 | 技术选择 | 原因 |
|------|----------|------|
| 文件树 | 自定义递归组件 | 轻量，无额外依赖 |
| 终端 | node-pty + xterm.js | 行业标准 |
| Error Lens | Monaco decoration API | 原生支持 |
| Symbol 大纲 | LSP DocumentSymbol | 已有 LSP 基础 |
| Breadcrumb | LSP + Monaco cursor | 轻量实现 |
| Problems | LSP Diagnostics | 已有诊断能力 |
| Color Picker | 正则匹配 + 自定义 UI | 无需外部依赖 |
| Find/Replace | Monaco find API + 自定义引擎 | Monaco 原生支持 |
| Output | 自定义虚拟滚动列表 | 复用已有模式 |

---

## 下一步行动

1. 从 Feature 4（文件资源管理器）开始，逐个启动代理实现
2. 每个 feature 完成后立即提交
3. 优先 P0 → P1 → P2 顺序推进
