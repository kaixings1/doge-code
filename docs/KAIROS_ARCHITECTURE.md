# KAIROS 架构深度解析

> 基于 Claude Code 源码（commit `0a14432`）的逆向分析。所有结论均附源码引用。

---

## 目录

1. [系统概述](#1-系统概述)
2. [架构总览](#2-架构总览)
3. [子系统详解](#3-子系统详解)
   - 3.1 [Daemon 守护进程](#31-daemon-守护进程)
   - 3.2 [Assistant Viewer 模式](#32-assistant-viewer-模式)
   - 3.3 [Brief Mode（结构化输出）](#33-brief-mode结构化输出)
   - 3.4 [Proactive Mode（自主行动）](#34-proactive-mode自主行动)
   - 3.5 [Channels（多渠道接入）](#35-channels多渠道接入)
   - 3.6 [Channel Permission Protocol（远程审批）](#36-channel-permission-protocol远程审批)
   - 3.7 [Auto-Dream（记忆整理）](#37-auto-dream记忆整理)
   - 3.8 [Agent Leadership（团队协调）](#38-agent-leadership团队协调)
   - 3.9 [GitHub Webhooks（PR/Issue 订阅）](#39-github-webhookspr-issue-订阅)
   - 3.10 [Push Notification（推送通知）](#310-push-notification推送通知)
   - 3.11 [SendUserFile（文件分享）](#311-senduserfile文件分享)
4. [数据流](#4-数据流)
   - 4.1 [启动流程](#41-启动流程)
   - 4.2 [用户主动交互](#42-用户主动交互)
   - 4.3 [Claude 主动通知](#43-claude-主动通知)
   - 4.4 [远程权限审批](#44-远程权限审批)
   - 4.5 [记忆整理流程](#45-记忆整理流程)
5. [Feature Flag 体系](#5-feature-flag-体系)
6. [使用场景](#6-使用场景)
7. [与现有模式的对比](#7-与现有模式的对比)
8. [子系统独立性分析](#8-子系统独立性分析)

---

## 1. 系统概述

KAIROS 是 Claude Code 内部开发中的 **"Assistant Mode"（助理模式）**。它将 Claude Code 从一个"你问一句、它答一步"的交互式 CLI，变成一个 **本地守护进程（daemon）**，持续在后台运行。用户通过终端 viewer 或手机（Telegram/Slack/iMessage 等）与其交互。

**一句话定义：** KAIROS 让 Claude Code 像 Docker daemon 一样在后台持续运行，自主干活，遇事通过多渠道找你。

### 代码证据

入口命令：

```
claude daemon              # 启动本地守护进程
claude --daemon-worker     # 守护进程的子 worker（由 supervisor spawn）
claude assistant [id]      # 以 viewer 身份连接到 daemon
```

**引用：**
- `src/entrypoints/cli.tsx:100` — `--daemon-worker` 入口
- `src/entrypoints/cli.tsx:165` — `claude daemon` 入口
- `src/main.tsx:3260` — `claude assistant` viewer 入口
- `src/main.tsx:4337` — 帮助文本: `"Usage: claude assistant [sessionId]\n\nAttach the REPL as a viewer client to a running bridge session."`

---

## 2. 架构总览

```
┌─────────────────────────────────────────────────────────┐
│                      你的电脑                             │
│                                                         │
│  ┌──────────────────────────────────────────┐            │
│  │  claude daemon (本地守护进程)               │            │
│  │  src/daemon/main.ts: daemonMain()         │            │
│  │                                          │            │
│  │  ┌─────────────────────────────────┐     │            │
│  │  │ daemon-worker (子 worker 进程)    │     │            │
│  │  │ src/daemon/workerRegistry.ts:    │     │            │
│  │  │   runDaemonWorker()             │     │            │
│  │  │                                 │     │            │
│  │  │ ┌─────────────┐ ┌────────────┐ │     │            │
│  │  │ │ 主 Agent     │ │ Teammate A │ │     │            │
│  │  │ │ (Brief Mode) │ │ (子 agent) │ │     │            │
│  │  │ └──────┬──────┘ └─────┬──────┘ │     │            │
│  │  │        │              │        │     │            │
│  │  │        └──────┬───────┘        │     │            │
│  │  │               ↕                │     │            │
│  │  │        Anthropic API           │     │            │
│  │  │               ↕                │     │            │
│  │  │        SleepTool (休眠/唤醒)    │     │            │
│  │  └─────────────────────────────────┘     │            │
│  │                  ↕                        │            │
│  │           Bridge Session                  │            │
│  │  (CCR WebSocket + HTTP POST)              │            │
│  └──────────┬───────────────┬───────────────┘            │
│             │               │                            │
│  ┌──────────┴──────┐  ┌────┴────────────────┐            │
│  │ claude assistant │  │ MCP Channel Servers │            │
│  │ (终端 Viewer)    │  │ (本地 MCP 进程)      │            │
│  │ 只读 + 发消息    │  │                     │            │
│  │ + 审批权限       │  │ ┌─────────────────┐ │            │
│  └─────────────────┘  │ │ Telegram Bot    │ │            │
│                       │ │ Slack Bot       │ │            │
│                       │ │ iMessage Bridge │ │            │
│                       │ │ Discord Bot     │ │            │
│                       │ │ SMS Gateway     │ │            │
│                       │ └─────────────────┘ │            │
│                       └─────────────────────┘            │
│                                ↕                         │
└────────────────────────────────┼─────────────────────────┘
                                 │
                          ┌──────┴──────┐
                          │  你的手机     │
                          │ Telegram App │
                          │ Slack App    │
                          │ iMessage     │
                          └─────────────┘
```

### 核心组件

| 组件 | 源码位置 | 职责 |
|------|---------|------|
| Daemon Supervisor | `src/daemon/main.ts:daemonMain()` | 长驻 supervisor 进程 |
| Daemon Worker | `src/daemon/workerRegistry.ts:runDaemonWorker()` | 每个 worker 跑一个 agent session |
| Assistant Viewer | `src/main.tsx:3259-3354` | 只读终端客户端 |
| Bridge | `src/bridge/bridgeMain.ts:runBridgeHeadless()` | daemon worker 的无头 bridge |
| Brief Tool | `src/tools/BriefTool/BriefTool.ts` | 结构化用户输出 |
| Channel System | `src/services/mcp/channelNotification.ts` | 多渠道消息路由 |
| Proactive System | `src/proactive/index.ts` | 自主行动控制 |
| Auto-Dream | `src/services/autoDream/autoDream.ts` | 记忆整理 |
| Cron Scheduler | `src/utils/cronScheduler.ts` | 定时任务（daemon 路径）|
| Session Manager | `src/remote/RemoteSessionManager.ts` | viewer ↔ daemon 通信 |

---

## 3. 子系统详解

### 3.1 Daemon 守护进程

Daemon 是 KAIROS 的基础设施层。它是一个**本地后台进程**，不依赖云端。

#### 入口

```typescript
// src/entrypoints/cli.tsx:164-178
// Fast-path for `claude daemon [subcommand]`: long-running supervisor.
if (feature('DAEMON') && args[0] === 'daemon') {
    const { daemonMain } = await import('../daemon/main.js')
    await daemonMain(args.slice(1))
}
```

```typescript
// src/entrypoints/cli.tsx:100-106
// Fast-path for `--daemon-worker=<kind>` (internal — supervisor spawns this).
// Must come before the daemon subcommand check: spawned per-worker, so
// perf-sensitive. No enableConfigs(), no analytics sinks at this layer —
// workers are lean.
if (feature('DAEMON') && args[0] === '--daemon-worker') {
    const { runDaemonWorker } = await import('../daemon/workerRegistry.js')
    await runDaemonWorker(args[1])
}
```

#### 无头 Bridge Worker

Daemon worker 通过无头 bridge 运行 agent session：

```typescript
// src/bridge/bridgeMain.ts:2800-2813
// Non-interactive bridge entrypoint for the `remoteControl` daemon worker.
export async function runBridgeHeadless(
  opts: HeadlessBridgeOpts,
  signal: AbortSignal,
): Promise<void>
```

```typescript
// src/bridge/bridgeMain.ts:2785-2797
export type HeadlessBridgeOpts = {
  dir: string
  name?: string
  spawnMode: 'same-dir' | 'worktree'
  capacity: number
  permissionMode?: string
  sandbox: boolean
  sessionTimeoutMs?: number
  createSessionOnStart: boolean
  getAccessToken: () => string | undefined
  onAuth401: (failedToken: string) => Promise<boolean>
  log: (s: string) => void
}
```

#### Worker 类型标识

当 KAIROS 激活时，bridge worker 类型标记为 `claude_code_assistant`：

```typescript
// src/bridge/initReplBridge.ts:475-485
let workerType: BridgeWorkerType = 'claude_code'
if (feature('KAIROS')) {
  const { isAssistantMode } =
    require('../assistant/index.js') as typeof import('../assistant/index.js')
  if (isAssistantMode()) {
    workerType = 'claude_code_assistant'
  }
}
```

#### Session Kind

Daemon sessions 有专属的 kind 标识，与普通 interactive/bg session 区分：

```typescript
// src/utils/concurrentSessions.ts:18
export type SessionKind = 'interactive' | 'bg' | 'daemon' | 'daemon-worker'
```

#### 当前状态

Daemon 模块在 npm 发布版中是 **stub**：

```typescript
// src/daemon/main.ts
export async function daemonMain(_args: string[]): Promise<void> {
  throw new Error('daemon stub: not implemented')
}

// src/daemon/workerRegistry.ts
export async function runDaemonWorker(_workerId?: string): Promise<void> {
  throw new Error('workerRegistry stub: not implemented')
}
```

---

### 3.2 Assistant Viewer 模式

`claude assistant [sessionId]` 将终端变成一个**只读 viewer**，连接到正在运行的 daemon session。

#### 命令注册

```typescript
// src/main.tsx:4331-4340
if (feature('KAIROS')) {
  program.command('assistant [sessionId]')
    .description('Attach the REPL as a client to a running bridge session.')
    .action(() => {
      process.stderr.write(
        'Usage: claude assistant [sessionId]\n\n' +
        'Attach the REPL as a viewer client to a running bridge session.\n' +
        'Omit sessionId to discover and pick from available sessions.\n'
      );
      process.exit(1);
    });
}
```

#### 参数解析

```typescript
// src/main.tsx:554-562
// Set by early argv processing when `claude assistant [sessionId]` is detected
type PendingAssistantChat = {
  sessionId?: string
  discover?: boolean
}

// src/main.tsx:679-698
// `claude assistant [sessionId]` — stash and strip so the main
// command handler sees a clean argv
```

#### Session 发现流程

```typescript
// src/main.tsx:3259-3307
} else if (feature('KAIROS') && _pendingAssistantChat &&
           (_pendingAssistantChat.sessionId || _pendingAssistantChat.discover)) {

  const { discoverAssistantSessions } =
    await import('./assistant/sessionDiscovery.js');

  let targetSessionId = _pendingAssistantChat.sessionId;
  if (!targetSessionId) {
    const sessions = await discoverAssistantSessions();

    if (sessions.length === 0) {
      // 无可用 session → 启动安装向导
      installedDir = await launchAssistantInstallWizard(root);
      // "Assistant installed in ${installedDir}. The daemon is starting up —
      //  run `claude assistant` again in a few seconds to connect."
    }
    if (sessions.length === 1) {
      targetSessionId = sessions[0]!.id;  // 自动选择
    } else {
      // 多个 session → 打开选择器
      const picked = await launchAssistantSessionChooser(root, { sessions });
      targetSessionId = picked;
    }
  }
```

**引用：**
- `src/assistant/sessionDiscovery.ts:9` — `discoverAssistantSessions(): Promise<AssistantSession[]>`
- `src/assistant/AssistantSessionChooser.tsx:9` — `AssistantSessionChooser` 组件
- `src/dialogLaunchers.tsx:58-64` — `launchAssistantSessionChooser()`
- `src/dialogLaunchers.tsx:73-89` — `launchAssistantInstallWizard()`

#### Viewer 状态初始化

```typescript
// src/main.tsx:3324-3333
setKairosActive(true);       // 激活 KAIROS 标志
setUserMsgOptIn(true);       // Brief mode opt-in
setIsRemoteMode(true);       // 远程模式（禁止本地文件操作）

const assistantInitialState: AppState = {
  ...initialState,
  isBriefOnly: true,         // 强制 Brief 模式
  kairosEnabled: false,      // viewer 端不运行 daemon 逻辑
  replBridgeEnabled: false   // viewer 端不启动 bridge（由 RemoteSession 处理）
};
```

#### RemoteSessionConfig

```typescript
// src/remote/RemoteSessionManager.ts:50-62
export type RemoteSessionConfig = {
  sessionId: string
  getAccessToken: () => string
  orgUuid: string
  hasInitialPrompt?: boolean
  /**
   * When true, this client is a pure viewer. Ctrl+C/Escape do NOT send
   * interrupt to the remote agent; 60s reconnect timeout is disabled;
   * session title is never updated. Used by `claude assistant`.
   */
  viewerOnly?: boolean
}
```

#### Viewer 能力限制

| 操作 | 是否允许 |
|------|---------|
| 查看消息流 | ✅ |
| 发送新消息 | ✅ （通过 HTTP POST） |
| 审批权限请求 | ✅ |
| Ctrl+C 中断 | ❌ （viewerOnly 禁用） |
| 直接执行 bash | ❌ |
| 编辑文件 | ❌ |
| 切换工具/模式 | ❌ |

#### 历史消息懒加载

Viewer 支持向上滚动加载历史消息：

```typescript
// src/hooks/useAssistantHistory.ts:72-77
// enabled = config?.viewerOnly === true — 仅 viewer 模式激活

// 分页参数
// src/assistant/sessionHistory.ts:7
const HISTORY_PAGE_SIZE = 100

// API 调用
// src/assistant/sessionHistory.ts:73-87
fetchLatestEvents(ctx)        // 初始加载：anchor_to_latest
fetchOlderEvents(ctx, cursor) // 向上滚动：before_id 游标分页
```

滚动锚定机制（防止加载旧消息时画面跳动）：

```typescript
// src/hooks/useAssistantHistory.ts:199-208
// useLayoutEffect: 在 React commit 后补偿 scrollTop
// Before: snapshot height via getFreshScrollHeight()
// After: scroll by delta to keep viewport at same position
```

自动填满视口：最多链式加载 `MAX_FILL_PAGES = 10` 页（`useAssistantHistory.ts:42`）。

---

### 3.3 Brief Mode（结构化输出）

KAIROS 模式下，Claude 的所有用户可见输出**必须**通过 `SendUserMessage` 工具发送。Plain text 只在展开详情时可见。

#### 工具定义

```typescript
// src/tools/BriefTool/prompt.ts:1-2
export const BRIEF_TOOL_NAME = 'SendUserMessage'
export const LEGACY_BRIEF_TOOL_NAME = 'Brief'

// src/tools/BriefTool/prompt.ts:6-10
export const BRIEF_TOOL_PROMPT = `Send a message the user will read.
Text outside this tool is visible in the detail view, but most won't
open it — the answer lives here.

\`message\` supports markdown. \`attachments\` takes file paths
(absolute or cwd-relative) for images, diffs, logs.

\`status\` labels intent: 'normal' when replying to what they just asked;
'proactive' when you're initiating — a scheduled task finished, a blocker
surfaced during background work, you need input on something they haven't
asked about. Set it honestly; downstream routing uses it.`
```

#### 输入 Schema

```typescript
// src/tools/BriefTool/BriefTool.ts:20-37
inputSchema: {
  message: string,          // markdown 格式消息
  attachments?: string[],   // 文件路径（图片、diff、日志）
  status: 'normal' | 'proactive'  // 意图标签
}
```

#### 激活条件（五种路径）

```typescript
// src/tools/BriefTool/BriefTool.ts:88-100 — isBriefEntitled()
return feature('KAIROS') || feature('KAIROS_BRIEF')
  ? getKairosActive() ||                                              // 路径1: KAIROS daemon 模式
    isEnvTruthy(process.env.CLAUDE_CODE_BRIEF) ||                     // 路径2: 环境变量
    getFeatureValue_CACHED_WITH_REFRESH('tengu_kairos_brief', ...)    // 路径3: GrowthBook 灰度
  : false

// src/tools/BriefTool/BriefTool.ts:126-134 — isBriefEnabled()
return (getKairosActive() || getUserMsgOptIn()) && isBriefEntitled()
// getUserMsgOptIn() 通过以下方式设置：
// 路径4: --brief CLI flag (main.tsx:4620-4649)
// 路径5: /brief 命令 (src/commands/brief.ts:51-56)
// 路径6: defaultView: 'chat' 设置 (main.tsx:2184)
```

#### 附件上传

```typescript
// src/tools/BriefTool/upload.ts:32-34
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024  // 30MB
const UPLOAD_TIMEOUT_MS = 30_000            // 30 秒超时

// src/tools/BriefTool/upload.ts:92-174 — uploadBriefAttachment()
// 上传到 /api/oauth/file_upload（multipart form）
// 返回 file_uuid（best-effort，失败不阻塞）
```

#### Proactive 输出协议（完整 Prompt）

```typescript
// src/tools/BriefTool/prompt.ts:12-22 — BRIEF_PROACTIVE_SECTION
`## Talking to the user

SendUserMessage is where your replies go. Text outside it is visible if the
user expands the detail view, but most won't — assume unread. Anything you
want them to actually see goes through SendUserMessage. The failure mode:
the real answer lives in plain text while SendUserMessage just says "done!"
— they see "done!" and miss everything.

So: every time the user says something, the reply they actually read comes
through SendUserMessage. Even for "hi". Even for "thanks".

If you can answer right away, send the answer. If you need to go look —
run a command, read files, check something — ack first in one line
("On it — checking the test output"), then work, then send the result.
Without the ack they're staring at a spinner.

For longer work: ack → work → result. Between those, send a checkpoint when
something useful happened — a decision you made, a surprise you hit, a phase
boundary. Skip the filler ("running tests...") — a checkpoint earns its
place by carrying information.

Keep messages tight — the decision, the file:line, the PR number.
Second person always ("your config"), never third.`
```

---

### 3.4 Proactive Mode（自主行动）

Proactive 模式让 Claude 不再等待用户输入，而是**自主决定做什么**。

#### 模块接口

```typescript
// src/proactive/index.ts（stub）
export function isProactiveActive(): boolean        // 是否处于主动模式
export function isProactivePaused(): boolean        // 是否暂停
export function activateProactive(_source: string): void
export function deactivateProactive(): void
export function pauseProactive(): void
export function setContextBlocked(_blocked: boolean): void
export function subscribeToProactiveChanges(_callback: () => void): () => void
```

#### Tick 系统

模型通过 `<tick>` 标签接收周期性唤醒信号：

```typescript
// src/constants/xml.ts:25
export const TICK_TAG = 'tick'
```

#### 系统 Prompt 注入

```typescript
// src/constants/prompts.ts:72-75
const proactiveModule =
  feature('PROACTIVE') || feature('KAIROS')
    ? require('../proactive/index.js')
    : null

// src/constants/prompts.ts:863-916 — getProactiveSection()
// 返回的 prompt 包含以下指导：
```

Proactive prompt 的核心指导（`src/constants/prompts.ts:867-916`）：

```
# Autonomous work

You will receive <tick> prompts — these are periodic check-ins.

## Pacing
- Each wake-up costs an API call, prompt cache expires after 5min
- Use Sleep tool when nothing useful to do

## First wake-up
- Greet the user briefly

## What to do on subsequent wake-ups
- Check for new work, process queued messages
- Act on anything useful, Sleep if nothing to do

## Staying responsive
- If user sends a message, drop what you're doing and respond

## Terminal focus
- **Unfocused**: The user is away. Lean heavily into autonomous action
- **Focused**: The user is watching. Be more collaborative
```

#### SleepTool

SleepTool 控制 agent 的休眠/唤醒周期：

```typescript
// src/tools/SleepTool/prompt.ts:3
export const SLEEP_TOOL_NAME = 'Sleep'

// src/tools/SleepTool/prompt.ts:7-17
export const SLEEP_TOOL_PROMPT = `Wait for a specified duration.
The user can interrupt the sleep at any time.

You may receive <tick> prompts — these are periodic check-ins.
Look for useful work to do before sleeping.

You can call this concurrently with other tools — it won't interfere.
Prefer this over Bash(sleep ...) — it doesn't hold a shell process.`
```

当 Channel 消息到达时，SleepTool 通过消息队列唤醒：

```typescript
// src/services/mcp/useManageMCPConnections.ts:523-529
// Channel notification → enqueue with priority 'next'
enqueue({
  mode: 'prompt',
  value: wrapChannelMessage(client.name, content, meta),
  priority: 'next',
  isMeta: true,
  origin: { kind: 'channel', server: client.name },
  skipSlashCommands: true,
})
// SleepTool 轮询 hasCommandsInQueue()，1 秒内唤醒
```

---

### 3.5 Channels（多渠道接入）

Channel 系统让 Claude 通过 Telegram、Slack、Discord、iMessage、SMS 等渠道与用户通信。

#### 设计哲学

```typescript
// src/services/mcp/channelNotification.ts:1-17（注释原文）
/**
 * Channel notifications — lets an MCP server push user messages into the
 * conversation. A "channel" (Discord, Slack, SMS, etc.) is just an MCP server
 * that:
 *   - exposes tools for outbound messages (e.g. `send_message`) — standard MCP
 *   - sends `notifications/claude/channel` notifications for inbound — this file
 *
 * The notification handler wraps the content in a <channel> tag and
 * enqueues it. SleepTool polls hasCommandsInQueue() and wakes within 1s.
 * The model sees where the message came from and decides which tool to reply
 * with (the channel's MCP tool, SendUserMessage, or both).
 */
```

#### 入站消息 Schema

```typescript
// src/services/mcp/channelNotification.ts:37-47
export const ChannelMessageNotificationSchema = lazySchema(() =>
  z.object({
    method: z.literal('notifications/claude/channel'),
    params: z.object({
      content: z.string(),
      meta: z.record(z.string(), z.string()).optional(),
    }),
  }),
)
```

#### XML 包裹

入站消息被包裹为 `<channel>` XML 标签，送入模型上下文：

```typescript
// src/services/mcp/channelNotification.ts:106-116
function wrapChannelMessage(
  serverName: string,
  content: string,
  meta?: Record<string, string>,
): string {
  const attrs = Object.entries(meta ?? {})
    .filter(([k]) => SAFE_META_KEY.test(k))
    .map(([k, v]) => ` ${k}="${escapeXmlAttr(v)}"`)
    .join('')
  return `<channel source="${escapeXmlAttr(serverName)}"${attrs}>\n${content}\n</channel>`
}
```

实际效果：

```xml
<channel source="plugin:telegram:tg" user_id="123" thread_ts="456">
你好 Claude，PR 合完了吗？
</channel>
```

Meta 键安全验证（防 XML 属性注入）：

```typescript
// src/services/mcp/channelNotification.ts:99-104
const SAFE_META_KEY = /^[a-zA-Z_][a-zA-Z0-9_]*$/
// 只允许纯标识符，拒绝 : . - 等可能破坏 XML 结构的字符
```

**引用：** `src/constants/xml.ts:56` — `export const CHANNEL_TAG = 'channel'`

#### 六层 Gate

Channel server 必须通过六层检查才能接入：

```typescript
// src/services/mcp/channelNotification.ts:191-316
export function gateChannelServer(
  serverName: string,
  capabilities: ServerCapabilities | undefined,
  pluginSource: string | undefined,
): ChannelGateResult
```

| 层 | 检查内容 | 引用 |
|----|---------|------|
| 1. Capability | Server 声明 `experimental['claude/channel']` | `channelNotification.ts:200` |
| 2. Runtime gate | GrowthBook `tengu_harbor` = true | `channelAllowlist.ts:51-53` |
| 3. Auth | 必须使用 OAuth（API key 用户被阻止） | `channelNotification.ts:222` |
| 4. Policy | Teams/Enterprise 需 `channelsEnabled: true` | `channelNotification.ts:238` |
| 5. Session | Server 在 `--channels` 参数列表中 | `channelNotification.ts:250` |
| 6. Allowlist | Plugin 在 `tengu_harbor_ledger` 白名单中 | `channelAllowlist.ts:37-44` |

#### Allowlist 管理

```typescript
// src/services/mcp/channelAllowlist.ts:23-26
export type ChannelAllowlistEntry = {
  marketplace: string
  plugin: string
}

// src/services/mcp/channelAllowlist.ts:37-44
export function getChannelAllowlist(): ChannelAllowlistEntry[] {
  const raw = getFeatureValue_CACHED_MAY_BE_STALE<unknown>(
    'tengu_harbor_ledger', []
  )
  // ...
}
```

---

### 3.6 Channel Permission Protocol（远程审批）

当 Claude 需要执行敏感操作时，通过 Channel 发送审批请求到用户手机。

#### 出站：审批请求

```typescript
// src/services/mcp/channelNotification.ts:85-95
export const CHANNEL_PERMISSION_REQUEST_METHOD =
  'notifications/claude/channel/permission_request'

export type ChannelPermissionRequestParams = {
  request_id: string        // 5 字母确认码
  tool_name: string         // 工具名称
  description: string       // 操作描述
  input_preview: string     // JSON 截断到 200 字符，手机屏幕预览
}
```

#### 入站：审批回复

```typescript
// src/services/mcp/channelNotification.ts:62-72
export const ChannelPermissionNotificationSchema = lazySchema(() =>
  z.object({
    method: z.literal('notifications/claude/channel/permission'),
    params: z.object({
      request_id: z.string(),
      behavior: z.enum(['allow', 'deny']),
    }),
  }),
)
```

#### 5 字母确认码生成

```typescript
// src/services/mcp/channelPermissions.ts:75
export const PERMISSION_REPLY_RE = /^\s*(y|yes|n|no)\s+([a-km-z]{5})\s*$/i
// 5 个小写字母，不包含 'l'（避免与 1/I 混淆）
// 大小写不敏感（手机自动更正）

// src/services/mcp/channelPermissions.ts:140-152 — shortRequestId()
// FNV-1a hash → base-25 编码
// 字母表: abcdefghijkmnopqrstuvwxyz（25 个字母，无 'l'）
// 空间: 25^5 ≈ 980 万种组合
// 内置脏词过滤（26 个屏蔽词），失败重试最多 10 次
```

#### Pending 权限管理

```typescript
// src/services/mcp/channelPermissions.ts:209-240
export function createChannelPermissionCallbacks(): ChannelPermissionCallbacks {
  const pending = new Map<string, (response: ChannelPermissionResponse) => void>()

  return {
    onResponse(requestId, handler) {
      pending.set(requestId.toLowerCase(), handler)
      return () => { pending.delete(requestId.toLowerCase()) }
    },
    resolve(requestId, behavior, fromServer) {
      const key = requestId.toLowerCase()
      const resolver = pending.get(key)
      if (!resolver) return false
      pending.delete(key)          // 先删再调用，防重复
      resolver({ behavior, fromServer })
      return true
    },
  }
}
```

#### Server 端要求

Channel server 必须**显式声明** permission 能力才能参与审批：

```typescript
// src/services/mcp/channelPermissions.ts:177-194
// filterPermissionRelayClients() 三重条件：
// 1. c.type === 'connected'
// 2. isInAllowlist(c.name)
// 3. BOTH capabilities:
//    - capabilities.experimental['claude/channel'] ✓
//    - capabilities.experimental['claude/channel/permission'] ✓
```

这确保了普通聊天消息**不可能**意外触发审批——只有 server 主动发出 permission 事件才算数。

#### 完整审批流程示例

```
1. Claude 想执行 `rm -rf dist/`
2. 本地终端弹出权限对话框
3. 同时发送到 Telegram MCP server:
   notifications/claude/channel/permission_request
   {request_id: "tbxkq", tool_name: "Bash", description: "rm -rf dist/",
    input_preview: '{"command":"rm -rf dist/"}'}
4. Telegram Bot 格式化消息发送给用户:
   "Claude needs to run: rm -rf dist/
    Reply: yes tbxkq or no tbxkq"
5. 用户在手机回复: "yes tbxkq"
6. Telegram MCP server 解析回复:
   /^\s*(y|yes|n|no)\s+([a-km-z]{5})\s*$/i
7. Server 发出:
   notifications/claude/channel/permission
   {request_id: "tbxkq", behavior: "allow"}
8. channelPermissions.resolve("tbxkq", "allow", "plugin:telegram:tg")
9. pending map 匹配 → 权限通过 → Claude 执行 rm -rf dist/
```

---

### 3.7 Auto-Dream（记忆整理）

Dream 是一个**独立于 KAIROS 的功能**。Claude 在空闲时 fork 一个子 agent 回顾历史对话，将有价值的信息整理到记忆文件中。

> 注意：KAIROS 激活时，Auto-Dream **关闭**，改用另一套 disk-skill dream 方案。

**引用：** `src/services/autoDream/consolidationPrompt.ts:1` — `"Extracted from dream.ts so auto-dream ships independently of KAIROS feature flags"`

#### 触发条件

```typescript
// src/services/autoDream/autoDream.ts:95-100
function isGateOpen(): boolean {
  if (getKairosActive()) return false   // KAIROS 用另一套方案
  if (getIsRemoteMode()) return false   // 远程模式不触发
  if (!isAutoMemoryEnabled()) return false  // 需要开启 auto memory
  return isAutoDreamEnabled()           // 需要 GB flag 或设置
}
```

三个阈值（全部满足才触发）：

```typescript
// src/services/autoDream/autoDream.ts — 默认阈值
const DEFAULTS: AutoDreamConfig = {
  minHours: 24,       // 距上次整理 ≥ 24 小时
  minSessions: 5,     // 期间 ≥ 5 个新 session 被触碰
}
// SESSION_SCAN_INTERVAL_MS = 600_000 (10 分钟扫描间隔)
```

配置来源：

```typescript
// src/services/autoDream/config.ts:13-21
export function isAutoDreamEnabled(): boolean {
  const setting = getInitialSettings().autoDreamEnabled  // 设置覆盖
  if (setting !== undefined) return setting
  const gb = getFeatureValue_CACHED_MAY_BE_STALE<{ enabled?: unknown } | null>(
    'tengu_onyx_plover', null                             // GrowthBook 灰度
  )
  return gb?.enabled === true
}
```

#### 锁机制

```typescript
// src/services/autoDream/consolidationLock.ts
// 锁文件: .consolidate-lock
// 过期阈值: 60 分钟（PID 重用保护）

tryAcquireConsolidationLock(): Promise<number | null>
// 写入 PID，检查 holder 进程是否存活，死进程则回收锁
// 返回 prior mtime（用于 kill 时回滚）

listSessionsTouchedSince(sinceMs: number): Promise<string[]>
// 扫描 transcript 目录，过滤 mtime > sinceMs 的 session
```

#### Dream Prompt（完整内容）

```typescript
// src/services/autoDream/consolidationPrompt.ts:15-64 — buildConsolidationPrompt()
`# Dream: Memory Consolidation

You are performing a dream — a reflective pass over your memory files.
Synthesize what you've learned recently into durable, well-organized
memories so that future sessions can orient quickly.

Memory directory: \`${memoryRoot}\`
Session transcripts: \`${transcriptDir}\` (large JSONL files — grep narrowly,
don't read whole files)

## Phase 1 — Orient
- \`ls\` the memory directory to see what already exists
- Read \`MEMORY.md\` to understand the current index
- Skim existing topic files so you improve them rather than creating duplicates

## Phase 2 — Gather recent signal
1. **Daily logs** (logs/YYYY/MM/YYYY-MM-DD.md) if present
2. **Existing memories that drifted** — facts that contradict the codebase
3. **Transcript search** — grep JSONL transcripts for narrow terms:
   \`grep -rn "<narrow term>" ${transcriptDir}/ --include="*.jsonl" | tail -50\`

Don't exhaustively read transcripts. Look only for things you already suspect matter.

## Phase 3 — Consolidate
- Merge new signal into existing topic files (not near-duplicates)
- Convert relative dates to absolute dates
- Delete contradicted facts — fix at the source

## Phase 4 — Prune and index
Update MEMORY.md so it stays under ${MAX_ENTRYPOINT_LINES} lines AND under ~25KB.
Each entry: one line under ~150 chars: \`- [Title](file.md) — one-line hook\`.
Never write memory content directly into it.`
```

#### Dream Task UI

```typescript
// src/tasks/DreamTask/DreamTask.ts:23
type DreamPhase = 'starting' | 'updating'
// 'starting' → 'updating' 当首次检测到 Edit/Write tool_use

// src/tasks/DreamTask/DreamTask.ts:25-41
type DreamTaskState = {
  type: 'dream'
  phase: DreamPhase
  sessionsReviewing: number    // 正在回顾的 session 数
  filesTouched: string[]       // 修改过的文件
  turns: DreamTurn[]           // 对话轮次（最多 MAX_TURNS=30）
  priorMtime: number           // kill 时回滚锁用
}
```

进度监控：

```typescript
// src/services/autoDream/autoDream.ts:281-313 — makeDreamProgressWatcher()
// 从 assistant 消息中提取 text blocks 和 tool_use counts
// 检测 FILE_EDIT_TOOL_NAME / FILE_WRITE_TOOL_NAME → 记录 touchedPaths
// 调用 addDreamTurn() 更新 UI
```

---

### 3.8 Agent Leadership（团队协调）

KAIROS 独占的核心功能。主 agent 可以 spawn 和管理多个 teammate agent。

#### 初始化

```typescript
// src/main.tsx:1048-1087
if (feature('KAIROS') && (options as { assistant?: boolean }).assistant
    && assistantModule) {
  // ...
  if (kairosEnabled) {
    opts.brief = true;
    setKairosActive(true);
    assistantTeamContext =
      await assistantModule.initializeAssistantTeam();
  }
}

// src/main.tsx:3031-3035 — 团队上下文传递到查询循环
teamContext: feature('KAIROS')
  ? assistantTeamContext ?? computeInitialTeamContext?.()
  : computeInitialTeamContext?.()
```

#### 接口（stub）

```typescript
// src/assistant/index.ts
export function isAssistantMode(): boolean { return false }
export function isAssistantForced(): boolean { return false }
export function markAssistantForced(): void {}
export async function initializeAssistantTeam(): Promise<any> { return {} }
export function getAssistantSystemPromptAddendum(): string { return '' }
export function getAssistantActivationPath(): string | undefined { return undefined }
```

#### 与现有 Agent Tool 的关系

在 KAIROS 模式下，通过 `Agent(name: "foo")` 直接 in-process spawn 子 agent，不需要 `TeamCreate` 命令。`assistantTeamContext` 跨轮次持久化，使得 teammates 在 agent 的整个生命周期内保持状态。

**引用：** `src/state/AppStateStore.ts:127` — `"claude assistant: count of background tasks (Agent calls, teammates, ...)"`

---

### 3.9 GitHub Webhooks（PR/Issue 订阅）

计划中的功能，允许 Claude 订阅 GitHub 仓库的 PR/Issue 变更通知。

#### 代码注册（stub）

```typescript
// src/tools.ts:50-52
const SubscribePRTool = feature('KAIROS_GITHUB_WEBHOOKS')
  ? require('./tools/SubscribePRTool/SubscribePRTool.js').SubscribePRTool
  : null

// src/commands.ts:101-103
const subscribePr = feature('KAIROS_GITHUB_WEBHOOKS')
  ? require('./commands/subscribe-pr.js').default
  : null
```

**当前状态：** 仅有 tools.ts 和 commands.ts 中的条件引用，实际模块尚未实现。

#### 设想的使用场景

结合 KAIROS daemon + channels 系统：
1. 用户通过 `/subscribe-pr` 命令让 Claude 关注某个 repo
2. GitHub Webhook 推送 PR/Issue 事件到本地 MCP server
3. MCP server 通过 `notifications/claude/channel` 通知 Claude
4. Claude 在 daemon 中自动处理（code review、合并检查等）
5. 通过 Telegram `SendUserMessage(status: 'proactive')` 通知用户结果

---

### 3.10 Push Notification（推送通知）

OS 级推送通知工具，让 Claude 在后台完成工作后通知用户桌面。

```typescript
// src/tools.ts:45-49
const PushNotificationTool =
  feature('KAIROS') || feature('KAIROS_PUSH_NOTIFICATION')
    ? require('./tools/PushNotificationTool/PushNotificationTool.js')
        .PushNotificationTool
    : null
```

**当前状态：** 仅有 tools.ts 中的条件引用，实际模块尚未实现。

---

### 3.11 SendUserFile（文件分享）

让 Claude 向用户发送文件（而不仅仅是文本消息）。

```typescript
// src/tools/SendUserFileTool/prompt.ts:2
export const SEND_USER_FILE_TOOL_NAME = 'send_user_file'

// src/tools.ts:42-44
const SendUserFileTool = feature('KAIROS')
  ? require('./tools/SendUserFileTool/SendUserFileTool.js').SendUserFileTool
  : null
```

**当前状态：** 仅有 prompt.ts stub，实际 SendUserFileTool.ts 尚未实现。

---

## 4. 数据流

### 4.1 启动流程

```
用户执行 `claude assistant`
    │
    ├── (1) 解析参数
    ├── (2) Session 发现
    ├── (3) 认证
    ├── (4) 初始化 Viewer 状态
    ├── (5) 创建 RemoteSessionConfig
    ├── (6) 启动 REPL
    └── (7) useRemoteSession hook 激活
```

**(1) 解析参数** — 从 argv 中提取 sessionId：

```typescript
// src/main.tsx:554-562
type PendingAssistantChat = {
  sessionId?: string    // 用户指定的 session ID
  discover?: boolean    // 未指定时自动发现
}

// src/main.tsx:679-698
// `claude assistant [sessionId]` — stash and strip so the main
// command handler sees a clean argv
```

**(2) Session 发现** — 查找可用 session 或安装 daemon：

```typescript
// src/main.tsx:3265-3306
const { discoverAssistantSessions } =
  await import('./assistant/sessionDiscovery.js');

let targetSessionId = _pendingAssistantChat.sessionId;
if (!targetSessionId) {
  const sessions = await discoverAssistantSessions();

  if (sessions.length === 0) {
    // 无 session → 安装向导
    installedDir = await launchAssistantInstallWizard(root);
    // ↓ 安装完成后的提示
    return await exitWithMessage(root,
      `Assistant installed in ${installedDir}. The daemon is starting up`
      + ` — run \`claude assistant\` again in a few seconds to connect.`,
      { exitCode: 0 });
  }
  if (sessions.length === 1) {
    targetSessionId = sessions[0]!.id;  // 自动选择唯一 session
  } else {
    // 多个 session → 交互式选择器
    const picked = await launchAssistantSessionChooser(root, { sessions });
    targetSessionId = picked;
  }
}
```

Session 发现返回类型：

```typescript
// src/assistant/sessionDiscovery.ts:1-7
export type AssistantSession = {
  id: string
  name?: string
  status?: string
  createdAt?: string
  environment?: string
}
```

安装向导和选择器：

```typescript
// src/dialogLaunchers.tsx:73-89
export async function launchAssistantInstallWizard(root: Root): Promise<string | null> {
  const { NewInstallWizard, computeDefaultInstallDir } =
    await import('./commands/assistant/assistant.js');
  const defaultDir = await computeDefaultInstallDir();
  // ... race: resultPromise vs errorPromise（安装失败早退）
}

// src/dialogLaunchers.tsx:58-64
export async function launchAssistantSessionChooser(root: Root, props: {
  sessions: AssistantSession[];
}): Promise<string | null> {
  const { AssistantSessionChooser } =
    await import('./assistant/AssistantSessionChooser.js');
  return showSetupDialog<string | null>(root, done =>
    <AssistantSessionChooser
      sessions={props.sessions}
      onSelect={id => done(id)}
      onCancel={() => done(null)} />);
}
```

**(4) 初始化 Viewer 状态** — 设置只读模式和 Brief 模式：

```typescript
// src/main.tsx:3324-3333
setKairosActive(true);       // 激活 KAIROS 标志
setUserMsgOptIn(true);       // Brief mode opt-in
setIsRemoteMode(true);       // 禁止本地文件操作

const assistantInitialState: AppState = {
  ...initialState,
  isBriefOnly: true,         // 强制 Brief 模式
  kairosEnabled: false,      // viewer 端不运行 daemon 逻辑
  replBridgeEnabled: false   // viewer 端不启动 bridge
};
```

**(7) useRemoteSession hook** — 建立 WebSocket 连接：

```typescript
// src/hooks/useRemoteSession.ts:146-149
useEffect(() => {
  if (!config) { return }   // 非远程模式跳过
  // ... 创建 RemoteSessionManager，建立 WebSocket
}, [config])

// Echo 去重：viewer 发的消息会被 WS 回显，需要过滤
// src/hooks/useRemoteSession.ts:126-137
const sentUUIDsRef = useRef(new BoundedUUIDSet(50))
// "A single POST can echo MULTIPLE times with the same uuid:
//  the server may broadcast the POST directly to /subscribe,
//  AND the worker echoes it again on its write path."
```

### 4.2 用户主动交互

#### 路径 A：终端 Viewer → daemon

```
用户在终端输入 → HTTP POST → daemon worker → 模型处理 → WS 推送 → viewer 渲染
```

**Step 1-2: Viewer 发送消息**

```typescript
// src/remote/RemoteSessionManager.ts:219-242
async sendMessage(
  content: RemoteMessageContent,
  opts?: { uuid?: string },
): Promise<boolean> {
  logForDebugging(
    `[RemoteSessionManager] Sending message to session ${this.config.sessionId}`,
  )
  const success = await sendEventToRemoteSession(
    this.config.sessionId,
    content,
    opts,
  )
  return success
}
```

**Step 5-7: Viewer 接收回复（onMessage handler）**

```typescript
// src/hooks/useRemoteSession.ts:157-329（简化关键路径）

// Echo 过滤 — 防止用户看到自己发的消息被重复显示
// line 182-191:
if (message.type === 'human' && message.uuid) {
  if (sentUUIDsRef.current.has(message.uuid)) {
    return  // 跳过自己发的消息的 echo
  }
}

// SDK 消息转换 — 将远程 daemon 的消息格式化为本地可渲染
// line 273-278:
const converted = convertSDKMessage(message, {
  convertToolResults: true,       // 渲染 tool_result blocks
  convertUserTextMessages: true,  // 渲染 user messages
})
setMessages(prev => [...prev, ...converted])
```

#### 路径 B：手机 Channel → daemon

```
Telegram → MCP notification → XML wrap → enqueue → SleepTool 唤醒 → 模型处理
```

**Step 2: MCP server 发送 channel 通知**

MCP server 发出标准通知，包含消息内容和元数据：

```typescript
// src/services/mcp/channelNotification.ts:37-47 — 入站消息 schema
export const ChannelMessageNotificationSchema = lazySchema(() =>
  z.object({
    method: z.literal('notifications/claude/channel'),
    params: z.object({
      content: z.string(),
      // thread_id, user, 等任何 channel 想让模型看到的信息
      meta: z.record(z.string(), z.string()).optional(),
    }),
  }),
)
```

**Step 3: 六层 Gate 检查**

每个 channel server 必须通过全部检查：

```typescript
// src/services/mcp/channelNotification.ts:191-316（简化）
export function gateChannelServer(
  serverName: string,
  capabilities: ServerCapabilities | undefined,
  pluginSource: string | undefined,
): ChannelGateResult {
  // Gate 1: 必须声明 channel capability
  if (!capabilities?.experimental?.['claude/channel']) {
    return { action: 'skip', kind: 'capability' }
  }
  // Gate 2: GrowthBook 总开关
  if (!isChannelsEnabled()) {
    return { action: 'skip', kind: 'disabled' }
  }
  // Gate 3: 必须使用 OAuth（不支持 API key）
  if (!getClaudeAIOAuthTokens()?.accessToken) {
    return { action: 'skip', kind: 'auth' }
  }
  // Gate 4: Teams/Enterprise 需要组织管理员启用
  if (managed && policy?.channelsEnabled !== true) {
    return { action: 'skip', kind: 'policy' }
  }
  // Gate 5: 在 --channels 参数列表中
  const entry = findChannelEntry(serverName, getAllowedChannels())
  if (!entry) { return { action: 'skip', kind: 'session' } }
  // Gate 6: Plugin 白名单
  // ...
}
```

**Step 4: 包裹成 XML 送入模型上下文**

```typescript
// src/services/mcp/channelNotification.ts:106-116
function wrapChannelMessage(
  serverName: string,
  content: string,
  meta?: Record<string, string>,
): string {
  const attrs = Object.entries(meta ?? {})
    .filter(([k]) => SAFE_META_KEY.test(k))   // /^[a-zA-Z_][a-zA-Z0-9_]*$/
    .map(([k, v]) => ` ${k}="${escapeXmlAttr(v)}"`)
    .join('')
  return `<channel source="${escapeXmlAttr(serverName)}"${attrs}>\n${content}\n</channel>`
}

// 实际效果：
// <channel source="plugin:telegram:tg" user_id="123" thread_ts="456">
// 你好 Claude，PR 合完了吗？
// </channel>
```

**Step 5: 入队并唤醒 SleepTool**

```typescript
// src/services/mcp/useManageMCPConnections.ts:523-529
enqueue({
  mode: 'prompt',
  value: wrapChannelMessage(client.name, content, meta),
  priority: 'next',          // 下一轮就处理
  isMeta: true,
  origin: { kind: 'channel', server: client.name },
  skipSlashCommands: true,   // channel 消息不触发斜杠命令
})
// SleepTool 轮询 hasCommandsInQueue()，1 秒内唤醒模型
```

**Step 7: 模型回复**

模型看到 `<channel>` 标签后，回复会同时发到多个渠道（与现有 channel 行为一致）：
- `SendUserMessage` → 终端 viewer 看到回复
- Channel MCP tool（如 `send_message`）→ 回复到 Telegram

模型不是每条消息都回复——它会选择性响应有实质内容的消息，忽略无需处理的消息（如纯寒暄）。这与 `<channel>` tag 中携带的 `source` 和 meta 信息配合，让模型知道消息来自哪里、是否需要回应。

### 4.3 Claude 主动通知

```
<tick> 信号 → 模型检查工作 → 有事做则执行+通知 / 无事做则 Sleep
```

**Tick 信号：** 模型通过 `<tick>` 标签接收周期性唤醒：

```typescript
// src/constants/xml.ts:25
export const TICK_TAG = 'tick'
// 实际注入: <tick>10:42:15 AM</tick>
```

**系统 Prompt 指导模型如何处理 tick：**

```typescript
// src/constants/prompts.ts:867-908（getProactiveSection() 返回内容）

// ## Pacing
// "Each wake-up costs an API call, and the prompt cache expires after
//  5 minutes of inactivity. If there's nothing useful to do — call Sleep."

// ## What to do on subsequent wake-ups
// "Check for new work, process queued messages.
//  Act on anything useful, Sleep if nothing to do."

// ## Staying responsive
// "If user sends a message, drop what you're doing and respond."

// ## Bias toward action
// "Don't ask permission for normal work — if you can do it, do it.
//  Only ask when the cost of being wrong is high."
```

**终端焦点影响行为模式：**

```typescript
// src/constants/prompts.ts:912-916
// ## Terminal focus
// - **Unfocused**: The user is away. Lean heavily into autonomous action.
//                  Longer Sleep intervals are fine.
// - **Focused**: The user is watching. Be more collaborative —
//                acknowledge, ask, checkpoint more often.
```

**SleepTool Prompt — 模型的"休眠指令"：**

```typescript
// src/tools/SleepTool/prompt.ts:7-17
export const SLEEP_TOOL_PROMPT = `Wait for a specified duration.
The user can interrupt the sleep at any time.

You may receive <tick> prompts — these are periodic check-ins.
Look for useful work to do before sleeping.

You can call this concurrently with other tools — it won't interfere.
Prefer this over Bash(sleep ...) — it doesn't hold a shell process.`
// 关键: "Each wake-up costs an API call, but the prompt cache
//  expires after 5 minutes of inactivity"
```

**Proactive 输出示例：**

```typescript
// 模型调用 SendUserMessage tool：
{
  message: "Tests passed on feature branch. PR #42 ready for review.",
  status: "proactive"   // ← 标记为主动通知，不是回复用户
}
```

### 4.4 远程权限审批

```
拦截 → 生成确认码 → 发到手机 → 用户回复 → 匹配 pending → 放行
```

**Step 1: 生成 5 字母确认码**

```typescript
// src/services/mcp/channelPermissions.ts:112-128 — FNV-1a hash → base-25 编码
function hashToId(input: string): string {
  // FNV-1a → uint32, then base-25 encode. Not crypto, just a stable
  // short letters-only ID.
  let h = 0x811c9dc5       // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)   // FNV prime
  }
  h = h >>> 0
  let s = ''
  for (let i = 0; i < 5; i++) {
    s += ID_ALPHABET[h % 25]       // 25 字母，无 'l'
    h = Math.floor(h / 25)
  }
  return s
}

// src/services/mcp/channelPermissions.ts:140-152 — 脏词过滤 + 重试
export function shortRequestId(toolUseID: string): string {
  // 25^5 ≈ 9.8M 空间，碰撞需要 ~3K 同时 pending，不可能
  // Letters-only 让手机用户不用切换键盘模式
  let candidate = hashToId(toolUseID)
  for (let salt = 0; salt < 10; salt++) {
    if (!ID_AVOID_SUBSTRINGS.some(bad => candidate.includes(bad))) {
      return candidate   // 不包含脏词 → 直接用
    }
    candidate = hashToId(`${toolUseID}:${salt}`)  // 加盐重试
  }
  return candidate
}
```

**Step 2: 筛选支持 permission relay 的 channel server**

```typescript
// src/services/mcp/channelPermissions.ts:177-194
// "Three conditions, ALL required: connected + in the session's --channels
//  allowlist + declares BOTH capabilities. The second capability is the
//  server's explicit opt-in — a relay-only channel never becomes a
//  permission surface by accident."
export function filterPermissionRelayClients<T extends {...}>(
  clients: readonly T[],
  isInAllowlist: (name: string) => boolean,
): (T & { type: 'connected' })[] {
  return clients.filter(
    (c): c is T & { type: 'connected' } =>
      c.type === 'connected' &&
      isInAllowlist(c.name) &&
      // 必须同时声明两个 capability:
      c.capabilities?.experimental?.['claude/channel'] !== undefined &&
      c.capabilities?.experimental?.['claude/channel/permission'] !== undefined,
  )
}
```

**Step 3: 发送审批请求到手机**

```typescript
// src/services/mcp/channelNotification.ts:85-95
export type ChannelPermissionRequestParams = {
  request_id: string        // "tbxkq"
  tool_name: string         // "Bash"
  description: string       // "git push --force"
  input_preview: string     // 截断到 200 字符的 JSON 预览
}

// src/services/mcp/channelPermissions.ts:155-167
// "200 chars is roughly 3 lines on a narrow phone screen.
//  Full input is in the local terminal dialog; the channel
//  gets a summary so Write(5KB-file) doesn't flood your texts."
export function truncateForPreview(input: unknown): string {
  try {
    const s = jsonStringify(input)
    return s.length > 200 ? s.slice(0, 200) + '…' : s
  } catch {
    return '(unserializable)'
  }
}
```

用户在 Telegram 上看到：
```
🔒 Claude needs to run: git push --force
Reply: yes tbxkq or no tbxkq
```

**Step 4: 用户回复，server 解析**

```typescript
// src/services/mcp/channelPermissions.ts:75
// 回复格式正则 — 大小写不敏感（手机自动更正），字母表无 'l'
export const PERMISSION_REPLY_RE = /^\s*(y|yes|n|no)\s+([a-km-z]{5})\s*$/i
// 匹配: "yes tbxkq", "Y TBXKQ", "no abcde"
// 不匹配: "yes please", "ok tbxkq", 普通聊天内容
```

Server 解析成功后发出结构化事件：

```typescript
// src/services/mcp/channelNotification.ts:62-72
export const ChannelPermissionNotificationSchema = lazySchema(() =>
  z.object({
    method: z.literal('notifications/claude/channel/permission'),
    params: z.object({
      request_id: z.string(),                // "tbxkq"
      behavior: z.enum(['allow', 'deny']),   // "allow"
    }),
  }),
)
```

**Step 5: 匹配 pending 请求，放行**

```typescript
// src/services/mcp/channelPermissions.ts:209-240
export function createChannelPermissionCallbacks(): ChannelPermissionCallbacks {
  const pending = new Map<string, (response: ChannelPermissionResponse) => void>()

  return {
    // 注册等待中的权限请求
    onResponse(requestId, handler) {
      pending.set(requestId.toLowerCase(), handler)
      return () => { pending.delete(requestId.toLowerCase()) }
    },
    // 收到回复时解析
    resolve(requestId, behavior, fromServer) {
      const key = requestId.toLowerCase()
      const resolver = pending.get(key)
      if (!resolver) return false        // 无匹配 → 忽略
      pending.delete(key)                // 先删再调用，防重复触发
      resolver({ behavior, fromServer }) // → 权限通过/拒绝
      return true
    },
  }
}
```

### 4.5 记忆整理流程

```
启动 → gate 检查 → 时间+session 阈值 → 获取锁 → fork dream agent → 整理记忆
```

**Step 1: Gate 检查**

```typescript
// src/services/autoDream/autoDream.ts:95-100
function isGateOpen(): boolean {
  if (getKairosActive()) return false    // KAIROS 用另一套 disk-skill dream
  if (getIsRemoteMode()) return false    // 远程模式不触发
  if (!isAutoMemoryEnabled()) return false
  return isAutoDreamEnabled()
}
```

**Step 2-3: 双阈值检查**

```typescript
// src/services/autoDream/autoDream.ts:130-141 — 时间阈值
const hoursSince = (Date.now() - lastConsolidatedAt) / 3_600_000
if (!force && hoursSince < cfg.minHours) return   // 默认 24h

// src/services/autoDream/autoDream.ts:153-171 — session 数阈值
const sessionIds = await listSessionsTouchedSince(lastConsolidatedAt)
// 过滤掉当前 session
if (!force && sessionIds.length < cfg.minSessions) return  // 默认 5 个
```

**Step 4: 获取分布式锁**

```typescript
// src/services/autoDream/consolidationLock.ts:46
tryAcquireConsolidationLock(): Promise<number | null>
// 写入 PID 到 .consolidate-lock
// 检查 holder 进程是否存活（kill(pid, 0)）
// 死进程 → 回收锁
// 返回 priorMtime（kill 时用于回滚）
```

**Step 6: Fork 子 agent 执行 dream prompt**
    │   [consolidationPrompt.ts:15-64]
    │   Phase 1: Orient (ls memory dir, read MEMORY.md)
    │   Phase 2: Gather (scan logs, transcripts)
    │   Phase 3: Consolidate (write/update memory files)
    │   Phase 4: Prune (keep index concise)
    │
    ├── (7) 进度监控 [autoDream.ts:281-313]
    │   makeDreamProgressWatcher() 追踪 tool_use 和 text blocks
    │   phase: 'starting' → 'updating'（首次 Edit/Write）
    │
    ├── (8a) 成功 → completeDreamTask() [DreamTask.ts:106]
    │   recordConsolidation() 更新锁 mtime
    │
    └── (8b) 失败/kill → failDreamTask() [DreamTask.ts:122]
        rollbackConsolidationLock(priorMtime)
        （回滚 mtime，下次还会触发）
```

---

## 5. Feature Flag 体系

KAIROS 使用两层 flag 控制：

### 编译时 Flag（`bun:bundle` 宏）

在构建时决定代码是否包含在二进制中。npm 公开版本中以下 flag 均编译为 **false**，相关代码被 tree-shake。

| Flag | 引用数 | 功能 |
|------|--------|------|
| `KAIROS` | 154 | 主开关：assistant mode、team leadership |
| `KAIROS_BRIEF` | 39 | Brief mode 独立发布路径 |
| `KAIROS_CHANNELS` | 19 | Channel 系统独立发布路径 |
| `KAIROS_DREAM` | 1 | Dream 独立发布路径（但 auto-dream 无门控） |
| `KAIROS_GITHUB_WEBHOOKS` | 3 | GitHub PR/Issue 订阅 |
| `KAIROS_PUSH_NOTIFICATION` | 4 | OS 推送通知 |
| `PROACTIVE` | 37 | 自主行动模式 |
| `DAEMON` | 3 | 本地守护进程 |

### 运行时 Flag（GrowthBook `tengu_*`）

通过远程配置服务动态控制，可按用户/组织逐步灰度。

| Flag | 默认值 | 功能 | 引用 |
|------|--------|------|------|
| `tengu_kairos` | gate | KAIROS 主 entitlement | `assistant/gate.ts` |
| `tengu_kairos_brief` | false | Brief mode entitlement（5 分钟 TTL） | `BriefTool.ts:88` |
| `tengu_kairos_brief_config` | — | Brief 配置（enable_slash_command） | `commands/brief.ts` |
| `tengu_harbor` | false | Channel 系统总开关 | `channelAllowlist.ts:51` |
| `tengu_harbor_ledger` | [] | 允许的 channel plugin 白名单 | `channelAllowlist.ts:37` |
| `tengu_harbor_permissions` | false | Channel 权限审批 relay | `channelPermissions.ts:36` |
| `tengu_onyx_plover` | null | Auto-dream 配置（minHours, minSessions） | `autoDream/config.ts:17` |

### KAIROS Gate 检查流程

```typescript
// src/main.tsx:1048-1087（简化）
if (feature('KAIROS') && options.assistant && assistantModule) {
  // 1. 信任对话框检查
  if (!checkHasTrustDialogAccepted()) { /* warn */ }
  else {
    // 2. 异步 gate 检查（带缓存）
    kairosEnabled = assistantModule.isAssistantForced() ||
      (await kairosGate.isKairosEnabled());
    // 3. 如果通过
    if (kairosEnabled) {
      opts.brief = true;
      setKairosActive(true);
      assistantTeamContext = await assistantModule.initializeAssistantTeam();
    }
  }
}
```

---

## 6. 使用场景

### 场景 1：长时间重构

**痛点：** 现在让 Claude 重构大模块需要一直开着终端盯着，关掉就断。

**KAIROS：**
1. `claude assistant` 连接到后台 daemon
2. 告诉 Claude："把所有 REST endpoint 迁移到 GraphQL"
3. 关掉笔记本去吃饭
4. Claude 在 daemon 中持续工作：
   - Proactive mode 自动拆解任务
   - Agent Leadership spawn 多个 teammate 并行处理
5. 遇到设计决策 → Telegram 通知你:
   `"User 模型的 GraphQL schema 有两种方案，A 用 relay connection，B 用 offset pagination。你选哪个？"`
6. 你在手机回复 "A"
7. 需要 force push → Telegram 审批:
   `"Reply: yes abcde or no abcde"`
8. 你回复 "yes abcde"
9. 回到电脑，`claude assistant` 重连，看到完整执行历史

### 场景 2：CI 监控和自动修复

**痛点：** CI 失败需要人工检查和修复。

**KAIROS + GitHub Webhooks（计划中）：**
1. Claude daemon 通过 `/subscribe-pr` 订阅 repo
2. GitHub Webhook 推送 CI failure 事件
3. Channel notification 唤醒 Claude
4. Claude 自主分析失败原因、修复代码
5. 需要 push → Telegram 审批
6. PR 更新 → Telegram 通知你：`"CI fixed: type error in user.ts:42, pushed fix"`

### 场景 3：跨时区团队协作

**痛点：** 你下班后同事提了 PR 需要 review，要等你第二天。

**KAIROS + GitHub Webhooks + Channels：**
1. Claude daemon 持续运行
2. 同事提 PR → GitHub Webhook 通知 Claude
3. Claude 自动 review，发现潜在问题
4. 通过 Slack channel 通知团队频道：
   `"Review of PR #42: found potential SQL injection in query builder. See line 87."`
5. 通过 Telegram 通知你（status: proactive）：
   `"PR #42 from Alice has a security issue. I left a comment. Want me to suggest a fix?"`

### 场景 4：日常助理

**痛点：** 每次新会话都要重新解释项目背景。

**KAIROS + Dream：**
1. Claude daemon 持续运行，积累上下文
2. 空闲时自动 dream：整理项目知识到记忆文件
3. 早上你打开终端：`claude assistant`
4. Claude 已经知道你昨天在做什么、项目状态如何
5. 主动汇报：`"昨晚 CI 全绿。你今天要继续做 auth 模块吗？"`

### 场景 5：多任务并行

**痛点：** 一个 Claude 只能串行干活。

**KAIROS + Agent Leadership：**
1. 你说："加一个支付功能"
2. 主 agent 拆解任务，spawn teammates：
   - Teammate A：写后端 API（`Agent(name: "backend")`)
   - Teammate B：写前端组件（`Agent(name: "frontend")`）
   - Teammate C：写集成测试（`Agent(name: "tests")`）
3. 主 agent 协调合并，处理冲突
4. 通过 Brief tool 定期汇报进度
5. 终端 viewer 显示后台任务数量：`"3 background tasks running"`

---

## 7. 与现有模式的对比

| 维度 | 现有模式 | KAIROS |
|------|---------|--------|
| **运行位置** | 终端前台进程 | 本地 daemon 后台进程 |
| **生命周期** | 关终端 = 结束 | daemon 持续运行，viewer 随时连断 |
| **交互方式** | 终端一问一答 | 终端 viewer + Telegram/Slack/iMessage |
| **主动性** | 被动等待输入 | Proactive mode 自主行动 |
| **输出格式** | 原始文本流 | SendUserMessage 结构化消息 |
| **并行能力** | 单 agent | 主 agent + 多 teammate |
| **权限审批** | 终端弹窗 | 终端 + 手机远程审批 |
| **记忆** | CLAUDE.md + memory dir | Dream 自动整理 + 持久上下文 |
| **定时任务** | 无 | Cron scheduler（daemon 路径） |
| **GitHub** | 手动操作 | Webhook 订阅 + 自动响应 |

---

## 8. 子系统独立性分析

```
           ┌──────────────────────────────────┐
           │     KAIROS 独占（需要 daemon）     │
           │                                  │
           │  Agent Leadership (团队协调)       │
           │  Channels (多渠道接入)             │
           │  Channel Permission (远程审批)     │
           │  GitHub Webhooks (PR/Issue 订阅)  │
           │  Push Notification (推送通知)      │
           │  SendUserFile (文件分享)           │
           │  Proactive Mode (自主行动)         │
           │  Cron Scheduler daemon 路径       │
           │                                  │
           └──────────────────────────────────┘

           ┌──────────────────────────────────┐
           │  为 KAIROS 设计但可独立使用        │
           │                                  │
           │  Brief Mode                      │
           │  ├── 本地可用: /brief, --brief    │
           │  ├── GB gate: tengu_kairos_brief  │
           │  └── 在 KAIROS 中自动激活         │
           │                                  │
           └──────────────────────────────────┘

           ┌──────────────────────────────────┐
           │  完全独立（KAIROS 关闭时才运行）    │
           │                                  │
           │  Auto-Dream                      │
           │  ├── 无 feature() 门控            │
           │  ├── GB gate: tengu_onyx_plover   │
           │  └── getKairosActive() → 关闭     │
           │      （KAIROS 用 disk-skill dream）│
           │                                  │
           │  Session Memory                  │
           │  ├── 无 feature() 门控            │
           │  └── GB gate: tengu_session_memory│
           │                                  │
           └──────────────────────────────────┘
```

**核心判断依据：** 没有 daemon 持续运行，Channels / GitHub Webhooks / Push Notification / Proactive 都失去意义——你开着终端时直接打字就行，不需要 Telegram；你关了终端 Claude 就停了，没人接收 Webhook。daemon 是这些功能的**存在前提**。

---

## 9. 行业背景：OpenClaw 与 KAIROS 的竞争叙事

### 9.1 OpenClaw 是什么

[OpenClaw](https://github.com/openclaw/openclaw) 是奥地利开发者 **Peter Steinberger** 创建的开源自主 AI Agent。核心理念：**消息平台即界面**——通过 WhatsApp、Telegram、Slack、Discord、iMessage、WeChat 等 20+ 渠道与 AI 交互，AI 自主执行多步骤任务。

GitHub 30 万+ stars（超过 React 和 Linux），是 2026 年初最火的开源 AI 项目。

### 9.2 时间线

```
2025-11       Steinberger 以 "Clawdbot" 名称发布
2025-12       项目开始走红
2026-01-27    Anthropic 对 Clawdbot 发起商标投诉（名字太像 Claude）
2026-01-30    更名为 "OpenClaw"
2026-01 底    爆火，GitHub stars 飙升

2026-02-14    Steinberger 宣布加入 OpenAI（acqui-hire）
2026-02-14    Claude Code v2.1.41 发布 Agent teams ← 同一天
2026-02-15    Sam Altman 公开宣布收购

2026-02-24    Claude Code v2.1.51 — Bridge/Remote Control 首发
2026-02-26    Claude Code v2.1.59 — Auto-memory /memory 首发
2026-03-05    Claude Code v2.1.69 — VSCode Remote Control
2026-03-07    Claude Code v2.1.71 — /loop + Cron 定时任务
2026-03-17    Claude Code v2.1.77 — SendMessage auto-resume agents
2026-03-19    Claude Code v2.1.80 — --channels research preview
2026-03-20    Claude Code v2.1.81 — --channels permission relay
2026-03-26    Claude Code v2.1.84 — allowedChannelPlugins 组织管控
```

**从 OpenClaw 爆火到 Anthropic 密集发布基础设施，间隔不到两周。**

### 9.3 两条路线的对比

| 维度 | OpenClaw | KAIROS |
|------|----------|--------|
| **核心理念** | 消息平台即界面 | CLI daemon + 消息平台为辅助渠道 |
| **渠道** | 20+ 内置渠道 | MCP plugin 架构，可扩展 |
| **运行方式** | 独立 agent，消息平台是唯一入口 | 本地 daemon，终端 viewer + 消息平台 |
| **审批机制** | — | 5 字母确认码 + permission relay |
| **代码能力** | 通用任务自动化 | 专精软件开发（Bash/Edit/Grep 完整工具链） |
| **团队协作** | 单 agent | 主 agent + 多 teammate 并行 |
| **记忆系统** | — | Auto-Dream + Session Memory + Team Memory |
| **开源** | 完全开源 | 编译时门控，核心代码被剥离 |
| **当前状态** | 移交开源基金会，Steinberger 加入 OpenAI | 源码中完整架构，未发布 |

### 9.4 分析

1. **KAIROS 不是对 OpenClaw 的仓促应对。** Bridge、Channels、Permission Protocol 这种级别的架构设计需要数月开发。KAIROS 内部开发的启动时间远早于 OpenClaw 爆火。

2. **OpenClaw 可能加速了发布节奏。** 从 2026-02-14（OpenAI 收购 OpenClaw）到 2026-03-19（`--channels` 发布），Anthropic 在一个月内密集发布了所有核心基础设施。Agent teams 发布与 OpenAI acqui-hire 同日，不太可能是巧合。

3. **Anthropic 的策略不同于 OpenClaw。** OpenClaw 是"消息平台优先"——AI 住在你的 Telegram 里。KAIROS 是"开发者工具 + 消息平台"——AI 住在你的电脑上（daemon），消息平台是通知和审批的辅助渠道。这反映了 Anthropic 在开发者工具赛道的定位。

4. **殊途同归。** 两者都指向同一个方向：**AI 不再是你问它才动的工具，而是一个持续运行、主动找你的助理。** 区别只在于入口和侧重：OpenClaw 侧重通用任务 + 消息平台，KAIROS 侧重软件开发 + 本地执行。

5. **商标投诉的细节值得注意。** Anthropic 在 2026-01-27 对 "Clawdbot" 发起商标投诉（因名称与 Claude 相似），说明 Anthropic 在 OpenClaw 爆火的第一时间就高度关注了这个项目。

**Sources:**
- [OpenClaw GitHub](https://github.com/openclaw/openclaw)
- [OpenClaw — Wikipedia](https://en.wikipedia.org/wiki/OpenClaw)
- [OpenClaw creator joins OpenAI — TechCrunch](https://techcrunch.com/2026/02/15/openclaw-creator-peter-steinberger-joins-openai/)
- [Sam Altman 公告](https://x.com/sama/status/2023150230905159801)
- [OpenAI Acquires OpenClaw — VentureBeat](https://venturebeat.com/technology/openais-acquisition-of-openclaw-signals-the-beginning-of-the-end-of-the/)
- [OpenClaw 深度解析 — KDnuggets](https://www.kdnuggets.com/openclaw-explained-the-free-ai-agent-tool-going-viral-already-in-2026)
- [Peter Steinberger 博客](https://steipete.me/posts/2026/openclaw)

---

## 10. 功能发布时间线（Changelog 考古）

基于 [Claude Code 官方 Changelog](https://code.claude.com/docs/en/changelog)，以下是所有与 KAIROS 相关的已发布功能，按时间排序：

### 2025 年（基础原语期）

| 版本 | 功能 | KAIROS 中的角色 |
|------|------|----------------|
| v0.2.93 | `--continue` / `--resume` | 会话恢复 → viewer 重连基础 |
| v0.2.105 | Web search | 外部信息获取 → 自主工作能力 |
| v0.2.108 | 实时消息队列（边工作边收消息） | 消息队列 → channel 入站消息原型 |
| v1.0.0 | Claude Code GA | 基础版本 |
| v1.0.11 | Claude Pro 订阅支持 | OAuth 认证体系 → bridge/channels 授权基础 |
| v1.0.23 | TypeScript/Python SDK | SDK → daemon worker 编程接口 |
| v1.0.27 | MCP OAuth + /resume | MCP 认证 → channel server 授权 |

### 2026 年 2 月（基础设施密集发布期）

| 日期 | 版本 | 功能 | KAIROS 中的角色 |
|------|------|------|----------------|
| 02-14 | v2.1.41 | Agent teams / Teammates | Agent Leadership 前身 |
| 02-19 | v2.1.49 | `--worktree` flag, agent `background: true` | agent 隔离执行, 后台运行 |
| 02-20 | v2.1.50 | WorktreeCreate/Remove hooks, `claude agents` CLI | daemon 环境管理, agent 命令 |
| 02-24 | v2.1.51 | `claude remote-control` 子命令 | **Bridge/CCR 首发** |
| 02-25 | v2.1.58 | Remote Control expansion | Bridge 扩展 |
| 02-26 | v2.1.59 | Auto-memory `/memory`, multi-agent memory | **记忆系统首发** |
| 02-28 | v2.1.63 | 大量 memory leak fixes | 长时间运行稳定性 |

### 2026 年 3 月（外部触达 + 自动化期）

| 日期 | 版本 | 功能 | KAIROS 中的角色 |
|------|------|------|----------------|
| 03-05 | v2.1.69 | VSCode Remote Control, voice 10 languages | **第二个 viewer 载体** |
| 03-07 | v2.1.71 | `/loop` recurring commands, cron scheduling | **定时任务首发** |
| 03-12 | v2.1.74 | `autoMemoryDirectory` setting | 记忆目录可配置 |
| 03-13 | v2.1.75 | 1M context Opus, memory timestamps | daemon 超大 context |
| 03-14 | v2.1.76 | MCP elicitation, `PostCompact` hook, `-n` session name | channel 交互原语, 压缩后钩子 |
| 03-17 | v2.1.77 | `SendMessage` auto-resume agents | **agent 自动恢复** |
| 03-17 | v2.1.78 | agent `effort`/`maxTurns` frontmatter | agent 自主运行参数 |
| 03-19 | v2.1.80 | `--channels` research preview | **⭐ Channels 首发** |
| 03-20 | v2.1.81 | `--channels` permission relay, `--bare` flag | **⭐ 远程审批首发** |
| 03-25 | v2.1.83 | `CwdChanged`/`FileChanged` hooks, agents `initialPrompt` | daemon 监控 + worker 初始化 |
| 03-26 | v2.1.84 | `allowedChannelPlugins` managed setting, idle-return 75min | **⭐ 组织级 channel 管控** |
| 03-26 | v2.1.85 | `PreToolUse` hooks satisfy `AskUserQuestion` | 自动化审批 |
| 04-01 | v2.1.89 | `defer` permission, `/buddy` easter egg | daemon 暂停/恢复审批 |

### 未发布

| 功能 | 源码位置 | 状态 |
|------|---------|------|
| `claude daemon` | `src/daemon/main.ts` | stub |
| `claude assistant [sessionId]` | `src/main.tsx:3260` | stub（session discovery/gate） |
| Agent Leadership (initializeAssistantTeam) | `src/assistant/index.ts` | stub |
| Proactive Mode (自主行动) | `src/proactive/index.ts` | stub |
| GitHub Webhooks (SubscribePR) | `src/tools.ts:50-52` | 仅条件 require |
| Push Notification | `src/tools.ts:45-49` | 仅条件 require |
| SendUserFile | `src/tools/SendUserFileTool/prompt.ts` | 仅 prompt stub |
| Auto-Dream (KAIROS 版 disk-skill) | — | 代码未找到 |

### 演进规律

```
2025:        基础原语（resume, compact, memory, SDK, OAuth）
2026-02 上:  OpenClaw 爆火 + OpenAI acqui-hire
2026-02 中:  多 agent + Bridge 密集发布
2026-02 下:  记忆系统 + 稳定性
2026-03 上:  多 viewer + 定时任务
2026-03 中:  agent 自治参数
2026-03 下:  Channels + Permission relay + 组织管控
未来:        daemon + assistant = KAIROS 正式发布
```

每一步都是独立的、对当前用户有价值的 feature。没有哪个版本"突然加了一大堆 KAIROS 代码"——它是一砖一瓦搭起来的。**用户已经在用的每一个小功能，都是这个更大愿景的一块拼图。**

---

*文档生成时间：2026-04-02*
*基于 Claude Code 源码 commit: `0a14432`*
*Changelog 数据来源: https://code.claude.com/docs/en/changelog*
*基于 Claude Code 源码 commit: `0a14432`*
