# 多会话支持 — 设计方案

> 状态：**方案 A 全部 6 步已实现**（1-5 于 2026-10-02，6 于 2026-10-07）。
>
> | 步骤 | 内容 | 状态 |
> |---|---|---|
> | 1 | 服务端 `CLAUDE_CODE_MOBILE_PORT` | ✅ 已实现并实测 |
> | 2 | 服务端 `/mobile/session-info` | ✅ 已实现并实测 |
> | 3 | 客户端 `SessionScanner` | ✅ 已实现（协议级已验证，未真机）|
> | 4 | 客户端会话列表 + 切换 | ✅ 已实现（未真机运行）|
> | 5 | 会话标签 | ✅ 已实现（`DOGE_SESSION_LABEL` + cwd 回落）|
> | 6 | 多连接下的通知归属 | ✅ 已实现（`notifyAssistant(text, label)` + 连接后补取标签）|
>
> **限制仍在**：每个会话必须是一个独立的 CLI 进程（各自一个端口）。
> 「一个 CLI 进程内切换多个对话」属于方案 B，经评估**不建议实施**。

## 现状：为什么现在做不到多会话

先厘清两个被混用的「会话」概念：

| 名称 | 实体 | 实现 | 数量 |
|---|---|---|---|
| **移动端连接会话** | 一台手机连上来 | `mobileSession.ts` | 最多 5 个设备 |
| **CLI 对话会话** | 一个 doge 进程里的对话 | `messageQueueManager` | **1** |

`mobileSession.ts` 的注释（第 4-7 行）说「支持多设备同时连接」——
但这指的是**多台手机连同一个 CLI**，不是手机切换多个 CLI 对话。

真正限制在多会话的是**入站路径**：

```
手机 ──WS──▶ mobileBridge.forwardToBridge()
                  │
                  ▼
          enqueue()  ← src/utils/messageQueueManager.ts
                  │
                  ▼
        messageQueueManager 的模块级队列（进程内单例）
                  │
                  ▼
        useQueueProcessor（随本进程的 REPL 挂载）
                  │
                  ▼
        本进程的 AI 对话             ← 一个进程只有一条
```

`enqueue()` 没有「目标会话」参数，队列也是模块级单例，所以**一个桥接
进程只能把消息送进它自己那一个对话**。这不是 bug，是当前架构的必然结果。

## 三种可行路径

### 方案 A：多进程 + 会话列表（推荐，改动最小）

**思路**：不碰单会话架构，而是让**每个 CLI 实例各自起一个桥接**，
手机端做「会话发现 + 切换」。

```
终端1: doge.exe  (CLAUDE_CODE_MOBILE_PORT=5680)  → 会话「前端重构」
终端2: doge.exe  (CLAUDE_CODE_MOBILE_PORT=5681)  → 会话「修 CI」
终端3: doge.exe  (CLAUDE_CODE_MOBILE_PORT=5682)  → 会话「写文档」
                    │
        手机 app 扫描 5680-5690，列出所有活着的桥接
                    │
              点哪个就连哪个
```

需要改动：

1. **服务端**：`mobileBridge.ts` 的端口改为可配置
   ```ts
   const port = Number(process.env.CLAUDE_CODE_MOBILE_PORT ?? 5680)
   ```
   （目前 `autoStartMobileBridge(port?)` 已支持传端口，只是没有环境变量入口）

2. **服务端**：`/mobile/sessions` 端点返回本进程的会话标签
   ```json
   { "port": 5680, "sessionId": "mobile-...", "cwd": "D:\\doge-code",
     "label": "前端重构", "lastActivity": 1790942040394 }
   ```
   标签来源可以是启动时的 `DOGE_SESSION_LABEL` 环境变量，
   或从 cwd 推断（多终端常在不同目录）。

3. **客户端**：新增「会话列表」页，并发探测 `5680..5690`，
   展示活的会话（含 cwd/标签/活跃时间），点击切换。

