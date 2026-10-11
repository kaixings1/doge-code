# doge-code 手机客户端（Android）

原生客户端：用 OkHttp WebSocket 直接与 CLI 的移动桥接通信。
**不重写任何对话逻辑** —— 对话、入队、回复推送全部由 CLI 侧提供
（见 `docs/mobile-verify.md`），本工程只是客户端。

> **多会话已实现**（2026-10-07 更新）：服务端支持 `CLAUDE_CODE_MOBILE_PORT`
> 与 `GET /mobile/session-info`，客户端「连接设置 → 扫描会话」可发现并切换
> 5680–5690 上的多个 CLI 实例。方案与边界见
> [`MULTI-SESSION-PLAN.md`](./MULTI-SESSION-PLAN.md)。
>
> 限制仍在：每个会话必须是一个**独立的 CLI 进程**（各自一个端口）。
> 「一个 CLI 进程内切换多个对话」（方案 B）经评估不建议实施。

## 功能

| 功能 | 说明 |
|---|---|
| 原生聊天界面 | 左右气泡、时间戳、发送状态（发送中/已提交/发送失败）|
| Markdown 轻量渲染 | ```代码块```、**粗体**、`行内代码`（不引入完整 Markdown 库）|
| 本地历史 | 私有目录 JSON，上限 500 条，按「主机_端口」分文件，冷启动自动加载 |
| 历史写盘串行化 | 单线程 executor 排队落盘，避免流式回复期间并发写坏文件 |
| 断线自动重连 | 指数退避 1s→30s，20s 心跳保活 |
| 消息通知 | 助手回复且 App 不在前台时提醒，标题带会话标签（Android 13+ 需授权）|
| 完成时语音播报 | 任务完成时念出「任务已完成」+ 回复首句，前台后台都播报（设置里开关，默认关）|
| 中断 | 回合进行中显示「中断」按钮，收到助手回复后自动收起，顶部 2dp 进度条同步指示 |
| 长按复制 | 长按任意气泡复制全文（手机上手动选中长回复很困难）|
| 可折叠工具气泡 | 工具调用落成可折叠气泡（折叠一行摘要，点开展示命令原文与结果）；折叠态随历史持久化，列表重建后不丢 |
| 思考过程可见 | AI 的 thinking 块以可折叠气泡展示，长任务期间不再只能盯空白等待 |
| 失败重发 | 发送失败的气泡显示「点按重试」，点击即重发，不必重新输入 |
| 会话发现与切换 | 扫描 5680–5690 端口段，列出各 CLI 实例（标签/端口/交互状态/工作目录）|
| 多设备同步去重 | 服务端回推自身消息时不重复显示（判据见 `TurnState.isOwnEcho`）|
| 认证失败引导 | 服务端 close(4001) 时停止重连并自动展开设置面板，而不是无限重试 |
| 连接设置 | 地址 + 密钥，持久化，冷启动自动重连 |

**中断按钮何时出现**由 `TurnState.kt` 的两条判据决定（配 16 条单测）：
发送成功**且**服务端为交互模式才开启回合；只有收到 `assistant` 入站才结束回合。
非交互模式下消息只入队、不会被处理，若不加判据中断按钮会永久停留、进度条常亮。

**自身回声去重**（`TurnState.isOwnEcho`）的判据是「本地存在文本相同、且仍处于
`SENDING` 的 user 消息」。刻意**不含 `QUEUED`**：queued 回执与消息推送到达顺序
不确定，若把已转 QUEUED 的也计入，之后别的设备发来相同文本会被误吞。

## 单元测试

```cmd
set JAVA_HOME=C:\Program Files (x86)\Android\openjdk\jdk-17.0.14
.gradle-dist\gradle-8.9\bin\gradle.bat testDebugUnitTest --offline
```

385 条用例，覆盖 28 个纯逻辑模块（协议解析 / URL 构造 / 消息模型 / Markdown /
历史文件名 / 上限裁剪 / 会话扫描 / 回合状态 / 工具气泡 / 语音播报文本 /
权限协议 / 诊断记录 …）。

