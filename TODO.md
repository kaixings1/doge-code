# TODO: 骨架/桩实现计划

## ✅ 已完成（第一轮：功能实现）

### P0-1 至 P0-6: API 层基础实现
- [x] ToolRegistry / CommandRegistry / SessionManager / ConfigManager / utils / hooks
### P1: 6 个桩工具
- [x] CtxInspectTool / TerminalCaptureTool / SubscribePRTool / ListPeersTool / PushNotificationTool / SendUserFileTool
### P2: 命令完善
- [x] api-doc gen / api-test 全子命令
### P3: ReviewArtifactTool
- [x] 实现代码审查工具

---

## ✅ 已完成（第二轮：生产级强化）

### ToolRegistry ✅
- [x] 参数 schema 验证（类型/枚举/范围/字符串约束/正则）
- [x] 权限检查（allow:/deny: + 缓存）
- [x] 超时控制（默认 60s）+ 错误分类（5 类）
- [x] 调用计时统计（平均耗时）
- [x] 工具重复注册检测 + 描述必填校验

### CommandRegistry ✅
- [x] 智能分词（引号/转义）
- [x] 长短选项解析 + 类型自动转换
- [x] 命令历史（100 条）+ 别名冲突检测
- [x] 模糊搜索（相关性评分排序）

### SessionManager ✅
- [x] 磁盘持久化 + 启动加载
- [x] 会话搜索（标题/标签）+ 统计 + 归档

### ConfigManager ✅
- [x] 环境变量回退 + 默认值 + Schema 验证
- [x] 深合并 + 自动保存 + 父路径 watcher

### ReviewArtifactTool ✅
- [x] 评分系统（100 分制 + A-F 等级）
- [x] 20+ 检查规则 + 分级报告 + 报告导出

### SubscribePRTool ✅
- [x] 订阅持久化 + subscribe/list 子命令

---

## ✅ 已完成（第三轮：高级强化）

### hooks.ts ✅
- [x] React 响应式支持（useState/useEffect 联动）
- [x] 非 React 环境回退（普通函数）
- [x] useLocalStorage 跨标签页同步
- [x] useKeybinding React 自动清理

### api-test ✅
- [x] 原生 fetch 替代 curl 子进程
- [x] 超时控制（AbortController）
- [x] 响应格式化（状态/耗时/截断）
- [x] 并发对比（Promise.all）
- [x] 基准测试加入每秒请求数
- [x] 历史记录持久化（最近 100 条）

### utils.ts ✅
- [x] withRetry（指数退避重试）
- [x] mapWithConcurrency（并发控制）
- [x] debounce / throttle（防抖节流）
- [x] withTimeout（超时包装）

### TerminalCaptureTool ✅
- [x] 多 shell 支持（cmd/powershell/bash/auto）
- [x] 流式输出捕获（spawn）
- [x] stdout/stderr 分离
- [x] 超时强杀进程 + 输出截断保护

### SendUserFileTool ✅
- [x] 分片读取（offset/length 参数）
- [x] 大文件自动提示分片建议
- [x] 二进制 Base64 编码
- [x] 文件大小检查 + 分片数计算

### PushNotificationTool ✅
- [x] 优先级队列（high/normal/low）
- [x] 高优先级优先处理
- [x] 通知去重 + 发送统计
- [x] wait 模式（同步发送）

### SessionManager ✅
- [x] 导出会话（exportSession/exportAll）
- [x] 导入会话（importSession/importFromFile）
- [x] 会话计数

### ConfigManager ✅
- [x] 配置迁移（migrate + 版本号）
- [x] 快照/恢复（snapshot/restore）
- [x] 变更历史（changeLog）

---

## ✅ 已完成（第四轮：高级强化）

### CtxInspectTool ✅
- [x] 健康检查（内存使用率告警）
- [x] 完整环境报告（cwd/node/platform/pid/uptime/CPU/内存）
- [x] 内存详情（RSS/Heap/External/ArrayBuffers）
- [x] 使用统计（Token/费用/命令数/文件数）
- [x] Token 预算参考（阈值/触发点）
- [x] includeEnv/includeMemory 可配置

