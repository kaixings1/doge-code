---
name: claude-mem-openclaw
description: Claude-Mem OpenClaw 插件安装指南 — 在 OpenClaw 网关上配置 claude-mem 插件，让 agent 获得跨会话的持久记忆，并可选推送实时观察流到消息频道。
---

# Claude-Mem OpenClaw 插件 —— 安装指南

本指南逐步讲解如何在 OpenClaw 网关上配置 claude-mem 插件。完成后，你的 agent 将通过系统提示词上下文注入获得跨会话的持久记忆，并可选地把实时观察流推送到某个消息频道。

## 快速安装（推荐）

运行下面这一行命令即可自动安装全部内容：

```bash
curl -fsSL https://install.cmem.ai/openclaw.sh | bash
```

安装脚本会以交互方式处理依赖检查（Bun、uv）、插件安装、记忆槽配置、AI 提供方设置、worker 启动，以及可选的观察流配置。

### 带参数安装

预先选定 AI 提供方和 API 密钥，即可跳过交互式提示：

```bash
curl -fsSL https://install.cmem.ai/openclaw.sh | bash -s -- --provider=gemini --api-key=YOUR_KEY
```

若要完全无人值守安装（默认使用 Claude Max Plan，跳过观察流）：

```bash
curl -fsSL https://install.cmem.ai/openclaw.sh | bash -s -- --non-interactive
```

若要升级既有安装（保留设置，更新插件）：

```bash
curl -fsSL https://install.cmem.ai/openclaw.sh | bash -s -- --upgrade
```