**优点**：不动核心架构，风险低；每个会话天然隔离（独立进程、独立上下文）。
**缺点**：要开多个终端；手机看到的是「进程」而非「对话」，一个进程里
如果用户 `/clear` 或新建对话，手机侧仍是一条流。

**工作量**：服务端约 60 行，客户端约 250 行（列表页 + 扫描 + 切换）。

### 方案 B：单进程 + 多对话（改动大，需动核心）

**思路**：在一个 CLI 进程内维护多个对话，手机端切换。

需要改动：

1. `messageQueueManager` 的队列按 `sessionId` 分桶，`enqueue()` 增加目标参数。
2. `useQueueProcessor` 按当前激活的 `sessionId` 消费对应队列。
3. `mobileBridge` 的协议增加 `switchSession` 控制消息。
4. `useReplBridge` 的推送 effect 要按 `sessionId` 过滤，避免把 A 会话的
   回复推给正在看 B 会话的手机。

**优点**：一个终端窗口搞定所有会话，切换体验最顺。
**缺点**：要改核心的消息队列与 REPL 消费路径 —— 这是**所有交互**共用的
基础设施，回归风险高（`messageQueueManager` 还被任务通知、subagent、
slash 命令等多处依赖）。没有充分的测试覆盖前不建议动。

**工作量**：核心改造约 300–500 行 + 全量回归，风险等级高。

> **已完成可行性评估，结论：不建议实施。**
> 详见 [`docs/mobile-multi-session-plan-b-assessment.md`](../docs/mobile-multi-session-plan-b-assessment.md)。
> 关键数据：`messageQueueManager` 被 **32 个文件**依赖，含 3 处模块级
> 单例状态（`commandQueue` / `snapshot` / `queueChanged`）；改动会波及
> 所有交互路径，且 `useQueueProcessor` 的运行环境无法单元测试，
> 改造后主要靠真机验证。评估中含分四步降险的路线（若将来确需）。

### 方案 C：不改服务端，客户端并行多连接

**思路**：客户端同时连 5680/5681/5682，用底部 tab 或下拉切换。

本质是方案 A 的客户端部分，服务端仍需按方案 A 第 1 点支持多端口。
如果**每个会话跑在不同端口**这一前提成立，方案 C 就是方案 A 的 UI 变体。

## 推荐路线

**先做方案 A**。理由：

1. 它不碰 `messageQueueManager` 这条所有功能共用的路径，风险可控。
2. 多终端本来就是 CLI 的常见用法（用户已经在开多个窗口）。
3. 若将来方案 B 的收益被验证（用户确实需要单窗口多对话），
   方案 A 的客户端「会话列表」UI 可以直接复用。

**分步实施**（步骤 1-4 已完成，实现方式与本文略有出入，见下）：

| 步骤 | 内容 | 状态 |
|---|---|---|
| 1 | 服务端支持 `CLAUDE_CODE_MOBILE_PORT` | ✅ `resolveMobilePort()`，非法值回落 5680 |
| 2 | 服务端元信息端点 | ✅ 实际路径为 `/mobile/session-info`（非 `/mobile/sessions`）|
| 3 | 客户端 `SessionScanner`：并发探测端口段 | ✅ 5680-5690，单端口 300ms 超时 |
| 4 | 客户端会话列表 + 切换 | ✅ 用 AlertDialog 而非独立 Activity |
| 5 | 会话标签（`DOGE_SESSION_LABEL` / cwd 推断） | ✅ 随步骤 2 一并实现 |
| 6 | 多连接下的通知归属 | ✅ `notifyAssistant(text, label)` 标题为「doge-code · 标签」；连接成功后由 `MainActivity.refreshSessionLabel()` 从 `/mobile/session-info` 补取 |

## 实际用法（已可用）

