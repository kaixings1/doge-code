# doge-code 移动端外壳（Android）

WebView 封装 CLI 内置的对话页面（`http://<host>:5680`）。**不重写任何对话逻辑** ——
页面、WebSocket、入站注入全部由 CLI 侧提供（见 `docs/mobile-verify.md`）。

## 为什么是 WebView 壳而不是原生 App

`docs/mobile-verify.md` 已说明：手机端对话刻意选择浏览器方案，以避免引入
JDK / Android SDK / Flutter 工具链。本目录是**可选的外壳**，仅在你希望
「装成 App、有图标、不用每次输地址」时使用。功能上等价于手机浏览器打开
`http://<host>:5680`。

## 前置：编译环境

编译 APK 需要（本机当前**全部缺失**，需自行安装）：

| 组件 | 版本要求 | 校验命令 |
|---|---|---|
| JDK | 17 或以上 | `java -version` |
| Android SDK | Platform 34 + Build-Tools | `echo %ANDROID_HOME%` |
| Gradle | 8.5+（或用下面的一键脚本） | `gradle -v` |

最快的安装方式是装 **Android Studio**（自带 JDK 与 SDK），装完在
`Settings → SDK Manager` 确认 Platform 34 已安装。

## 编译

在 `android/` 目录下：

```cmd
gradle assembleDebug
```

产物：`app\build\outputs\apk\debug\app-debug.apk`

若本机装了 Android Studio，也可直接 `File → Open` 选本目录，点 ▶ 运行到手机。

## 安装到手机

手机已开 USB 调试时：

```cmd
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

或把 apk 拷到手机手动安装（需允许「安装未知来源应用」）。

### MIUI / Redmi 安装被拒（本机实测遇到过）

`adb shell id` 显示 `uid=2000(shell)`（无特权）时，MIUI 会拒绝安装，
报 `INSTALL_FAILED_USER_RESTRICTED` 或类似错误。**必须先在手机上开启：**

```
设置 → 更多设置 → 开发者选项
  → 「USB 调试(安全设置)」   ← 安装 APK 的硬门槛，不开则任何 adb 安装都会被拒
  → 「USB 安装」（允许通过 USB 安装应用）
```

部分 MIUI 版本开启「USB 调试(安全设置)」需要登录小米账号并插入 SIM 卡。
这是 MIUI 的系统策略，**无法用 adb 命令绕过** —— 只能手动开。

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