安装完成后，直接跳到[第 4 步：重启网关并验证](#step-4-restart-the-gateway-and-verify)，确认一切正常工作。

---

## 手动安装

以下步骤适用于不想使用自动安装脚本，或需要逐个排查某些步骤的场景。

### 第 1 步：克隆 Claude-Mem 仓库

首先把 claude-mem 仓库克隆到你的 OpenClaw 网关可访问的位置。这会给你 worker 服务的源码和插件代码。

```bash
cd /opt  # 或者任何你想存放它的位置
git clone https://github.com/thedotmack/claude-mem.git
cd claude-mem
npm install
npm run build
```

worker 服务需要安装 **bun**。如果你还没有：

```bash
curl -fsSL https://bun.sh/install | bash
```

### 第 2 步：让 Worker 跑起来

claude-mem worker 是一个监听 37777 端口的 HTTP 服务。它存储观察记录、生成摘要，并提供上下文时间线。插件通过 HTTP 与它通信 —— worker 跑在哪里并不重要，只要能在 localhost:37777 上访问到即可。

#### 检查它是否已在运行

若这台机器上也装了带 claude-mem 的 Claude Code，worker 可能已经在运行：

```bash
curl http://localhost:37777/api/health
```

**返回 `{"status":"ok"}`？** 说明 worker 已在运行。跳到第 3 步。

**连接被拒绝或无响应？** 说明 worker 没在跑。继续往下看。

#### 若 Claude Code 已安装 claude-mem

若 claude-mem 已作为 Claude Code 插件安装（位于 `~/.claude/plugins/marketplaces/thedotmack/`），从该安装启动 worker：

```bash
cd ~/.claude/plugins/marketplaces/thedotmack
npm run worker:restart
```

验证：
```bash
curl http://localhost:37777/api/health
```

**返回 `{"status":"ok"}`？** 那就就绪了。跳到第 3 步。

**还是不行？** 用 `npm run worker:status` 查看错误详情，或检查 bun 是否已安装并在 PATH 中。

#### 若没有 Claude Code 安装

从克隆的仓库运行 worker：

```bash
cd /opt/claude-mem  # 你把它克隆到的位置
npm run worker:start
```

验证：
```bash
curl http://localhost:37777/api/health
```

**返回 `{"status":"ok"}`？** 那就就绪了。进入第 3 步。

**还是不行？** 排查步骤：
- 检查 bun 是否已安装：`bun --version`
- 检查 worker 状态：`npm run worker:status`
- 检查是否有别的程序占用了 37777 端口：`lsof -i :37777`
- 查看日志：`npm run worker:logs`（如果支持）
- 直接运行它以查看报错：`bun plugin/scripts/worker-service.cjs start`

### 第 3 步：把插件加进你的网关

把 `claude-mem` 插件加入你的 OpenClaw 网关配置：

```json
{
  "plugins": {
    "claude-mem": {
      "enabled": true,
      "config": {
        "project": "my-project",
        "syncMemoryFile": true,
        "workerPort": 37777
      }
    }
  }
}
```

#### 配置字段说明

- **`project`**（string，默认：`"openclaw"`）—— 在记忆数据库中限定所有观察记录范围的项目名。每个网关/用例使用唯一名称，以免观察记录混淆。例如，若该网关运行一个编码机器人，就用 `"coding-bot"`。

- **`syncMemoryFile`**（boolean，默认：`true`）—— 启用后，插件通过 `before_prompt_build` 钩子把观察时间线注入每个 agent 的系统提示词。这让 agent 无需写入 MEMORY.md 就能获得跨会话上下文。设为 `false` 可完全禁用上下文注入（观察记录仍会保存）。

- **`syncMemoryFileExclude`**（string[]，默认：`[]`）—— 被排除在自动上下文注入之外的 agent ID。适用于那些自行管理记忆的 agent。被排除的 agent 的观察记录仍会保存。

- **`workerPort`**（number，默认：`37777`）—— claude-mem worker 服务监听的端口。只有当你把 worker 配置为使用其他端口时才需要改它。

---

## 第 4 步：重启网关并验证

重启你的 OpenClaw 网关，让它加载新的插件配置。重启后，在网关日志中检查是否有：

```
[claude-mem] OpenClaw plugin loaded — v1.0.0 (worker: 127.0.0.1:37777)
```

若看到这行，说明插件已加载。你也可以在任何 OpenClaw 会话中运行 `/claude_mem_status` 来验证：

```
Claude-Mem Worker Status
Status: ok
Port: 37777
Active sessions: 0
Observation feed: disconnected
```

观察流显示 `disconnected` 是因为我们还没配置它。这是下一步。

## 第 5 步：验证观察记录正在被保存

让某个 agent 做些工作。插件会通过以下 OpenClaw 事件自动记录观察：

1. **`before_agent_start`** —— agent 启动时初始化一个 claude-mem 会话
2. **`before_prompt_build`** —— 把观察时间线注入 agent 的系统提示词（缓存 60 秒）
3. **`tool_result_persist`** —— 把每次工具调用（Read、Write、Bash 等）记为一条观察
4. **`agent_end`** —— 为会话生成摘要并标记完成

这一切都是自动发生的，无需额外配置。

要验证它是否工作，打开 worker 的查看界面 http://localhost:37777，在 agent 运行后查看观察记录是否出现。

你也可以打开 worker 的查看界面 http://localhost:37777，实时查看观察记录的出现。

## 第 6 步：设置观察流（推送到频道）

观察流连接到 claude-mem worker 的 SSE（Server-Sent Events）流，并把每条新观察实时转发到某个消息频道。你的 agent 在学习，而你在 Telegram/Discord/Slack 等频道中看着它们学习。

### 你会看到什么

每当 claude-mem 根据你的 agent 的工具调用创建一条新观察，你的频道中就会出现这样一条消息：

```
🧠 Claude-Mem 观察
**为 API 客户端实现了重试逻辑**
加入了指数退避与可配置的最大重试次数，以应对瞬时故障
```

### 选择你的频道

你需要两样东西：
- **频道类型** —— 必须匹配你 OpenClaw 网关上已在运行的某个频道插件
- **目标 ID** —— 消息要发往的会话/频道/用户 ID

#### Telegram

频道类型：`telegram`

查找你的会话 ID：
1. 在 Telegram 上给 @userinfobot 发消息 —— https://t.me/userinfobot
2. 它会回复你的数字会话 ID（例如 `123456789`）
3. 群聊的 ID 是负数（例如 `-1001234567890`）

```json
"observationFeed": {
  "enabled": true,
  "channel": "telegram",
  "to": "123456789"
}
```

#### Discord

频道类型：`discord`

查找你的频道 ID：
1. 在 Discord 中启用开发者模式：设置 → 高级 → 开发者模式
2. 右键点击目标频道 → 复制频道 ID

```json
"observationFeed": {
  "enabled": true,
  "channel": "discord",
  "to": "1234567890123456789"
}
```

#### Slack

频道类型：`slack`

查找你的频道 ID（不是频道名称）：
1. 在 Slack 中打开该频道
2. 点击顶部的频道名称
3. 滚到频道详情底部 —— ID 形如 `C01ABC2DEFG`

```json
"observationFeed": {
  "enabled": true,
  "channel": "slack",
  "to": "C01ABC2DEFG"
}
```

#### Signal

频道类型：`signal`

使用你 OpenClaw 网关的 Signal 插件中配置的手机号或群组 ID。

```json
"observationFeed": {
  "enabled": true,
  "channel": "signal",
  "to": "+1234567890"
}
```

#### WhatsApp

频道类型：`whatsapp`

使用你 OpenClaw 网关的 WhatsApp 插件中配置的手机号或群组 JID。

```json
"observationFeed": {
  "enabled": true,
  "channel": "whatsapp",
  "to": "+1234567890"
}
```

#### LINE

频道类型：`line`

使用来自 LINE Developer Console 的用户 ID 或群组 ID。

```json
"observationFeed": {
  "enabled": true,
  "channel": "line",
  "to": "U1234567890abcdef"
}
```

### 把它加进你的配置

你完整的插件配置现在应该像这样（以 Telegram 为例）：

```json
{
  "plugins": {
    "claude-mem": {
      "enabled": true,
      "config": {
        "project": "my-project",
        "syncMemoryFile": true,
        "workerPort": 37777,
        "observationFeed": {
          "enabled": true,
          "channel": "telegram",
          "to": "123456789"
        }
      }
    }
  }
}
```

### 重启并验证

重启网关。按顺序检查日志中是否出现这三行：

```
[claude-mem] Observation feed starting — channel: telegram, target: 123456789
[claude-mem] Connecting to SSE stream at http://localhost:37777/stream
[claude-mem] Connected to SSE stream
```

然后在任意 OpenClaw 会话中运行 `/claude_mem_feed`：

```
Claude-Mem Observation Feed
Enabled: yes
Channel: telegram
Target: 123456789
Connection: connected
```

若 `Connection` 显示 `connected`，就大功告成了。让某个 agent 做些工作，然后看着观察记录流进你的频道。

## 命令参考

该插件注册了两条命令：

### /claude_mem_status

报告 worker 健康状况与当前会话状态。

```
/claude_mem_status
```

输出：
```
Claude-Mem Worker Status
Status: ok
Port: 37777
Active sessions: 2
Observation feed: connected
```

### /claude_mem_feed

显示观察流状态。接受可选的 `on`/`off` 参数。

```
/claude_mem_feed          — 显示状态
/claude_mem_feed on       — 请求启用（需更新配置以持久生效）
/claude_mem_feed off      — 请求禁用（需更新配置以持久生效）
```

## 整体工作原理

```
OpenClaw 网关
  │
  ├── before_agent_start ───→ 初始化会话
  ├── before_prompt_build ──→ 把上下文注入系统提示词
  ├── tool_result_persist ──→ 记录观察
  ├── agent_end ────────────→ 生成摘要 + 完成会话
  └── gateway_start ────────→ 重置会话跟踪 + 上下文缓存
                    │
                    ▼
         Claude-Mem Worker (localhost:37777)
           ├── POST /api/sessions/init
           ├── POST /api/sessions/observations
           ├── POST /api/sessions/summarize
           ├── POST /api/sessions/complete
           ├── GET  /api/context/inject ──→ 系统提示词上下文
           └── GET  /stream ─────────────→ SSE → 消息频道
```

### 系统提示词上下文注入

插件通过 `before_prompt_build` 钩子把观察时间线注入每个 agent 的系统提示词。内容来自 worker 的 `GET /api/context/inject` 端点。每个项目的上下文缓存 60 秒，以避免每轮 LLM 调用都重新拉取。网关重启时缓存会被清空。

这样 MEMORY.md 仍由 agent 自己掌控，用于沉淀长期记忆；而观察时间线则通过系统提示词传递。

### 观察记录

每次工具调用（Read、Write、Bash 等）都会作为一条观察发送到 claude-mem worker。worker 的 AI agent 会把它处理成包含标题、副标题、事实、概念和叙述的结构化观察。以 `memory_` 为前缀的工具会被跳过，以避免递归记录。

### 会话生命周期

- **`before_agent_start`** —— 在 worker 中创建一个会话。
- **`before_prompt_build`** —— 拉取观察时间线并作为 `appendSystemContext` 返回。缓存 60 秒。
- **`tool_result_persist`** —— 记录观察（发后不管）。工具响应截断至 1000 字符。
- **`agent_end`** —— 发送最后一条助手消息用于摘要，然后结束会话。两者都是发后不管。
- **`gateway_start`** —— 清空所有会话跟踪（会话 ID、上下文缓存），让 agent 从干净状态开始。

### 观察流

一个后台服务连接到 worker 的 SSE 流，并把 `new_observation` 事件转发到已配置的消息频道。连接会自动重连，采用指数退避（1s → 最大 30s）。

## 故障排查

| 问题 | 检查什么 |
|---------|---------------|
| Worker 健康检查失败 | bun 装了吗？（`bun --version`）。37777 端口被别的进程占用了吗？（`lsof -i :37777`）。试试直接运行：`bun plugin/scripts/worker-service.cjs start` |
| 从 Claude Code 安装启动的 worker 无响应 | 检查 `cd ~/.claude/plugins/marketplaces/thedotmack && npm run worker:status`。可能需要 `npm run worker:restart`。 |
| 从克隆仓库启动的 worker 无响应 | 检查 `cd /path/to/claude-mem && npm run worker:status`。确保你先跑过 `npm install && npm run build`。 |
| agent 系统提示词中没有上下文 | 检查 `syncMemoryFile` 是否被设为 `false`。检查该 agent 的 ID 是否在 `syncMemoryFileExclude` 中。确认 worker 在运行且有观察记录。 |
| 观察记录未被保存 | 检查网关日志中的 `[claude-mem]` 消息。worker 必须正在运行且能在 localhost:37777 上访问到。 |
| 观察流显示 `disconnected` | worker 的 `/stream` 端点不可达。检查 `workerPort` 是否与 worker 实际端口一致。 |
| 观察流显示 `reconnecting` | 连接断开。插件会自动重连 —— 最多等 30 秒。 |
| 日志中出现 `Unknown channel type` | 该频道插件（例如 telegram）未在你的网关上加载。确保该频道已配置并在运行。 |
| 日志中出现 `Observation feed disabled` | 在配置中把 `observationFeed.enabled` 设为 `true`。 |
| 日志中出现 `Observation feed misconfigured` | `observationFeed.channel` 和 `observationFeed.to` 都是必填项。 |
| 显示 `connected` 但频道里没有消息 | 观察流只发送已处理的观察，而非原始工具调用。存在 1-2 秒延迟。确认 worker 确实在处理观察记录（查看 http://localhost:37777）。 |

## 完整配置参考

```json
{
  "plugins": {
    "claude-mem": {
      "enabled": true,
      "config": {
        "project": "openclaw",
        "syncMemoryFile": true,
        "workerPort": 37777,
        "observationFeed": {
          "enabled": false,
          "channel": "telegram",
          "to": "123456789"
        }
      }
    }
  }
}
```

| 字段 | 类型 | 默认值 | 说明 |
|-------|------|---------|-------------|
| `project` | string | `"openclaw"` | 在数据库中限定观察记录范围的项目名 |
| `syncMemoryFile` | boolean | `true` | 把观察上下文注入 agent 系统提示词 |
| `syncMemoryFileExclude` | string[] | `[]` | 被排除在上下文注入之外的 agent ID |
| `workerPort` | number | `37777` | claude-mem worker 服务端口 |
| `observationFeed.enabled` | boolean | `false` | 把观察记录流式推送到消息频道 |
| `observationFeed.channel` | string | — | 频道类型：`telegram`、`discord`、`slack`、`signal`、`whatsapp`、`line` |
| `observationFeed.to` | string | — | 目标会话/频道/用户 ID |