```cmd
REM 终端 1
set CLAUDE_CODE_MOBILE_BRIDGE=1
set CLAUDE_CODE_MOBILE_PORT=5680
set DOGE_SESSION_LABEL=前端重构
doge.exe

REM 终端 2
set CLAUDE_CODE_MOBILE_BRIDGE=1
set CLAUDE_CODE_MOBILE_PORT=5681
set DOGE_SESSION_LABEL=修CI
doge.exe

REM 手机：连接设置 → 扫描会话 → 点选要连的那个
```

不设 `DOGE_SESSION_LABEL` 时标签回落为工作目录名。

## 已存在的可复用资产

- `mobileBridge.getMobileBridgeUrl(port?)` 已参数化端口，方法 3 只需加环境变量入口。
- `mobileSession.ts` 的 `MobileSessionManager` 可承载「本进程会话元信息」。
- 客户端 `BridgeClient` 已封装单个连接，多连接只需实例化多份
  （其回调已切主线程，多实例并发安全）。
- `MessageStore` 已按单文件持久化，多会话时改为按 `sessionId` 分文件即可。

## 服务端能力清单（客户端接线对照）

排查「服务端支持但客户端没用」的缺口时用这张表：

| 服务端能力 | 位置 | 客户端状态 |
|---|---|---|
| `GET /mobile/session-info` | `mobileBridge.ts` | ✅ `SessionScanner.scan` + `refreshSessionLabel` |
| `GET /mobile/status` | `mobileBridge.ts` | ❌ 未使用（`BridgeClient` 已从 `client_connected` 拿到等价信息）|
| `GET /` 内嵌对话页 | `mobileBridge.ts` | 浏览器方案用，原生客户端不使用 |
| `POST /mobile/command` | `mobileBridge.ts` | ❌ 未使用（`defaultMobileHandlers` 只剩 `getStatus`/`getHistory`）|
| `WS /mobile/ws` control:sendMessage | `forwardToBridge` | ✅ `BridgeClient.sendMessage` |
| `WS /mobile/ws` control:interrupt | `forwardToBridge` | ✅ `BridgeClient.sendInterrupt` |
| `close(4001)` 认证失败 | `mobileBridge.ts` | ✅ `Event.AuthFailed` + 自动展开设置面板 |
| `close(4002)` 会话数上限 | `mobileBridge.ts` | ✅ 已区分（`BridgeClient.classifyClose` + `Event.SessionLimitReached`，退避 30s，UI 提示「设备数已满」）|
| `client_connected.interactive` | `mobileBridge.ts` | ✅ 非交互模式提示 |
| `client_disconnected` 广播 | `mobileBridge.ts` | ⚪ 仅用于诊断，客户端无需处理 |

`close(4002)`（同一 CLI 上连第 6 台设备）**已修复**（2026-10-09）：客户端
`BridgeClient.classifyClose` 把关闭码分类为 `AUTH_FAILED`/`SESSION_LIMIT`/`NORMAL`
三种策略；4002 派发 `Event.SessionLimitReached`，状态栏显示「设备数已满」并附说明，
重连退避起点抬到 30 秒（不再快速闪）。与 4001 的区别：4002 是**可恢复**的
（关掉旧设备即可连上），故不停止重连。见 `BridgeClientCloseTest`（含变异验证）。

## 开放问题

1. **会话标签从哪来** — ✅ 已决策：`DOGE_SESSION_LABEL` 优先，回落 cwd 目录名。
   同一目录开多个窗口时无法区分，需用户显式设标签。
2. **通知归属** — ✅ 已解决（2026-10-07）：`notifyAssistant(text, label)` 标题
   变为「doge-code · <标签>」。冷启动自动重连路径此前拿不到标签（只有从会话
   列表点选时才有），现由 `MainActivity.refreshSessionLabel()` 在连接成功后
   从 `/mobile/session-info` 补取。
   注意标签只在**连接成功后**才可能为空 —— 首次连接期间收到的回复，其通知
   标题仍退化为「doge-code」。