只测不依赖 Android 框架的纯逻辑 —— 涉及 `Context`/`WebSocket` 的部分必须真机测，
不要为了凑覆盖率把它们塞进 JVM 测试（`android.jar` 里那些类都是抛异常的桩）。

### 工具气泡的配对契约（易错点）

服务端推送的**工具结果**事件（`state` 为 `done`/`error`）里 `name` 恒为空 ——
Anthropic 的结果块只有 `tool_use_id` 没有工具名（见 `mobileBridge.ts` 的
`describeToolResultForMobile`）。客户端据此**按 `toolUseId` 配对**到先前的
`running` 气泡，把结果合并进同一条：

- 客户端解析时**不能**因 `name` 为空就丢弃结果事件，否则命令输出全丢
  （`BridgeProtocol` 的 `isResultEvent` 例外分支，配 `StreamProtocolTest` 用例）。
- 配对只认 `toolState == "running"` 的气泡（`ChatMessage.findRunningToolCallId`）——
  已 `done` 的不再是合并目标，否则重复结果会覆盖首次结果。
- 配对失败（结果先于 running 乱序到达 / 气泡被历史裁剪挤掉）时**新建一条结果气泡**兜底，
  不让输出静默消失。

## 前置：编译环境

需要两样：

| 组件 | 版本要求 | 本机位置（已装） |
|---|---|---|
| JDK | 17 或以上 | `C:\Program Files (x86)\Android\openjdk\jdk-17.0.14` |
| Android SDK | Platform 35 + build-tools 35.0.0 | `C:\Program Files (x86)\Android\android-sdk` |

**注意**：这两个目录不在常规位置（不是 `Program Files\Java`，也不是
`%LOCALAPPDATA%\Android\Sdk`），所以 `java -version` 直接跑会报 not found。
编译前需显式设置环境变量：

```cmd
set JAVA_HOME=C:\Program Files (x86)\Android\openjdk\jdk-17.0.14
set ANDROID_HOME=C:\Program Files (x86)\Android\android-sdk
set ANDROID_SDK_ROOT=%ANDROID_HOME%
set PATH=%JAVA_HOME%\bin;%PATH%
```

若换机器编译，用 `choco install -y temurin17 android-sdk`（管理员），
或装 Android Studio（自带 JDK 与 SDK，在 `SDK Manager` 确认 Platform 35）。

**Gradle 不需要手动装** —— `build.bat` 会按此顺序解析：
wrapper（若有）→ PATH 里的 gradle → 自动下载 gradle-8.9 到 `.gradle-dist/`。
（官方下载会重定向到 GitHub；GitHub 不通时改用腾讯云镜像：
`https://mirrors.cloud.tencent.com/gradle/gradle-8.9-bin.zip`）

**签名**：工程用 `android/debug.keystore`（自签，被 .gitignore 排除）。
首次构建若该文件不存在会自动用 `keytool` 生成，无需手动准备。

## 编译

在 `android/` 目录下（先设好上面的环境变量）：

```cmd
build.bat
```

或直接调 Gradle（实测约 47 秒）：

```cmd
.gradle-dist\gradle-8.9\bin\gradle.bat assembleDebug
```

产物：`app\build\outputs\apk\debug\app-debug.apk`（约 3.2 MB）

若本机装了 Android Studio，也可直接 `File → Open` 选本目录，点 ▶ 运行到手机。

## 安装到手机

手机已开 USB 调试时：