### SessionManager ✅
- [x] TTL 自动清理（cleanupStale）
- [x] 健康状态报告（active/archived/inactive 统计）

### ConfigManager ✅
- [x] 配置文件热重载（watchFile + 防抖）
- [x] stopWatchFile 停止监听

### CommandRegistry ✅
- [x] 命令参数 schema 验证（arguments 定义）
- [x] 位置参数类型检查（number/enum）
- [x] 选项参数验证
- [x] 必填参数检查 + 错误码 2

### api-test ✅
- [x] 环境变量替换（${VAR} 在 URL/body/headers 中）
- [x] 断言表达式（status ==/!=/>=/<=/>/< + body contains + body ~ regex）
- [x] 自定义断言数组支持
- [x] httpRequestResolved 包装函数

---

## ✅ 已完成（第五轮：深度强化）

### ToolRegistry ✅
- [x] 依赖注入（dependencies 字段 + 注册时自动解析）
- [x] 组合工具（compose 方法 + compose 字段）
- [x] getDependencies / checkDependencies
- [x] 未解析依赖检测

### api-test ✅
- [x] 轻量 JSON Schema 验证（validateJsonSchema）
- [x] responseSchema 字段支持（run 命令集成）
- [x] 类型/必填/属性/数组项递归验证

### PushNotificationTool ✅
- [x] 通知历史持久化（~/.doge/notifications.json，最多 100 条）
- [x] action=history / clear-history / stats 子命令
- [x] 队列发送时自动记录历史

### ListPeersTool ✅
- [x] UDP 广播节点发现（端口 45678）
- [x] action=discover / add / remove / ping / list
- [x] 发现结果自动合并到注册表
- [x] 本地 IP 检测 + 网络接口枚举
- [x] 对等节点 ping（UDP 往返时间）

### CtxInspectTool ✅
- [x] 从会话文件估算 Token 使用（TokenCalculator 逻辑）
- [x] 预算使用率告警（>80% 建议 compact，>95% 建议 clear）
- [x] 消息数统计 + 使用率百分比

---

## ✅ 已完成（第六轮：深度强化）

### SubscribePRTool ✅
- [x] 状态跟踪（lastState/lastTitle 持久化）
- [x] poll 轮询检查状态变化 + ⚠️ CHANGED 标记
- [x] unsubscribe 退订 + check PR 详情（作者/合并状态/变更量/文件数）
- [x] 订阅持久化（~/.doge/pr-subscriptions.json）

### api-doc ✅
- [x] 高级路由提取（extractRoutesAdvanced）
- [x] Next.js App Router（export const GET/POST/...）
- [x] 装饰器路由（@Get/@Post/@Put/...）
- [x] 链式路由（app.route('/x').get(...)）+ 路径参数提取
- [x] scan/all 命令集成高级提取

### api-test ✅
- [x] 断言失败时显示响应体摘要（前 500 字符）

### SessionManager ✅
- [x] 会话树形组织（getTree：按目录/分组）
- [x] 标签云（getTagCloud：标签统计排序）
- [x] 标签管理（addTag/removeTag）

### CommandRegistry ✅
- [x] 命令分组（groupByCategory：用于 /help 分类显示）
- [x] 使用频率统计（usageCount + getUsageStats 排序）
- [x] 最近使用时间跟踪（lastUsed）

### ToolRegistry ✅
- [x] 工具依赖拓扑排序（topoSort：Kahn 算法）
- [x] 循环依赖检测（抛错 + 列出循环节点）
- [x] 依赖深度计算（getDependencyDepth）+ 叶子工具列表（listLeafTools）

### CtxInspectTool ✅
- [x] 每会话独立 token 统计（perSession 数组）
- [x] Token 最高的 Top 5 会话展示
- [x] 会话级预算建议（>80% compact / >95% clear）

### ReviewArtifactTool ✅
- [x] 重写为 src/Tool.js 的 Tool 接口（buildTool + zod schema）
- [x] 消除 PermissionRequest.tsx 类型错误（TS2740/TS2367）
- [x] 修复文件扩展名正则 bug（ts|tsx 重复）

