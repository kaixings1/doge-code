# 手机版适配审查报告

> 日期：2026-10-07。范围：`android/` 原生客户端 + `src/bridge/mobile*.ts` 服务端
> + `scripts/start-mobile-bridge.mjs` 启动脚本 + 相关的飞书桥接。
>
> 本次审查修掉 4 个真实缺陷（其中 2 个是静默失败），补齐客户端 3 处未接线的
> 服务端能力，清理 8 个假回执 handler，新增 42 条测试（Kotlin 20 + TS 22）。

## 一、功能是否齐全

**结论：核心对话链路齐全，长尾能力有缺口。**

判据是「服务端已有能力 vs 客户端是否接线」。逐项对照：

| 能力 | 服务端 | 客户端 | 说明 |
|---|---|---|---|
| 发消息 / 收回复 | ✅ | ✅ | 完整链路，见 `docs/mobile-verify.md` 架构图 |
| 中断当前回合 | ✅ | ✅ | 仅在交互模式开启回合（`TurnState.startOnSend`）|
| 会话发现与切换 | ✅ | ✅ | 扫描 5680–5690，本次补上标签补取 |
| 本地历史（分会话） | — | ✅ | 按 `主机_端口` 分文件，上限 500 条 |
| 多设备同步 | ✅ | ✅ | 服务端广播 user 消息，客户端去重自身回声 |
| 认证失败引导 | ✅ | ✅ | close(4001) 停止重连 + 自动展开设置 |
| 非交互模式提示 | ✅ | ✅ | `client_connected.interactive` |
| 消息通知 | — | ✅ | 标题含会话标签 |
| 断线重连 / 心跳 | — | ✅ | 指数退避 1s→30s，ping 20s |
| **会话数上限（4002）** | ✅ | ❌ | 第 6 台设备连接后表现为「普通断线 + 无限重连」，无提示 |
| **`GET /mobile/status`** | ✅ | ❌ | 未使用；`client_connected` 已提供等价信息，非缺口 |
| **`POST /mobile/command`** | ✅ | ❌ | 未使用；其 handler 多为空壳，本次已清理 |

**本次补齐的缺口**（此前服务端已就绪但客户端没接线）：

1. **通知标题的会话标签**。`SessionScanner.Session.label` 早在会话列表里拿到了，
   但只在用户「从列表点选」那条路径上赋值；冷启动自动重连路径拿不到 →
   通知标题恒为「doge-code」，多会话时无法判断是哪条对话的回复。
   现由 `MainActivity.refreshSessionLabel()` 在连接成功后从
   `/mobile/session-info` 补取。
2. **标签提取的失败语义**。新增 `SessionScanner.labelFrom()`：拿不到标签返回
   `null` 而不是编造占位。必须显式判类型 —— `JSONObject.optString` 对 JSON
   对象会返回其 `toString`（`{}`），若不挡住，通知标题会变成「doge-code · {}」。
3. **自身回声去重的可测性**。原判据内联在 `MainActivity` 私有方法里，无法单测。
   抽成 `TurnState.isOwnEcho(incomingRole, incomingText, local)`。

## 二、功能是否正确

**结论：已验证部分正确；未验证部分（真机行为）需实机确认。**

### 已通过测试验证

| 层 | 验证方式 | 结果 |
|---|---|---|
| Kotlin 纯逻辑 | JVM 单测 109 条（8 个模块）| ✅ 全绿 |
| 服务端协议 | 真实起 `MobileBridgeServer` 跑 WS 往返 / 鉴权 / 端口冲突 | ✅ 34 条全绿 |
| 飞书入站路径 | 断言走 `enqueue` 而非 `writeMessages` | ✅ 4 条全绿 |
| 构建 | `assembleDebug` + `lintDebug` | ✅ 通过 |
| 关键判据 | **变异测试**（故意取反条件，确认用例失败）| ✅ 4 组均被捕获 |

变异测试覆盖的判据：`TurnState.isOwnEcho` 的 `SENDING` 条件、
`SessionScanner.labelFrom` 的类型判定、`MessageStore.trimToLimit` 的裁剪方向、
飞书入站的 `enqueue` vs `writeMessages`。

### 本次修掉的形式化错误