```cmd
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

或把 apk 拷到手机手动安装（需允许「安装未知来源应用」）。

### MIUI / Redmi 安装被拒（本机实测确认）

本机（Redmi 2312CRAD3C / Android 16 / MIUI V816）实测：

```cmd
adb install -r app-debug.apk
# FAILURE [INSTALL_FAILED_USER_RESTRICTED: Install canceled by user]
```

`adb shell id` 为 `uid=2000(shell)`，**以下尝试全部失败**：

| 尝试 | 结果 |
|---|---|
| `adb install -r` | INSTALL_FAILED_USER_RESTRICTED |
| `adb shell pm install -r /data/local/tmp/x.apk` | 同上 |
| `adb shell settings put global verifier_verify_adb_installs 0` | SecurityException: must have WRITE_SECURE_SETTINGS |

**根因**：MIUI 的「USB 调试(安全设置)」未开启。shell 用户没有
`WRITE_SECURE_SETTINGS`，**adb 侧无法绕过**。必须在手机上手动开：

```
设置 → 更多设置 → 开发者选项
  → 「USB 调试(安全设置)」   ← 安装 APK 的硬门槛，不开则任何 adb 安装都被拒
  → 「USB 安装」（允许通过 USB 安装应用）
```

部分 MIUI 版本开启「USB 调试(安全设置)」需登录小米账号并插入 SIM 卡。

**替代方案（不需要开该开关）**：把 APK 推到手机存储，用手机文件管理器点开安装：

```cmd
adb push app-debug.apk /sdcard/Download/doge-mobile.apk
```

然后在手机「文件管理 → 下载」里点 `doge-mobile.apk`，
按提示允许「安装未知应用」即可。（本次已推送到该路径。）

另外保持 `targetSdk` 不低于 33（本工程为 35），否则 MIUI 可能以
「低 targetSdk 应用」为由拦截（`--bypass-low-target-sdk-block` 相关）。

## 使用

### 方式 A：局域网（**默认推荐**，免插线）

1. 电脑上运行 `node scripts\start-mobile-bridge.mjs`
   （脚本会检测防火墙，有管理员权限时**自动放行**；无权限时打印出确切命令）
2. 手机连**同一 WiFi**（务必确认 WiFi 是开的 —— 只有蜂窝时物理上连不通）
3. 打开本 App → **会话页 → 扫描**
   - 会自动发现本电脑上的实例（探测本机网段，见 `LanScanner`），**不必手输 IP**
   - 若自动发现没结果，也可手动填 `http://<电脑IP>:5680`
4. **保持 CLI 窗口不关闭**（桥接随进程存活，见下文「生命周期」）

「自动发现」由三个纯逻辑模块支撑，各有单测：`SubnetCandidates`（算网段候选）、
`LanScanner`（并发探测）、`SessionOrganizer`（分组排序）。

### 方式 B：USB 反向转发（无 WiFi 时用）

1. 电脑上运行 `node scripts\start-mobile-bridge.mjs --usb`
   （脚本会自动执行 `adb reverse`）
2. **保持 CLI 窗口不关闭**
3. 手机插着 USB，打开本 App，地址栏填 `http://127.0.0.1:5680`

流量走 USB 线，不受防火墙约束、不要求手机与电脑同 WiFi。
**代价**：拔线即断，且换电脑/重插后要重跑一次脚本。

> 为什么默认模式从 USB 改成了局域网：USB 看着「零配置」，实际要求用户
> 同时记住三件事（插线、脚本跑过 adb reverse、地址填 127.0.0.1），
> 任一遗漏的表现都是「连不上」且无从判断。局域网方式手机端能自己发现，
> 用户只需放行一次防火墙。

地址会记住，下次直接连。**未连接时点顶栏状态文字 = 立即重连**
（此前没有任何手动重连入口，连败后只能重启 App —— 已修）。

### 方式 C：多会话（同时挂多个 CLI）

每个 CLI 实例占一个端口，各设一个标签：

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

手机上「连接设置 → 扫描会话」列出 `5680–5690` 的全部活实例（含标签、端口、
交互状态、工作目录），点选即切换。切换时本地历史跟着换成该会话的文件，
不会串味。

## 排障