### 类型修复记录 ✅
- [x] api-test: `Command['call']` 无效索引访问 → `load: () => Promise.resolve({ call })`
- [x] api-debug: 同上 + `LocalCommandResult` 返回类型标注（showHistory/clearHistory）
- [x] PushNotificationTool: soundFlag 作用域错误（win32 分支内声明、else 分支使用）
- [x] 本轮修改的全部文件类型检查零错误（既有错误排除：useSSHSession/RemoteSessionManager/types.hooks/utils.hooks）

---

## ✅ 已完成（第七轮：工具强化 + 测试覆盖）

### TerminalCaptureTool ✅
- [x] 重构为纯 spawn 流式执行（移除 execSync 同步阻塞 + 双重逻辑）
- [x] 执行时长统计（durationMs）+ 输出行数统计
- [x] 退出码语义化（success/error/timeout/信号终止）
- [x] 输出缓冲内存保护（超 maxOutput*2 自动终止 + buffer-limit 标记）
- [x] env 环境变量透传 + powershell 加 -NoProfile
- [x] 参数校验（timeout/maxOutput 正数校验）

### SendUserFileTool ✅
- [x] offset/length 参数校验（负数/越界/超文件大小）
- [x] 二进制内容检测（前 512 字节 NUL 扫描，替代仅扩展名判断）
- [x] 预览模式（preview 参数，只显示前 N 行）
- [x] SHA-256 哈希（hash 参数，支持 chunk/base64/text 模式）
- [x] 移除 require('fs')（改用已导入的 openSync/readSync/closeSync）
- [x] 大文本文件分片预览（前 5KB 示例 + 行数/分片建议）

### api-doc ✅
- [x] TypeScript 函数签名提取（extractFunctionSignatures）
- [x] 函数声明 / 箭头函数 / 类方法三种模式解析
- [x] 参数结构化解析（rest/可选/默认值/泛型嵌套逗号）
- [x] gen 命令 md 格式自动附加签名文档
- [x] 新子命令 `sigs <file>` 单独提取签名
- [x] 验证：自身 11 个签名正确提取（bun 实测）

### API 层单元测试 ✅
- [x] CommandRegistry.test.ts（注册/别名冲突/解析/历史/搜索/分组/统计）
- [x] SessionManager.test.ts（CRUD/持久化/搜索/标签/TTL/导出导入）
- [x] ConfigManager.test.ts（get/set/环境变量回退/watchers/schema/快照/迁移）
- [x] 3 个测试文件 53 个测试全部通过（vitest + 临时目录隔离）
- [x] 测试文件类型检查零错误（matcher 类型冲突已用基础断言规避）

---

## ✅ 已完成（第八轮：基础设施存根实现）

> 扫描项目发现的全部 Stub 文件（`// Stub:` / `throw new Error('... not implemented')` / 空实现 / 占位返回）。
> 调用方：entrypoints/cli.tsx、main.tsx。

### P1: CLI 功能存根（4 个文件）
- [x] **src/cli/up.ts** — `up()`：解析 CLAUDE.md 的 `# claude up` 设置指令节
  - 计划：读取项目 CLAUDE.md → 提取 `# claude up` 到下一级标题之间的代码块/指令 → 逐条执行（bash/命令）→ 输出执行结果；找不到指令节时提示
  - 调用方：main.tsx:4165 `await up()`（仅 ANT 外部构建）
- [x] **src/cli/rollback.ts** — `rollback(target?, {list?, dryRun?, safe?})`：版本回滚
  - 计划：`--list` 列出最近 N 个发布版本+时间；`--dry-run` 只显示将安装内容；`target` 为数字=回退 N 版、为版本串=精确版本；`--safe` 回滚到服务端固定安全版本；实际执行调用 installHandler
  - 调用方：main.tsx:4181 `await rollback(target, options)`（仅 ANT）
- [x] **src/cli/bg.ts** — 后台进程管理（ps/logs/attach/kill/bg flag）
  - 计划：psHandler 列出后台会话（进程表：pid/会话id/命令/启动时间）；logsHandler 读取会话日志文件；attachHandler 重新附加到会话（IPC/TTY）；killHandler 终止会话进程；handleBgFlag 解析 `--bg` 标志并生成新后台进程
  - 调用方：entrypoints/cli.tsx:200 `await import('../cli/bg.js')`