| # | 缺陷 | 症状 | 根因 |
|---|---|---|---|
| 1 | `MessageStore` 并发写盘 | 流式回复期间 N 条消息开 N 个线程写同一文件，争抢同一个 `.tmp` 名；Windows 下直接 `FileNotFoundException`（文件被占用），或落盘半个 JSON | `persist()` 每次 `thread { store.save() }`，无串行化 |
| 2 | `onDestroy` 落盘丢失 | Activity 销毁时新开的线程可能来不及执行就被回收，最后一轮回复丢失 | 同上，且用了新线程而非队列 |
| 3 | `optString` 类型误判 | 服务端字段类型意外变化时，通知标题变成「doge-code · {}」 | `optString` 对对象返回 `toString` |
| 4 | 历史裁剪方向 | 若写成 `subList(0, MAX)`，丢的是**最新**消息，用户看到「历史停在很久以前」且无报错 | 已用 5 条边界用例钉住 |

> 缺陷 1 的验证经历值得一提：最初写了一个「12 线程并发写应损坏内容」的测试，
> 但实测**有时 12 个线程全部完整落地**（失败=0、内容完整）。断言「竞态必然发生」
> 是非确定性的 —— 它会随机变红，训练人忽略红灯。该测试已删除，改为对生产代码
> `trimToLimit` 的确定性契约测试。并发问题的正确防线是单线程 writer，不是靠运气的测试。

### 未验证（需真机）

- 扫描/切换在真机上的表现（多实例并发、休眠后重连、通知标签是否及时更新）
- MIUI 安装限制（见 `android/BUILD.md`，已知需开「USB 调试(安全设置)」）
- 弱网/切换 WiFi 时的重连行为

## 三、是否有会话管理

**有，且是两层，边界清晰。**

| 层 | 实体 | 实现 | 数量上限 |
|---|---|---|---|
| 移动端连接会话 | 一台手机连上来 | `src/bridge/mobileSession.ts` | 5 个设备 / CLI |
| CLI 对话会话 | 一个 doge 进程里的对话 | `messageQueueManager`（模块级单例）| **1** |

这两层常被混为一谈。`mobileSession.ts` 的「支持多设备同时连接」指的是
**多台手机连同一个 CLI**，不是手机切换多个 CLI 对话。

**手机端看到的「多会话」= 多个 CLI 进程**（方案 A）：

```
终端1: doge.exe  CLAUDE_CODE_MOBILE_PORT=5680  DOGE_SESSION_LABEL=前端重构
终端2: doge.exe  CLAUDE_CODE_MOBILE_PORT=5681  DOGE_SESSION_LABEL=修CI
                    │
        手机扫描 5680-5690 → 列出两个会话 → 点选切换
```

会话元信息由 `GET /mobile/session-info` 提供（`sessionId` / `port` / `cwd` /
`label` / `interactive` / `clients` / `lastActivity`）。客户端用
`SessionScanner.parseSessionInfo` 过滤 —— 要求 `sessionId` 非空，否则端口段里
恰好返回 JSON 的无关服务会出现在列表里。

**为什么不做「一个进程内多对话」**：`messageQueueManager` 是模块级单例，
被 32 个文件依赖，改它等于改所有交互共用的基础设施。已完成可行性评估，
结论不建议实施（`docs/mobile-multi-session-plan-b-assessment.md`）。

**已知会话管理缺口**：

- 会话标签只在 `DOGE_SESSION_LABEL` 或 cwd 目录名之间二选一。同一目录开多个
  窗口时无法区分，需用户显式设标签。
- 会话列表是**临时弹窗**（AlertDialog），无持久化的「最近会话」记录；
  冷启动只重连上次地址，不会自动列出可选项。
- 同一会话的多台设备之间，`clients` 计数只用于展示，无「谁在看」的标识。

## 四、是否有网络管理

**有，分三层：连接容错、认证、暴露面控制。**

### 连接容错（客户端 `BridgeClient.kt`）

| 机制 | 实现 |
|---|---|
| 断线自动重连 | 指数退避 1s→2s→4s…上限 30s，非主动断开时一直重试 |
| 心跳保活 | OkHttp `pingInterval(20s)`，及时发现半开连接 |
| 读超时 | 不设（`readTimeout(0)`），WS 长连接不应被读超时打断 |
| 认证失败短路 | `close(4001)` 置 `manualClose=true` 停止重连，避免每 30 秒无意义重试 |
| 服务端兜底 | `wss.on('error')` 恒有监听，防 unhandled error 杀掉 CLI |
| 端口冲突降级 | `EADDRINUSE` 静默 resolve，不标记 running，不抢全局注册表 |

