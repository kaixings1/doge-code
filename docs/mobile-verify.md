# 手机端对话 — 真机验证指南

> 本文档对应提交 `9e8798706` + `e62017323`。
> 功能：手机浏览器扫码，与电脑上的 CLI 会话对话（无需安装 App）。

## 背景

`/mobile-connect` 此前是半成品：只写了服务端骨架，手机端从未编写，且链路两端断裂、中间三层是空壳，从未真正跑通过。本次修复 12 处问题后，手机浏览器扫码即可对话。

**两种客户端都可用，任选其一：**

| 方式 | 安装 | 特性 |
|---|---|---|
| **浏览器**（默认） | 零安装，扫码即用 | 服务端自带页面 |
| **Android 客户端** | 需编译 APK | 原生界面、本地历史、断线重连、通知、会话切换 |

浏览器方案的优点是零安装 —— 手机浏览器原生支持 WebSocket，不必引入
JDK / Android SDK / Flutter 工具链。Android 客户端见
[`android/BUILD.md`](../android/BUILD.md)，需要自行编译（含 MIUI 安装限制说明）。

---

## 前置检查

```cmd
cd /d D:\doge-code
node scripts\verify-mobile.mjs
```

脚本检查 6 项：doge.exe 存在性、是否含新代码标记、LAN IP（与 `getLanIp()` 同逻辑）、防火墙规则、端口占用、环境变量，并输出所有网卡地址供核对。

**期望**：全部 OK。若「含本次修复」显示 FAIL，说明二进制是旧的，先执行步骤 1。

---

## 步骤 1：编译

```cmd
cd /d D:\doge-code
compile.bat
```

**期望**：bundle 模块数约 7485，生成 `doge.exe`，无 error。

**验证**：
```cmd
node scripts\verify-mobile.mjs
```
「含本次修复」应变为 OK。

---

## 步骤 2：放行防火墙

**必须以管理员身份**打开 cmd：

```cmd
netsh advfirewall firewall add rule name="doge-code mobile" dir=in action=allow protocol=TCP localport=5680 remoteip=192.168.0.0/24
```

**为什么需要**：服务端绑 `0.0.0.0`（否则手机连不上），Windows 防火墙默认拦截入站连接。

**为什么限定 remoteip**：不限定等于向整个互联网开放 5680 端口。`192.168.0.0/24` 限定为你的局域网段。

**验证**：
```cmd
netsh advfirewall firewall show rule name="doge-code mobile"
```
应显示规则详情，`已启用: 是`。

---

## 步骤 3：启动

```cmd
set CLAUDE_CODE_MOBILE_BRIDGE=1
set CLAUDE_CODE_MOBILE_SECRET=test1234
doge.exe
```

**注意**：
- 这两条 `set` 只对当前 cmd 窗口有效，关掉就要重设
- `test1234` 是示例，请换成自己的。密钥会带在连接 URL 里，别用重要密码
- **不设密钥的后果**：服务端绑 `0.0.0.0`，无密钥等于把本机的命令执行能力开放给同局域网任何设备

---

## 步骤 4：生成二维码

CLI 内输入：

```
/mobile-connect
```

**期望界面**：
```
📱 移动端连接
状态: 等待中
已连接设备: 0
会话 ID: mobile-<时间戳>
WebSocket: ws://192.168.0.106:5680/mobile/ws?...
HTTP: http://192.168.0.106:5680/mobile/command
二维码 — 用手机浏览器扫码打开对话页面：
████████████████  ← 二维码
链接（可复制到手机浏览器）:
http://192.168.0.106:5680
提示：手机需与电脑在同一 WiFi；若连不上请检查防火墙是否放行 5680 端口
```

**关键检查点**：
- IP 必须是 **`192.168.0.106`**。若显示 `169.254.x.x` 说明选中了未连网的网卡；若显示 `192.168.26.152` 说明选中了「以太网 5」而非 WLAN
- 若显示「移动端桥接不可用」→ 环境变量未生效，重开 cmd 窗口

---

## 步骤 5：手机扫码

手机连**同一个 WiFi**（关键），用相机或浏览器扫二维码。

**期望**：
- 手机浏览器打开深色页面，顶部 `doge-code`
- 圆点变**绿色**，文字显示 **「已连接」**
- 发送按钮由灰变**蓝色**

**同时电脑端**：`/mobile-connect` 界面里「已连接设备: 0」应变为 **1**。

---

## 步骤 6：对话（真正的验收）

手机上输入「你好」，点发送。

**三个预期**：
1. 手机右侧出现**蓝色气泡**「你好」（本地回显）
2. **电脑 CLI 里出现这条消息**，AI 开始处理 ← **关键验收点 1**
3. AI 回复后，手机左侧出现**灰色气泡** ← **关键验收点 2**