3. **端口扫描范围** — ✅ 已决策：`5680..5690`（11 个），单端口超时 300ms，
   10 线程并发（`SessionScanner.scan`）。
4. **切换时的历史** — ✅ 已解决：`MessageStore` 按 `history-<host>_<port>.json`
   分文件，切换会话时重新加载；临时文件名也跟随目标文件，避免并发写踩踏。
   同一会话内的并发写由 `MessageStore` 内部的单线程 writer 排除（2026-10-07）。
5. **历史保留上限** — ✅ 500 条，超出丢最旧（`MessageStore.trimToLimit`，
   配 5 条边界单测）。曾用 `subList(0, MAX)` 的写法会把**最新**的丢掉，
   表现为「历史停在很久以前」且无报错。

## 后续修复（2026-10-12，本机实测驱动）

用户报告「地址没发给手机 / 启动卡死 / 多会话端口乱」，逐项实证后修复：

| 问题 | 实证 | 修复 |
|---|---|---|
| 扫描拿不到地址 | `/mobile/session-info` 此前**不返回** lan/tunnel，只有 `client_connected` 才下发 → 手机必须先盲连一次才能记住隧道地址，而隧道子域每次重启都变，冷启动走不通 | `session-info` 增加 `lan[]`/`tunnel`（复用 `sessionEndpoints`），扫描即可拿到地址直接连 |
| 启动卡死、端口乱 | `netstat` 实测 6000/6001/6002 **三个端口同时 LISTENING**（`mobile.bat` 调脚本 + 自己 `bun run` 起第二个 CLI，抢端口后自动顺延） | `mobile.bat` 改为单一入口（只调脚本）；30 个 `--feature` 搬进 `start-mobile-bridge.mjs`（`--feature` 是 bun 编译期参数，`doge.exe` 不接受，故脚本跑 bun 源码路径） |
| 多会话端口错位 | 端口靠自动顺延，隧道/地址对不上 | 脚本新增 `--port <n>`（显式端口，隧道文件按端口分）与 `--label <名>`（多会话标签） |
| CLOSE_WAIT 泄漏 | `netstat` 见同一手机 IP 在 6000 堆多条 CLOSE_WAIT；`clients` 只增不减 | `MobileBridgeServer` 新增**服务端心跳**（原只有客户端侧有）：30s 一轮发 ping，上轮 `__alive=false` 即判死连接并清理；入站消息（含 pong）置 `__alive=true` |

实测证据（`--port 6010 --label test6010` 起真实实例）：

```json
{ "label": "test6010", "port": 6010,
  "lan": ["http://192.168.26.152:6010", "http://100.99.118.124:6010",
          "http://192.168.0.106:6010"],
  "tunnel": null }
```

测试：`mobile-bridge-multisession.test.ts` 19/19、心跳清理新增 1 例（含变异验证）。
已知既有失败：`mobile-bridge-server.test.ts` 的「端口被占用」用例在**基线**同样失败
（`git stash` 验证过），与本系列改动无关。

## 真机验证（2026-10-12，设备 8defe612 / MIUI / Android）

装包（`adb install -r -t --user 0`）后逐项实测：

| 项 | 结果 |
|---|---|
| App 启动 | ✅ 正常渲染（会话/对话/设置三 tab），无 FATAL、无黑屏 |
| 手机→电脑连通 | ✅ 手机 `192.168.0.108` 可直连电脑 `192.168.0.106:6011/6012` |
| `session-info` | ✅ 返回 `label=真机测试`（中文正常）、`lan` 地址正确、`port` 正确 |
| 会话页扫描 | ✅ 成功，列表**按 IP 分组**（`192.168.0.106 (3)` / `192.168.26.152 (3)`），每项显示标签/端口/交互模式/cwd，带「切换」「当前」 |
| 脚本 `--port`/`--label` | ✅ 两实例（6011/6012）各自监听、标签独立 |

### 真机暴露的**新缺陷**（未修，需另行决策）