失败日志带异常类型与 HTTP 响应码（`Log.w(TAG, "WS 失败 url=... code=... type=...")`），
否则真机排查时只看到「连接失败」，无法区分 DNS / 拒绝连接 / 升级被拒 / 证书问题。

### 认证

- 服务端：`CLAUDE_CODE_MOBILE_SECRET` 非空时强制校验，不匹配 `close(4001)`
- 客户端：密钥拼在 WS query 里（`URLEncoder.encode`，含特殊字符不截断）
- 密钥不匹配时客户端停止重连并自动展开设置面板（否则用户只看到状态栏反复闪）

**⚠ 安全默认值已修**：`scripts/start-mobile-bridge.mjs` 曾硬编码
`DEFAULT_SECRET = 'doge2026'`，未设环境变量时静默使用。服务端绑 `0.0.0.0`，
等于用一个公开写在仓库里的常量「保护」本机命令执行能力。现改为未设即空密钥
（服务端不做认证），脚本启动时明确警告并给出设置命令。

### 暴露面控制

| 项 | 状态 |
|---|---|
| 绑定地址 | `0.0.0.0`（手机必须能从局域网访问），**因此防火墙规则必须带 `remoteip` 限定** |
| CORS | `/mobile/session-info` 用 `Access-Control-Allow-Origin: *`（供手机跨源探测）；其余端点仅回显本地 origin，非本地 origin 回落 `'null'` |
| XSS | 内嵌对话页的配置注入转义 `< > &`，切断 `</script>` 逃逸 |
| 传输加密 | **无 TLS**。明文 WebSocket，仅可用于可信局域网 |
| 明文流量 | Android 侧 `usesCleartextTraffic=true` + `network_security_config` 域名白名单 |
| 双通道 | USB 反向转发（`adb reverse`，不碰防火墙）与局域网（需放行）二选一 |

## 五、能否进一步扩展

按「成本 / 收益 / 风险」分三档。

### 第一档：低成本高价值（建议做）

| 扩展 | 工作量 | 理由 |
|---|---|---|
| **区分 `close(4002)`** | ~20 行 | 会落到「普通断线 + 无限重连」分支，用户看不出是设备数超限。加一条 `Event.TooManyDevices` 即可 |
| **会话列表持久化** | ~60 行 | 记住最近连过的 `host:port:label`，冷启动先列出来供选，不必每次扫描 |
| **图片/截图发送** | ~80 行 | 服务端 `inboundMessages.ts` 已实现 `normalizeImageBlocks` 与 `detectImageFormatFromBase64`，客户端只需发 `ContentBlockParam[]`。手机上拍代码截图发给 AI 是很自然的用法 |
| **消息重发队列** | ~50 行 | 断线期间的发送现在直接置 `FAILED`。改为本地排队，重连后自动重放 |

### 第二档：需服务端配合（收益明确但要动两边）

| 扩展 | 说明 |
|---|---|
| **流式增量显示** | 现在助手回复是**整条**到达才渲染（`pushToMobileClients` 在消息定稿后推送）。要做打字机效果，需服务端在流式过程中推送增量事件，客户端做 diff 合并 |
| **工具调用可视化** | `MobileBridgeHandle` 已有 `sendToolResult` / `sendProgress` 接口，但移动桥接的推送路径没用它们。接上后手机能看到「正在读文件 / 正在跑命令」 |
| **权限请求转发** | `MobileBridgeOptions` 有 `onPermissionResponse`，但移动路径未接线。接上后可在手机上批准/拒绝工具执行 —— 这是远程使用的关键能力 |
| **会话内多对话** | 即方案 B，已评估不建议（`messageQueueManager` 被 32 文件依赖）|

### 第三档：不建议做

| 扩展 | 原因 |
|---|---|
| 完整 Markdown 渲染器 | 当前轻量解析已覆盖 ```代码块```、**粗体**、`行内代码`。引入完整库会带来体积与维护成本，而手机端只需可读 |
| WebSocket over TLS | 自签证书在手机上的信任链成本高于收益；USB 通道本来就不出本机 |
| 一个进程内多对话 | 见上，风险评估已否决 |

## 六、顺带修掉的关联缺陷

排查手机版时发现飞书桥接（共用 `MobileRequest` 协议）有两个更严重的静默失败：

### 1. 入站消息走错入口 → 永远进不了对话

`src/services/feishu/index.ts` 的 `sendToBridge()` 调用
`bridgeHandle.writeMessages()`，而这是**出站**（把本地对话镜像到远端服务器），
完全绕过入站入口 `enqueue()`。

