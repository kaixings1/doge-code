# Cosmic-IDE 整合 19 个 Agent/IDE APP 计划（需求 1-15）

生成时间: 2026-10-16
状态: 排查中（3 个调研代理后台运行，回填具体来源）
目标: 把 19 个同类 APP 的设置/Agent/IDE 能力收敛进 Cosmic-IDE 单 app，分批可编译可回滚。

---

## 一、Cosmic-IDE 现状审计（已亲读源码确认）

### 已具备
- 设置页 7 类：编辑器 / 编译器 / 扩展 / 终端 / 工具链 / About / Agent（SettingsScreen.kt + SettingsCategory）
- Agent 设置屏（AgentSettingsScreen.kt）：本地 LLM 后端三项（Mock/MNN/llama.cpp）、模型目录、WS secret、PRoot rootfs、连接模式三模式（LAN/APIKEY/TAILSCALE）
- 连接屏（SessionConnectScreen.kt）：LAN 端口扫描 + 历史会话 + 手动输入 + 三模式；缺浏览/测试/切换按钮
- agent-chat feature：BridgeClient/Protocol、ConnectionStrategy、LanScanner、KnownSessionStore（多会话持久化 MAX=50）、本地推理（LlamaBackend/LocalInferenceEngine/LocalModelCatalog）、ProotLauncher、VoiceAnnouncer（TTS）、ChatScreen/ChatHost
- 编辑器：Rosemoe Sora + TextMate 语法高亮（Editor.kt 等）；双指缩放已在终端（onZoom）有雏形
- 编译：TaskScreen.kt 用终端视图输出编译日志（满足需求 8 一半），但无"按日志自动定位行/列"
- Git 插件：GitPlugin.kt + GitScreen（History/Changes/Branches/Settings 四 tab）—— 需求 10 部分满足，缺独立 diff 视图/行内对比
- 空项目插件：EmptyProjectPlugin.kt（项目名称 + 模板 empty/kotlin/java/python/cxx），缺示例程序（需求 9）、缺环境缺失提醒（需求 7）
- 环境安装：InstallResourceScreen（bootstrap）、TerminalSetupScreen、JDKSettingsPanel；PRoot 缺失有提示但无进度/重复/清除（需求 13）

### 用户判断已验证的缺口（待补）
- 设置页"简陋"：仅 7 类，无通用项（主题/字体/语言/通知/权限/快捷键/代理/数据清理）
- 连接屏无地址浏览选择器（需求 2）、无测试连接按钮（需求 5）、无切换连接按钮（需求 5）
- 透明背景（需求 1）、图片/图标按钮（需求 6 一半）、示例程序（需求 9）、环境自动检查+安装界面（需求 13）、附加键盘+自定义快捷键+多剪贴板（需求 11）、标签页+双指放大（需求 12）、git diff（需求 10 一半）

---

## 二、需求分解 → 可执行任务（带优先级/依赖）

### 批次 1（基础体验，低风险，先行）
- [ ] 需求1 透明背景：排查 Compose Dialog/BottomSheet/Scaffold 背景是否透明，统一用 MaterialTheme.colorScheme.surfaceContainer。
  - 借鉴：OmniBot `Settings.kt` 的 `wallTransparency`（透明背景开关）、moke `MainActivity.kt:65,91`（`Color.TRANSPARENT` 透明系统栏）、Conch `ChatPipView`/`Pip`（悬浮画中画透明聊天窗）
- [ ] 需求2 地址/路径浏览器：连接地址 + rootfs 路径 + 项目目录输入框加文件选择器（DirectoryPicker）/历史下拉。
- [ ] 需求5 连接按钮组：连接屏加「默认值快捷」「测试连接」「切换连接」三按钮。

### 批次 2（设置页扩充）
- [ ] 需求3 移植他人设置页：从 19 APP 提取通用设置项（主题/字体大小/语言/通知/权限/代理/快捷键/数据清理/云同步）并入设置分类。
- [ ] 需求4 搬入 Agent 功能：连接管理/多会话切换/工具调用/本地推理/权限请求/通知/中断/历史/TTS/文件读写/命令执行 等从各 APP 吸收。
- [ ] 需求6 图片图标按钮：编辑器/聊天加图片查看与图标按钮（图标资源排查）。