**漏扫**：会话页扫到了 6001/6003/6004，**没扫到**同样在监听的 6011/6012。

- 根因：`LanScanner.scan` 的 `TOTAL_TIMEOUT_MS = 20_000`，而 `candidates()`
  对**每个本机网卡**生成整段 /24 候选 → 本机 3 个网卡（含 `192.168.26.x`
  VMware/WSL、`100.99.x` Tailscale）共 **762 个候选 IP** × 21 端口。
  20 秒内扫不完 → deadline 截断靠后的 IP，6011/6012 恰在被截断区间。
- 表征与用户报的「扫不到 / 卡住」一致。
- 可能的修法（需先确认，勿擅改 `SubnetCandidates` 的既有设计）：
  ① 优先扫默认路由网段（手机能连的那个），虚拟网卡网段降级或后置；
  ② 缩短单轮端口数 / 提高并发；③ 提高 `TOTAL_TIMEOUT_MS` 并给 UI 进度。
- 缓解手段（无需改码）：在设置页把「扫描端口范围」收窄到实际使用的段。

**CPU/IO 提示**：扫描期间 `LanScanner` 记录到 762 候选、3 个网段，
家用路由在短时大量连接下可能丢包（模块注释已提到该权衡）。

## 验证记录（2026-10-02）

服务端端点与客户端扫描逻辑做了协议级验证（真实起 3 个 doge 实例）：

```
CLAUDE_CODE_MOBILE_PORT=5680 DOGE_SESSION_LABEL=前端重构 doge.exe
CLAUDE_CODE_MOBILE_PORT=5682 DOGE_SESSION_LABEL=修CI     doge.exe
CLAUDE_CODE_MOBILE_PORT=5685 DOGE_SESSION_LABEL=写文档   doge.exe

按客户端 SessionScanner 的逻辑扫描 5680-5690，结果：
  端口 5680 | 前端重构 | 非交互 | D:\doge-code
  端口 5682 | 修CI     | 非交互 | D:\doge-code
  端口 5685 | 写文档   | 非交互 | D:\doge-code
  发现 3 个会话 ✅
```

| 检查项 | 结果 |
|---|---|
| 端口可配（`CLAUDE_CODE_MOBILE_PORT`）| ✅ 各自监听对应端口 |
| 非法端口回落 | ✅ `abc` → 5680 |
| 标签（`DOGE_SESSION_LABEL`）| ✅ 正确返回；未设时回落目录名 |
| 扫描发现全部会话 | ✅ 3/3 |
| **非会话服务不被误判** | ✅ 5678 骨架服务未出现在列表中 |
| **会话隔离** | ✅ 3 个端口返回 3 个不同 sessionId，不串话 |

**仍未验证**：Android 客户端真机运行（无设备连接）。Kotlin 侧逻辑与
上述协议一致，但未经真机执行。

## 客户端侧补充验证（2026-10-07）

APK 可构建（`assembleDebug` 通过），109 条 JVM 单测全绿（8 个纯逻辑模块）。
其中与多会话直接相关的：

| 模块 | 用例数 | 覆盖点 |
|---|---|---|
| `SessionScannerTest` | 23 | `parseSessionInfo` 判定「什么算会话」+ `labelFrom` 补取标签 |
| `MessageStoreKeyTest` | 7 | 会话 key 生成（含 IPv6、路径穿越字符）|
| `MessageStoreTrimTest` | 5 | 历史保留上限边界（恰好 500 / 501 / 5000）|
| `TurnStateTest` | 16 | 回合判据 + 自身回声去重（含 QUEUED 不该去重的反例）|

每个新判据都做了**变异测试**：故意取反条件后对应用例失败，确认测试真的在
约束行为，而不是复刻生产逻辑恒真通过。

**仍未验证**：真机运行（无设备）。扫描/切换/通知在真机上的表现（尤其
多实例并发、休眠后重连、通知标签是否及时更新）需实机确认。