后果：飞书发的普通文本与所有命令都只会被镜像出去，本机 CLI 从不处理 ——
用户看到飞书卡片永远停在「发送中」，日志无任何报错。

`mobileBridge.ts` 的 `forwardToBridge()` 注释早已记录过同一个坑
（「writeMessages() 是出站……用它无法把外部消息注入本地对话」），飞书侧漏改。

**已修**：改用 `enqueue({ mode: 'prompt', skipSlashCommands: true, bridgeOrigin: true })`，
与移动桥接保持一致。

### 2. 群聊未 @ 机器人也被送进 AI

`feishuMessageAdapter.isMentioningBot` 定义了「群聊需 @ 才响应」，
但 `handleIncomingMessage` **从未调用它**。后果是群里任何人说的任何一句话
都会被当成 prompt 送进本机 AI 对话 —— 既是隐私问题，也会刷爆会话。

**已修**：入站处加 `if (!isMentioningBot(msg.message)) return`。

### 3. 8 个假回执 handler

`src/bridge/mobileProtocol.ts` 的 `defaultMobileHandlers` 里有 8 个 handler
（`execute` / `readFile` / `writeFile` / `editFile` / `search` / `listFiles` /
`interrupt` / `cancel`）只返回 `{ status: 'queued', message: 'xx已排队' }`
而从不执行任何操作。客户端一旦调用会收到 `success: true` 但什么都不会发生。

且 `feishuCommandMapper` 把这 8 个 action 列成了可用命令（`/run` `/read` 等），
即命令表是纯装饰。

**已清理**：删除 8 个 handler，只保留真正实现的 `getStatus` / `getHistory`。
未登记的 action 现在由 `handleMobileRequest` 返回
`未知操作: <action>`（`success: false`）—— 能力缺口立刻可见，而不是假成功。

飞书命令表同步收敛为 `/status` `/history`。原先 `/run` 等前缀落到
「非命令文本」分支反而更有用 —— AI 本身就能读文件、跑命令、搜代码，
比一个假的 `/run` 前缀有效得多。

## 附：本次改动清单

| 文件 | 改动 |
|---|---|
| `android/.../SessionScanner.kt` | 新增 `labelFrom()`（含类型判定）+ `fetchSessionInfo()` |
| `android/.../MainActivity.kt` | `refreshSessionLabel()`；`isOwnEcho` 改用 `TurnState`；落盘改 `saveAsync` |
| `android/.../MessageStore.kt` | 单线程 writer 串行化写盘；抽出 `trimToLimit()` |
| `android/.../TurnState.kt` | 新增 `isOwnEcho()` + `EchoCandidate` |
| `android/.../SessionScannerTest.kt` | +7 条（标签提取）|
| `android/.../TurnStateTest.kt` | +8 条（自身回声去重）|
| `android/.../MessageStoreTrimTest.kt` | 新建，5 条（裁剪边界）|
| `src/services/feishu/index.ts` | 入站改 `enqueue`；补 `isMentioningBot` 判断 |
| `src/services/feishu/feishuCommandMapper.ts` | 命令表收敛为 2 项；解析分支简化 |
| `src/bridge/mobileProtocol.ts` | 删除 8 个空壳 handler |
| `src/__tests__/api/mobileProtocol.test.ts` | 改为断言「已删除的 action 必须 success:false」|
| `scripts/start-mobile-bridge.mjs` | 移除硬编码默认密钥 |
| `tests/unit/feishu-inbound-enqueue.test.ts` | 新建，4 条 |
| `android/BUILD.md`、`android/MULTI-SESSION-PLAN.md`、`docs/mobile-verify.md` | 同步实际实现 |

## 附：复核命令

```cmd
REM Android 单测 + 构建
cd /d D:\doge-code\android
set JAVA_HOME=C:\Program Files (x86)\Android\openjdk\jdk-17.0.14
set ANDROID_HOME=C:\Program Files (x86)\Android\android-sdk
.gradle-dist\gradle-8.9\bin\gradle.bat testDebugUnitTest assembleDebug --offline

REM 服务端相关测试
cd /d D:\doge-code
bunx vitest run tests/unit/mobile-bridge-server.test.ts tests/unit/mobile-bridge-multisession.test.ts tests/unit/mobile-bridge-push.test.ts tests/unit/mobile-bridge-interrupt.test.ts tests/unit/feishu-inbound-enqueue.test.ts src/__tests__/api/mobileProtocol.test.ts
```