### 批次 3（IDE 能力）
- [ ] 需求8 编译日志+行号定位：在 TaskScreen 日志基础上加解析器（正则匹配 `file:line:col` 错误），点击跳转到编辑器对应行列。
- [ ] 需求9 示例程序：每语言（kotlin/java/python/cxx）加最小示例；Java 加可打包安装到手机的示例（Gradle/APK 模板）。
- [ ] 需求10 git diff：GitScreen 加 diff 视图（行内增减对比），复用 GitPlugin 已有能力。
- [ ] 需求7 环境缺失提醒安装：空项目含源程序执行时环境缺失→弹安装选项，多次机会，设置中也有入口。

### 批次 4（交互增强）
- [ ] 需求11 附加键盘+自定义快捷键+多剪贴板：编辑器加可左右滑的额外键栏 + 快捷键自定义 + 多剪贴板面板。
- [ ] 需求12 标签页+双指放大：编辑器/终端多标签页；双指缩放适配编辑器（终端已有 onZoom）。

### 批次 5（环境安装闭环）
- [ ] 需求13 环境自动检查+安装界面：默认时机（启动/打开项目/编译前）检查环境，缺失自动弹安装界面，含进度/可重复安装/清除（清除前确认）。

---

## 三、19 APP 能力来源映射（待 3 个调研代理回填）
- 组A Claude/Codex 系：claude-code-android, ClaudeCodeOnPhone, ClawPhone, codex-android, codex-mobile-oneapk, Conch, Collie, NanoBot-Android, yachiyo-claw, Shelly
- 组B 其他 Agent 前端：Lyra-Code, OmniBot, Operator-on-Android, Pocket-Agent-CLI, ZorvAI, sesori, openclaude-mobile, opencode-mobile, opencode-termux, keva-app
- 组C IDE/编译/终端：and-code, buddy-android, debroid, mobby, moke, opencode-android-apk, pairlet, termux-ai-app, mobile-harness, AidLearning, anycoding, acornix, kammel-ssh, rish-app, termux-*, happy-*, ccpocket, droid-gcli, pocketcode, Android-Use-Agent, artemis

（已亲检源码确认的可借鉴来源，括号内为关键文件）

### 需求2 地址/路径浏览器 → 借鉴
- Pocket-Agent-CLI `FolderBrowser.kt`（目录浏览）
- termux-ai-app `FilePickerActivity.java` / `FilePickerDialog.java`（文件/目录选择器 SAF）
- kammel-ssh `folder_picker_dialog.dart`；Lyra-Code `WorkspaceFilePickerTest.kt`
- Conch `SettingsSectionFiles.kt`（设置内文件段）
- **opencode-mobile `stores/connections.ts`**：`recentDirectories`（最近目录历史）、`clientForDirectory`、`switchDirectory`（目录/连接切换，需求5切换同源）
- 落地：连接地址输入 → 历史地址下拉 + 扫描结果快捷选；rootfs/项目目录 → SAF 目录选择器

### 需求3 通用设置项（移植他人设置页）→ 借鉴（重点范本）
- **Lyra-Code `ui/settings/SettingsScreens.kt:441-487` + `data/settings/AppSettings.kt`**：最完整设置页范本（API Profile/baseUrl/apiKey、主题 themeMode+dynamicColor、languageMode、fontScaleMode、下载完成通知、Termux 权限提示隐藏、子 Agent、MCP/SSH/Termux、WebDAV、系统提示词、记忆、技能包、Agent 工具、备份…）
- **Conch `SettingsScreen.kt` 分多 Section**（`SettingsSectionConnection/Input/Privacy/Security/Bridge/ChatDefaults/About/Files` + `SettingsViewModel.kt`）：模块化设置范式，ThemeMode{SYSTEM,LIGHT,DARK,CUSTOM}+AccentHex、AgentApprovalMode{PLAN,SAFE,AUTO,YOLO}、SkNotificationVisibility{PUBLIC,PRIVATE,SECRET}
- **codex-android `ProxyScreens.kt:74`**：代理配置（HttpProxyAuth/ProxyTlsPolicy/PrivateKeyUri）
- buddy-android `Prefs.java` / `Theme.java` / `AppPermissionsActivity.java` / `SetupActivity.java`
- Conch `AppPreferences.kt`（完整偏好类，含主题/字体/语言/代理等）
- 落地：在 SettingsCategory 下新增「外观(主题/字体大小/深色)」「通知」「权限」「代理/网络」「数据(清理缓存/导出)」分类或并入现有分类