---

## 连接方式：优先用 USB 反向转发（推荐）

上方的局域网方案需要「防火墙放行 + 手机同 WiFi」两个前置，容易在
Windows 上卡住（WLAN 被判定为 Public 时，Public Profile 防火墙会拦截入站，
而 5680 的放行规则往往没建 → 手机 ERR_CONNECTION_REFUSED）。

**更简单的方式是 adb reverse（USB 通道）**，它把手机的 `127.0.0.1:5680`
映射到电脑的 5680 端口，流量走 USB 线：

```cmd
node scripts\start-mobile-bridge.mjs
```

该脚本默认走 reverse，会：
1. 检查 `doge.exe`、adb、设备连接
2. 执行 `adb reverse tcp:5680 tcp:5680`
3. 轮询 `http://127.0.0.1:5680` 直到返回 200（就绪探测，最多 20 秒）
4. 以 `CLAUDE_CODE_MOBILE_BRIDGE=1` 启动 CLI

然后手机浏览器打开 **`http://127.0.0.1:5680`** 即可（不用 WiFi、不用防火墙）。

| 对比 | 局域网（--lan） | USB reverse（默认） |
|---|---|---|
| 需管理员放行防火墙 | 是 | **否** |
| 需手机同 WiFi | 是 | **否** |
| 需插 USB 线 | 否 | 是 |
| 手机访问地址 | `http://<电脑IP>:5680` | `http://127.0.0.1:5680` |

两种模式的服务端**完全相同**，只是手机侧访问地址不同。

### 两个易混淆的端口

| 端口 | 进程 | 页面 | 说明 |
|---|---|---|---|
| **5680** | `mobileBridge.ts` | ✅ 有对话页面 | **手机必须连这个** |
| 5678 | `scripts/bridge.ts` | ❌ 根路径 404 | 本地桥接骨架，只做消息广播，**无 AI 逻辑** |

连 5678 会出现「能连上、能看到自己的消息，但永远没有 AI 回复」——
因为那个进程里根本没有对话引擎。判断方法：`curl http://<ip>:5678/` 返回 404
而 5680 返回 HTML 页面。

### 桥接的生命周期

桥接服务器**随 CLI 进程存活**，没有独立的退出清理：

```
CLI 进程退出 → 桥接消失 → 手机 ERR_CONNECTION_REFUSED
```

所以「手机突然连不上」最常见的原因不是网络，而是**那个跑桥接的 CLI 窗口被关了**。
用 `node scripts\start-mobile-bridge.mjs` 启动并保持窗口不关即可。

---

## 排障表

| 现象 | 可能原因 | 排查 |
|---|---|---|
| `ERR_CONNECTION_REFUSED` | 桥接进程已退出（关了 CLI 窗口） | `netstat -ano \| findstr :5680` 看是否在监听 |
| 页面 404 / 只有回显无 AI 回复 | 连到了 5678（骨架）而非 5680 | 端口必须是 **5680** |
| 扫码后页面打不开 | 防火墙未放行 / 不同 WiFi / WLAN 是 Public | 优先改用 `adb reverse`（见上）；或把 WLAN 设为 Private |
| 页面开了但「连接错误」 | WS 被拦 / 密钥不匹配 | 确认 `CLAUDE_CODE_MOBILE_SECRET` 与启动时一致 |
| 显示已连接但发消息无反应 | `enqueue` 未进入会话 | 看电脑 CLI 是否有新消息 |
| 电脑收到但手机收不到回复 | 推送 effect | 见下方「已知薄弱点」 |
| CLI 崩溃退出 | 会话数超限 / 端口被占 | 两项均已修（close 4002；EADDRINUSE 降级不崩溃）|
| 手机连上却收到一大段历史消息 | 游标回灌 | 该问题已修（e62017323） |
| 多开窗口除首个外全崩 | 继承 `CLAUDE_CODE_LOCAL_BRIDGE=1` | 该问题已修（bd6a75566；d.bat/mobile.bat 主动清空该变量）|

### 自检脚本

不确定问题在哪时，先跑自检（不需要真机）：

```cmd
set CLAUDE_CODE_MOBILE_BRIDGE=1
node scripts\verify-mobile.mjs
```

它会检查：doge.exe、局域网 IP（默认路由优先）、防火墙规则、
**网络类别（Public/Private）**、**5680 监听地址（必须是 0.0.0.0，
若只监听 `::` 则手机 IPv4 连不上）**、环境变量。

---

## 已知薄弱点

**回程推送（电脑 → 手机）是本次改动中最缺少验证的一环。**