| 现象 | 原因 | 处理 |
|---|---|---|
| `ERR_CONNECTION_REFUSED` | 桥接进程已退出，或连错端口 | 确认 CLI 在跑；默认端口是 **5680** |
| `ConnectException: Failed to connect to /127.0.0.1:5680` | **`adb reverse` 未建立**（没跑脚本，或脚本窗口被关了） | 电脑上 `adb reverse --list` 若为空，跑 `node scripts\start-mobile-bridge.mjs --usb`。App 端**点顶栏状态文字即可重连**，不必重启 App |
| `IOException: unexpected end of stream` | TCP 通了但 WS 握手被断 —— 桥接已退出，reverse 还指着死端口 | 同上：桥接随 CLI 进程生死，CLI 一关就断 |
| 页面 404 | 连到了 5678 | 5678 是本地桥接骨架，只提供 WS，无页面 |
| 一直转圈 / 连不上 | 防火墙拦截 | 见 `docs/mobile-verify.md` §步骤 2；或把 WLAN 设为 Private |
| 局域网地址连不上（`code=000` 超时） | **手机根本没连 WiFi**（最常见也最易忽略） | `adb shell settings get global wifi_on` 为 `0` 即 WiFi 关着。手机只有蜂窝接口（`rmnet_data1 10.x.x.x`）时与电脑不同网段，**物理上不可能通** |
| 发消息无回复 | 非交互模式 | CLI 必须是交互模式（有 REPL），`-p` 模式队列不消费 |
| 状态栏「认证失败」并自动弹出设置 | 密钥不匹配（服务端 close 4001） | 把密钥填成与 `CLAUDE_CODE_MOBILE_SECRET` 一致；服务端未设密钥则留空 |
| 扫描会话列表为空 | 端口段内无活实例；或手机不在同一网段 | 确认 CLI 启动时设了 `CLAUDE_CODE_MOBILE_BRIDGE=1`。App 日志里 `LanScanner: 候选 IP 0 个` = 手机没有可用局域网接口（WiFi 未连） |

### 排障的第一性原理

手机连不上只有三种可能，按发生概率排序 —— 每条都能独立证伪：

1. **桥接进程不在跑**（最常见）。它随 CLI 进程生死，CLI 一关就没了。
   表现：`ConnectException`（reverse 也没了）或 `unexpected end of stream`（reverse 还在但指向死端口）。
2. **USB 通道没建**（走 USB 时）。`adb reverse --list` 为空。
3. **手机与电脑不在同一网络**（走局域网时）。手机 WiFi 关着 / 连的是别的网。

```cmd
REM 1. 桥接在跑吗？（应有 LISTENING 那一行）
netstat -ano | findstr :5680
REM 2. USB 通道建了吗？（应有 tcp:5680 一行）
adb reverse --list
REM 3. 手机在哪张网上？（应有 wlan0 的 192.168/10.x，而不是只有 rmnet）
adb shell ip -4 addr show
```

## 生命周期（重要）

移动桥接**没有**独立的退出清理，它随 CLI 进程一起存活与消失：

```
CLI 进程退出 → 桥接消失 → 手机 ERR_CONNECTION_REFUSED
```

所以「手机上连不上」最常见的原因不是网络，而是**那个跑桥接的 CLI 窗口被关了**。

## 安全

| 项 | 说明 |
|---|---|
| 明文流量 | `usesCleartextTraffic=true`，因为桥接无 TLS |
| 网络暴露 | 桥接绑 `0.0.0.0`，必须配合防火墙限定来源网段 |
| 认证 | 由 `CLAUDE_CODE_MOBILE_SECRET` 控制。**不设则该值恒为空，服务端不做任何认证** |
| 启动脚本 | `scripts\start-mobile-bridge.mjs` **不再提供默认密钥**（曾硬编码 `doge2026`，等于用一个公开常量「保护」本机）。未设密钥时脚本会明确警告 |
| 适用场景 | **仅可信局域网**。不要在公共 WiFi 使用 |
| 防火墙 | 不要用 `localport=5680` 不限定 remoteip 的规则 —— 那等于向整个互联网开放 |
| 飞书桥接 | 群聊只响应 @机器人 的消息（`isMentioningBot`）。若发现群里闲聊被送进 AI，检查该判断是否被移除 |