### 需求4 搬入 Agent 功能 → 借鉴
- codex-android `SubAgentsPanelTest.kt` / `SubAgentPresentationTest.kt`（多子 Agent 面板/展示）；多会话组织/搜索/分叉/归档（`ServerHub`）
- claude-code-android 安全模型文档 `security-model.md` / `ssrf-guard.md` / `fingerprint-gate.md`（权限/SSRF/指纹 gate）
- **Conch**：`AgentSessionManager`/`SubagentRoster`、审批三模式、统一 diff 解析 `UnifiedDiffParser`、语法高亮 `CodeHigh.kt`、TTS、SSH 安全密钥+连接池、权限请求、后台通知
- **opencode-mobile `stores/`**：`sessions.ts`(多会话)/`catalog.ts`(工具目录)/`notifications.ts`(通知)/`model-selection.ts`；sesori `approval registry`(权限批准)
- **ZorvAI**：`workflow/TriggerEngine`+`WorkflowEngine`(工作流)、`plugin/PluginRuntime`、本地 ASR/TTS `SherpaNcnn.kt`
- Cosmic-IDE 自身已有：多会话 KnownSessionStore、本地推理引擎、TTS、PRoot、中断；需补齐：工具调用可视化、权限请求 UI、子 Agent 编排、审批模式

### 需求5 连接默认值/测试/切换按钮 → 借鉴
- **opencode-mobile `stores/connections.ts`**：`activeConnection` + `testConnection`(12s 超时探测) + `switchDirectory`/`recentDirectories`（连接测试+切换+最近目录，直接范本）
- **openclaude-mobile `screens/connection_screen.dart` + `models/connection_config.dart`**（serverUrl+secret 连接 Doge 桥接）
- SessionConnectScreen.kt 已有模式切换与手动连接；需补：默认值快捷（回填最近/默认地址）、测试连接（先 WS 握手探测再连，参考 testConnection 逻辑）、切换连接（已连接时显示「断开/切换」按钮，进入只读查看态）

### 需求6 图片/图标按钮 + 语法高亮 → 借鉴
- **Conch `CodeHigh.kt`**（语法高亮渲染）+ `ImageAnnotator`（图片标注/查看）+ `ChatPipView`/`Pip`（悬浮画中画透明聊天窗，关联需求1）
- buddy-android `Bubble.java` / `Ui.java` / `VoiceBar.java`（图标按钮/语音条）
- codex-mobile-oneapk `CodexMobileScreen.kt` / `CodexMobileModels.kt`（聊天/工具按钮定义）
- 语法高亮：Cosmic-IDE 已有 Sora+TextMate，需确认默认开启与更多语言覆盖；可参考 Conch CodeHigh/Collie 变更 diff 高亮

### 需求7 环境缺失提醒安装(多次机会) → 借鉴
- and-code `RuntimeAutoStartPolicyTest.kt` / `LocalRuntimeEnvironmentActivation.kt`（运行时环境自动激活/缺失检测）
- **OmniBot `terminal/setup/EnvironmentSetupLogic.kt:33-52`**（环境安装检测+包探测 node/npm/git/python/codex/claude_code/opencode/ssh）
- **yachiyo-claw**：本地模型中心（下载/断点续传/校验）、权限模式（手动/AI 预审/全自动）、沙箱 PRoot
- 落地：空项目含源程序运行/编译前检测 JDK/工具链/rootfs，缺失弹「安装」选项（多次机会）；设置中常驻「环境」入口可重复触发

### 需求8 编译日志+行号定位 → 自建 + 借鉴
- 未在其他 APP 找到现成 `file:line:col` 解析器；**Conch `UnifiedDiffParser`**（统一 diff 解析，可借鉴其解析思路）、codex-android「文件差异按文件查看」（可借鉴错误定位 UI）
- 基于 TaskScreen 终端日志自建正则解析（匹配 `path:line:col` / `error:`），点击跳转到编辑器对应行列。Cosmic-IDE 编译已用终端输出日志（半满足），缺解析跳转

### 需求9 示例程序 → 借鉴
- Cosmic-IDE 自身 `EmptyProjectPlugin.kt` / `CustomProjectTypePlugin.kt`（模板机制已具备）
- debroid `sample-app/`（可安装到手机的 Android 示例工程，Java 可参考打包 APK）
- AidLearning `gui_wizard/helloworld.py`（示例工程模板范式）
- 落地：每语言模板加最小可运行示例；Java 模板加 Gradle+AndroidManifest 可打包安装示例