原因：它依赖 `useReplBridge` 的独立 effect 执行，而该 hook 的运行环境（React/Ink 挂载、messages 更新）无法用单元测试覆盖。已验证的是：
- effect 不依赖任何 bridge 模式守卫（这是上一版写错的地方）
- 游标语义正确（不回灌）
- `pushToMobileClients` 在真实服务器上可调用不抛异常

**未验证的是**：它是否真的在真实 CLI 会话中被触发。

若现象是「电脑收到了手机消息，但手机收不到 AI 回复」，那就是这一环的问题。

---

## 重要限制：必须在交互模式下运行

手机端消息经 `enqueue()` 进入**统一的命令队列**，由 `useQueueProcessor`
（React hook，随 REPL 挂载）消费。这意味着：

| CLI 运行方式 | 服务端启动 | 手机能连 | 消息能进入对话 |
|---|---|---|---|
| 交互模式（直接 `doge.exe`） | ✅ 自动 | ✅ | ✅ |
| `-p` / 非交互模式 | ✅ 自动 | ✅ | ❌ **队列不消费** |

**现象**：`-p` 模式下手机发消息会收到 `{"status":"queued"}` 回执（说明服务端
收到并入了队），但 CLI 不会处理它——因为没有 REPL 在消费队列。**这不是 bug**。

因此正常使用请直接运行 `doge.exe`（不要带 `-p`），保持交互界面在前台。

**客户端现在会主动识别这一状态**：连接时服务端通过 `client_connected`
下发 `interactive` 字段（`process.stdin.isTTY === true`），手机页面与
Android 客户端据此显示「已连接（CLI 非交互，消息不会被处理）」，
不必等用户对着「已提交」干等。

## 多会话：同时连多个 CLI

**一个桥接进程对应一个 CLI 对话**（队列是进程内单例，见下节架构说明）。
要看多个会话，就开多个 CLI，各占一个端口：

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
```

| 环境变量 | 作用 | 缺省 |
|---|---|---|
| `CLAUDE_CODE_MOBILE_PORT` | 监听端口 | `5680`（非法值也回落 5680） |
| `DOGE_SESSION_LABEL` | 会话标签 | 回落为 cwd 目录名 |

手机端（Android 客户端）在「连接设置 → 扫描会话」里扫描 `5680-5690`，
列出所有活会话（含标签、交互状态、工作目录）供切换。

发现机制基于 `GET /mobile/session-info`，返回：

```json
{ "sessionId": "mobile-...", "port": 5681, "cwd": "D:\\doge-code",
  "label": "修CI", "interactive": false, "clients": 0, "lastActivity": 1790952339389 }
```

**为什么不做「一个进程内多个对话」**：`messageQueueManager` 是模块级单例，
被 32 个文件依赖，改造风险高。详见
[`docs/mobile-multi-session-plan-b-assessment.md`](./mobile-multi-session-plan-b-assessment.md)。

## 架构说明（便于排障）

```
手机浏览器
  │  ① 扫码打开 http://192.168.0.106:5680
  │     → GET / 返回内嵌 HTML（renderMobileChatPage）
  ↓
  │  ② WebSocket ws://192.168.0.106:5680/mobile/ws?secret=xxx
  │     → 服务端校验密钥，不匹配则 close(4001)
  │     → 建立 MobileSession（超限则 close(4002)）
  ↓
MobileBridgeServer（mobileBridge.ts）
  │  ③ 收到 {type:'control', action:'sendMessage'}
  │     → forwardToBridge()
  │     → enqueue({ mode:'prompt', bridgeOrigin:true })
  ↓
messageQueueManager（REPL 输入队列）
  │  ④ CLI 出队 → 交给 AI 处理
  ↓
useReplBridge（独立 effect，监听 [messages]）
  │  ⑤ 新消息 → pushToMobileClients()
  ↓
getActiveMobileBridgeServer() → sendToAll()
  │  ⑥ 广播 {type:'assistant', data:{text}}
  ↓
手机浏览器 → 渲染灰色气泡
```

**常见误判**：`writeMessages()` 是**出站**（把本地对话镜像到远端服务器），不能用来注入本地对话。正确的入站入口是 `enqueue()`。

---

## 安全说明

| 项 | 状态 |
|---|---|
| 认证 | 配置密钥后强制校验，不匹配 close(4001) |
| 密钥暴露 | 二维码本身不含密钥（早期版本含，已移除） |
| XSS | 页面配置注入转义 `< > &`，防 `</script>` 逃逸 |
| 网络暴露 | 绑 `0.0.0.0`，须配合防火墙 remoteip 限定 |
| 传输加密 | **无 TLS**。明文 WebSocket，仅可用于可信局域网 |

**不要**在公共 WiFi 上启用此功能。