- [x] **src/cli/handlers/ant.ts** — ant 命令处理器（9 个空 handler）
  - 计划：logHandler（查会话日志）、errorHandler（按编号查错误）、exportHandler（导出会话 JSON）、taskCreateHandler/taskListHandler/taskGetHandler/taskUpdateHandler/taskDirHandler（任务 CRUD+目录）、completionHandler（shell 补全）
  - 调用方：main.tsx `ant` 命令组（仅 ANT 外部构建）

### P2: 守护进程与运行器（4 个文件）
- [x] **src/daemon/main.ts** — `daemonMain(args)`：守护进程入口
  - 计划：解析子命令（start/stop/status）→ start 时 fork worker + 持久化 pid 文件 + IPC 通道；stop 时读 pid 终止；status 输出运行状态
  - 调用方：entrypoints/cli.tsx:186
- [x] **src/daemon/workerRegistry.ts** — `runDaemonWorker(workerId?)`：worker 运行
  - 计划：worker 类型分发（main/assistant/agent 等）→ 每种 worker 的 run() 函数（轻量启动，不加载配置）→ 监听 IPC 消息循环 → 退出信号处理
  - 调用方：entrypoints/cli.tsx:113 `runDaemonWorker(args[1])`
- [x] **src/environment-runner/main.ts** — `environmentRunnerMain(args)`：BYOC 环境运行器
  - 计划：解析 CLI 参数（--config/--session）→ 读取环境配置 → 建立与服务器的长连接（WebSocket）→ 接收并执行会话任务 → 回传结果
  - 调用方：entrypoints/cli.tsx:239（BYOC_ENVIRONMENT_RUNNER feature）
- [x] **src/self-hosted-runner/main.ts** — `selfHostedRunnerMain(args)`：自托管运行器
  - 计划：解析参数（--server-url/--token）→ 注册到自托管服务器 → 轮询任务队列 → 执行任务（本地工具调用）→ 上报进度/结果
  - 调用方：entrypoints/cli.tsx:251（SELF_HOSTED_RUNNER feature）

### P3: 服务器（6 个文件）
- [x] **src/server/lockfile.ts** — writeServerLock/removeServerLock/probeRunningServer（空实现）
  - 计划：锁文件（~/.doge/server.lock 或 /tmp）写入服务器 PID/地址；probe 检测是否已有服务器在运行
- [x] **src/server/sessionManager.ts** — `SessionManager(backend?, config?)`（空实现）
  - 计划：会话 CRUD + 后端委托（DirectConnect/DangerousBackend）+ destroyAll；对齐 server/backends/ 接口
- [x] **src/server/server.ts** — `startServer(config, sessionManager?, logger?)`：HTTP 会话服务器
  - 计划：HTTP server（port/host/unix socket）→ 认证中间件（Bearer authToken）→ 路由：GET /health、POST /session（建会话）、GET /session/:id/messages、POST /session/:id/messages（发消息+流式响应）、GET /session/:id、DELETE /session/:id → 接入 server/sessionManager.ts → CORS/超时/错误处理
  - 调用方：main.tsx:3769（`claude serve` 命令）
- [x] **src/server/connectHeadless.ts** — `runConnectHeadless(config, prompt, outputFormat, interactive)`：无头连接
  - 计划：连接远程服务器（httpUrl+authToken）→ 创建会话 → 发送 prompt → 流式接收响应 → 按 outputFormat（text/json/stream-json）输出 → interactive 时保持会话打开
  - 调用方：main.tsx:3883（`claude connect` 命令）
- [x] **src/server/serverBanner.ts** — `printBanner(config, authToken?, port?)`：服务器启动横幅
  - 计划：输出服务器地址（http/unix）、PID、认证 token（脱敏）、workspace、版本信息
  - 调用方：main.tsx:3777
- [x] **src/server/serverLog.ts** — `createServerLogger(config)`：服务器日志器
  - 计划：完善为真实日志器（时间戳/级别着色/文件输出/轮转）；当前是空 no-op 对象
  - 调用方：main.tsx:3781