### 需求10 git diff → 借鉴
- Cosmic-IDE 已有 GitPlugin（History/Changes/Branches/Settings 四 tab）
- **kammel-ssh `git_diff_sheet.dart` / `git_panel_sheet.dart`**（git diff/panel sheet 范本）、Conch `UnifiedDiffParser`（统一 diff 解析）
- 需补独立 diff 视图（行内增减对比），复用 GitPlugin 已有能力

### 需求11 附加键盘+自定义快捷键+多剪贴板 → 借鉴
- **OmniBot `ReTerminal/.../com/rk/settings/Settings.kt`**：`virtualKeys`、`shortcuts_enabled` + `getShortcutBinding`（自定义快捷键）、`haptic_keys`
- anycoding `ShortcutStore.kt` / `TerminalActivity.kt`（快捷键存储）、`KeyHandler`（终端快捷键）
- **Conch `KeyShortcuts`**（快捷键盘）、Collie 特殊键键盘（Esc/Ctrl+C/方向/自定义和弦/预设 Claude/Vim）
- buddy-android `TerminalActivity.java`（额外键栏）、`RadialMenu.java`（径向菜单，可作自定义键）
- 落地：编辑器底附加键栏（Ctrl/方向/符号），可左右滑翻页；快捷键自定义持久化；多剪贴板面板点选粘贴

### 需求12 标签页+双指放大 → 借鉴
- and-code `WorkspaceTabManager.kt`（工作区多标签）
- codex-mobile `new_session_tab.dart`（会话标签）、termux-ai-app `TabbedTerminalActivity.java`（终端多标签）
- Collie `space/tab/pane`（标签页/分栏范式）
- 落地：编辑器/终端多标签页；双指缩放——终端已有 onZoom，编辑器适配 pinch-to-zoom

### 需求13 环境自动检查+安装界面 → 借鉴
- and-code `VoskModelInstaller.kt` / `VoskModelStore.kt` / `AndroidSetupScreen.kt`（模型/环境安装+进度+存储）
- OmniBot `EmbeddedRuntimeInstaller.kt`；Shelly `llamacpp-setup.ts` / `env-manager.ts` / `BuildsModal.tsx`（安装进度弹窗+重装+清理）
- **Conch `LinuxInstaller`**（Linux 环境安装+下载管理+进度）、yachiyo-claw 本地模型中心（断点/校验/镜像）
- 落地：默认时机（启动/开项目/编译前）触发 `isEnvironmentIncomplete()`；缺失弹安装界面含进度条/可重复安装/清除(清除前确认)

---

## 四、最高价值范本（执行时优先直奔这些参考实现）

| 需求 | 最贴近的 Kotlin/Compose 范本 | 关键文件 |
|---|---|---|
| 设置页完整范本 | Lyra-Code | `ui/settings/SettingsScreens.kt:441-487` + `data/settings/AppSettings.kt` |
| 模块化设置范式 | Conch | `SettingsScreen.kt` 多 Section + `SettingsViewModel.kt` |
| 连接测试+切换+最近目录 | opencode-mobile | `stores/connections.ts`（testConnection/switchDirectory/recentDirectories） |
| 子 Agent/多会话编排 | codex-android / Conch | `SubAgentsPanel` / `AgentSessionManager`+`SubagentRoster` |
| 语法高亮+图片+悬浮窗 | Conch | `CodeHigh.kt` / `ImageAnnotator` / `ChatPipView` |
| 环境检测+安装进度+清理 | and-code / OmniBot / Shelly | `VoskModelInstaller.kt` / `EnvironmentSetupLogic.kt` / `BuildsModal.tsx` |
| git diff 视图 | kammel-ssh / Conch | `git_diff_sheet.dart` / `UnifiedDiffParser` |
| 附加键盘+自定义快捷键 | OmniBot / Conch | `Settings.kt`(virtualKeys/shortcuts_enabled) / `KeyShortcuts` |
| 标签页 | and-code / termux-ai-app | `WorkspaceTabManager.kt` / `TabbedTerminalActivity.java` |
| 透明背景开关 | OmniBot / moke | `wallTransparency` / `Color.TRANSPARENT` |
| 可装手机示例工程 | debroid | `sample-app/`（Android 可打包 APK） |

结论：Kotlin/Compose 系中 Conch 与 codex-android 是功能最全、最贴近 Cosmic-IDE 架构的参考实现；Lyra-Code 提供最完整的设置页范本；opencode-mobile 提供连接测试/切换/最近目录的清晰 store 实现；OmniBot 提供环境安装+透明/字体/快捷键的 Settings 范式。优先吸收这四者，其余按需拾遗。
