# doge-code 手机客户端（Android）

原生客户端：用 OkHttp WebSocket 直接与 CLI 的移动桥接通信。
**不重写任何对话逻辑** —— 对话、入队、回复推送全部由 CLI 侧提供
（见 `docs/mobile-verify.md`），本工程只是客户端。

> 多会话（手机上切换多个 CLI 对话）**尚未实现**，方案见
> [`MULTI-SESSION-PLAN.md`](./MULTI-SESSION-PLAN.md)。

## 功能

| 功能 | 说明 |
|---|---|
| 原生聊天界面 | 左右气泡、时间戳、发送状态（发送中/已提交/发送失败）|
| Markdown 轻量渲染 | ```代码块```、**粗体**、`行内代码`（不引入完整 Markdown 库）|
| 本地历史 | 私有目录 JSON，上限 500 条，冷启动自动加载 |
| 断线自动重连 | 指数退避 1s→30s，20s 心跳保活 |
| 消息通知 | 助手回复且 App 不在前台时提醒（Android 13+ 需授权）|
| 中断 | 可中止当前回合 |
| 连接设置 | 地址 + 密钥，持久化，冷启动自动重连 |

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

### 方式 A：USB 反向转发（推荐，无需 WiFi、无需防火墙）

1. 电脑上运行 `node scripts\start-mobile-bridge.mjs`（默认走 `adb reverse`）
2. **保持 CLI 窗口不关闭**（桥接随进程存活，见下文「生命周期」）
3. 手机插着 USB，打开本 App，地址栏填 `http://127.0.0.1:5680`，回车

流量走 USB 线，不受防火墙约束、不要求手机与电脑同 WiFi。

### 方式 B：局域网

1. 电脑上运行 `node scripts\start-mobile-bridge.mjs --lan`
2. 手机连**同一 WiFi**
3. 打开本 App，地址栏填 `http://<电脑IP>:5680`，回车
   - IP 用 `verify-mobile.mjs` 输出的那个（本机为 `192.168.0.106`）
   - 需事先放行防火墙，并把 WLAN 设为 Private（否则 Public 策略拦入站）

地址会记住，下次直接连。

## 排障

| 现象 | 原因 | 处理 |
|---|---|---|
| `ERR_CONNECTION_REFUSED` | 桥接进程已退出，或连错端口 | 确认 CLI 在跑；端口必须是 **5680** |
| 页面 404 | 连到了 5678 | 5678 是本地桥接骨架，只提供 WS，无页面 |
| 一直转圈 / 连不上 | 防火墙拦截 | 见 `docs/mobile-verify.md` §步骤 2；或把 WLAN 设为 Private |
| 发消息无回复 | 非交互模式 | CLI 必须是交互模式（有 REPL），`-p` 模式队列不消费 |

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
| 认证 | 建议设 `CLAUDE_CODE_MOBILE_SECRET`，否则同局域网任何设备可控制本机 |
| 适用场景 | **仅可信局域网**。不要在公共 WiFi 使用 |