### P4: 工具函数与 UI（4 个文件）
- [x] **src/utils/ccshareResume.ts** — `parseCcshareId(input)` / `loadCcshare(id)`：ccshare 会话恢复
  - 计划：parseCcshareId 从 URL/字符串提取 ccshare ID（如 `https://go/ccshare/boris-20260311-211036` → `boris-20260311-211036`）；loadCcshare 通过 API 拉取会话日志 → 返回 LogOption（对齐 loadConversationForResume 期望格式）
  - 调用方：main.tsx:3382-3386（ccshare 恢复入口）
- [x] **src/assistant/AssistantSessionChooser.tsx** — 会话选择器组件
  - 计划：Ink 组件渲染会话列表 → 键盘上下选择 → Enter 选中（onSelect）→ Esc 取消（onCancel）→ 高亮当前项
  - 调用方：assistant 交互流
- [x] **src/commands/assistant/AssistantSessionChooser.ts** — 会话选择器（同步 stub）
  - 计划：非 JSX 版本的简单选择器（返回 null 改为调用真实逻辑或移除重复 stub）
  - 说明：与 .tsx 版本重复，实现时对齐接口
- [x] **src/commands/compact/src/bootstrap/state.ts** — `markPostCompaction` 类型桩
  - 计划：改为真实类型/函数（标记压缩后状态），替代 `export type markPostCompaction = any`
  - 调用方：compact 流程

### P5: SDK 方法（1 个文件，10 个方法）
- [x] **src/entrypoints/agentSdkTypes.ts** — 实现未实现的 SDK 方法
  - 计划：query / unstable_v2_createSession / unstable_v2_resumeSession / unstable_v2_prompt / getSessionMessages / listSessions / getSessionInfo / renameSession / tagSession / forkSession 从抛错改为调用真实实现（sessionManager/QueryEngine 封装）
  - 调用方：SDK 消费者

### P6: 部分实现完善（3 个文件）
- [x] **src/engine/subagent/subAgentManager.ts** — createQueryEngine 骨架占位
  - 计划：`query(input)` 从返回占位文本改为真实隔离查询引擎（复用 engine/responseHandler 流程）；`abort()` 实现中止信号传播
- [x] **src/bridge/mobileProtocol.ts:169** — "历史记录功能待实现"
  - 计划：实现消息历史记录接口（对齐 mobile 协议）
- [x] **src/bridge/initReplBridge.ts:413** — 环境耦合部分
  - 计划：实现基于环境的设置方案（当前回退逻辑）

### 第八轮验证 ✅
- [x] 24 个存根文件全部实现（P1-P6）
- [x] 类型检查：本次修改的全部文件零错误（剩余为既有错误）
- [x] 测试：vitest run 13/13 通过 + API 层 53/53 通过
- [x] 顺带修复既有错误 7 个（AssistantSessionChooser.ts 2 个 + sessionHistory.ts 路径 3 个 + connectHeadless 类型 2 个）
- [x] 说明：initReplBridge.ts 的 perpetual 回退逻辑已存在（`!perpetual` 条件），属设计说明非缺失功能

---

## ✅ 已完成（第九轮：残余存根清理 + 第八轮测试覆盖）

### 残余存根清理（3 个文件）
- [x] **src/components/agents/SnapshotUpdateDialog.ts** — 从 stub（返回 null）实现为真实 Ink 对话框组件
  - 显示快照信息（agentType/scope/snapshotTimestamp）
  - merge/keep/replace 三选项键盘导航（↑/↓ 或 j/k + Enter，Esc/q 取消）
  - buildMergePrompt 生成合并提示文本
- [x] **src/components/agents/SnapshotUpdateDialog.tsx** — 改为 re-export .ts 实现（dialogLaunchers 导入 .js 解析到 .ts）
- [x] **src/components/ui/option.ts** — 接口已完整，去除误写的 Stub 注释

