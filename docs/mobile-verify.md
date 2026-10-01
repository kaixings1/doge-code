# 手机端对话 — 真机验证指南

> 本文档对应提交 `9e8798706` + `e62017323`。
> 功能：手机浏览器扫码，与电脑上的 CLI 会话对话（无需安装 App）。

## 背景

`/mobile-connect` 此前是半成品：只写了服务端骨架，手机端从未编写，且链路两端断裂、中间三层是空壳，从未真正跑通过。本次修复 12 处问题后，手机浏览器扫码即可对话。

选浏览器而非原生 App，是为避免引入 JDK / Android SDK / Flutter 工具链（数 GB）——手机浏览器原生支持 WebSocket，零安装。

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

## 排障表

| 现象 | 可能原因 | 排查 |
|---|---|---|
| 扫码后页面打不开 | 防火墙未放行 / 不同 WiFi | 手机浏览器直接访问 `http://192.168.0.106:5680` |
| 页面开了但「连接错误」 | WS 被拦 / 密钥不匹配 | 确认 `set CLAUDE_CODE_MOBILE_SECRET=test1234` 与启动时一致 |
| 显示已连接但发消息无反应 | `enqueue` 未进入会话 | 看电脑 CLI 是否有新消息 |
| 电脑收到但手机收不到回复 | 推送 effect | 见下方「已知薄弱点」 |
| CLI 崩溃退出 | 会话数超限 | 该问题已修（close 4002 优雅拒绝），若仍崩溃请记录输出 |
| 手机连上却收到一大段历史消息 | 游标回灌 | 该问题已修（e62017323） |

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