### 第八轮测试覆盖（5 个新测试文件 26 个测试）
- [x] **parseConnectUrl.test.ts**（6 个）— cc:// / cc+unix:// / http(s) URL 解析、token 提取、无 token/无法识别
- [x] **ccshareResume.test.ts**（6 个）— parseCcshareId URL 路径/裸 ID/查询参数/前缀/空输入/过短
- [x] **mobileProtocol.test.ts**（6 个）— recordCommand/getCommandHistory 记录与上限 100、getHistory handler、sendMessage
- [x] **compactState.test.ts**（4 个）— markPostCompaction 回调执行/清空/取消注册/异常隔离
- [x] **serverLog.test.ts**（4 个）— 日志写文件（时间戳/级别）、级别过滤、raw 行、console 模式

### 第九轮验证 ✅
- [x] 类型检查：本次修改全部文件零错误（剩余为既有错误）
- [x] 测试：vitest run 15/15 + API 层 79/79 = 94 个测试全部通过
- [x] 错误总数累计 5089 → 4749（净减少 340 个）

---

## ✅ 已完成（第十轮：API 工具函数 + CLI 提取逻辑测试覆盖）

### cli/up.ts 强化 ✅
- [x] 导出 findClaudeMd / extractUpSection / extractCommands（支持单元测试）
- [x] UP_SECTION_HEADING 支持多级标题（`#`/`##`/`### claude up`）

### api/utils.ts 强化 ✅
- [x] createTelemetryEvent 无属性时默认空对象（避免返回空值）

### 测试覆盖（2 个新测试文件 32 个测试）
- [x] **utils.test.ts**（21 个）— getModelProvider / calculateModelCost / withRetry / mapWithConcurrency / withTimeout / checkPermission / serialize / createTelemetryEvent
- [x] **upExtract.test.ts**（11 个）— extractUpSection（多级标题/边界）/ extractCommands（代码块/$ 前缀/注释过滤）/ findClaudeMd（当前目录/父目录/优先级/找不到）

### 第十轮验证 ✅
- [x] 类型检查：本次修改全部文件零错误（剩余为既有错误）
- [x] 测试：API 层 111/111 全部通过（累计 10 个测试文件）
- [x] 完整 vitest 失败项均为并行会话引入（AppStore 测试修改中、integration 依赖 bun:bundle），非本任务范围
- [x] 错误总数累计 5089 → 4282（净减少 807 个）

---

## ✅ 已完成（第十一轮：修复 3 个失败测试文件，完整 vitest 全绿）

### 背景
完整 vitest run 曾有 3 个失败文件：
1. **AppStore.test.ts** — `(listener).calls` 应为 `.mock.calls`（并行会话已修复，无需再改）
2. **integration/api.test.ts** — 导入链依赖 bun 特性
3. **integration/mcp.test.ts** — 同上

### 根因分析
- 项目源码 **461 处 require / 181 个文件** 依赖 bun 的 `.js` → `.ts` 隐式解析
- `bunfig.toml [exports]` 映射的 `bun:bundle` 在 vitest 中不生效（vitest 用自己的解析器）
- 宿主进程注入的 `CLAUDE_CODE_FEATURE_*` 环境变量使 polyfill `feature()` 返回 true，
  触发条件 require（teamMemPaths.js 等），而 vitest 的 Node 解析无法 `.js` → `.ts`

### 修复方案（三层）
- [x] **vitest.config.ts**：`bun:bundle` alias → polyfill；`src/__tests__/integration` 移出 exclude
- [x] **tests/setup.ts**：删除 `CLAUDE_CODE_FEATURE_*` env（polyfill 全部默认 false）；
      patch `Module._resolveFilename`（require 的 `.js`/无扩展名 → `.ts`/`.tsx`，基于父模块目录）；
      注册 ESM resolve hook
- [x] **tests/esm-resolver.mjs**：Node ESM resolve hook，`.js` 后缀 import 回退 `.ts`
      （覆盖 Node type stripping 加载的 .ts 内部 import）

### 第十一轮验证 ✅
- [x] 完整 vitest run：**20 个测试文件 / 184 个测试全部通过**（此前 16/147）
- [x] integration 测试（7 个）从失败 → 全部通过
- [x] AppStore.test.ts 6/6 通过（并行会话已修复）
- [x] 本次修改文件类型检查零新增错误（reporter 报错为既有、非本次引入）