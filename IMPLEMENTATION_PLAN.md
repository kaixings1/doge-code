# 功能实现超详细计划

> 基于 todo_electron_desktop.md 中 24 个未实现功能
> 创建时间: 2026-08-02
> 目标: 将所有 [ ] 功能实现并集成到 Electron 桌面应用

---

## 📊 总览

| 类别 | 数量 | 状态 |
|------|------|------|
| 5.2 AI 工作流 | 1 | ⏳ 待实现 |
| 5.4 协作功能 | 4 | ⏳ 待实现 |
| 5.4 远程协助 | 2 | ⏳ 待实现 |
| 5.6 插件系统 | 2 | ⏳ 待实现 |
| 5.6 主题系统 | 4 | ⏳ 待实现 |
| 5.6 外部集成 | 5 | ⏳ 待实现 |
| 5.7 安全与隐私 | 6 | ⏳ 待实现 |
| 5.8 性能优化 | 4 | ⏳ 待实现 |
| **总计** | **28** | **⏳ 待实现** |

---

## 🔴 第一批：协作基础设施（复用协作房间系统）

### 1.1 权限管理（只读/编辑/管理员）
**文件：**
- `desktop/src/main/index.ts` — 修改 collabRooms Map，添加 permissions 字段
- `desktop/src/preload/index.ts` — 添加权限检查 API
- `desktop/src/renderer/components/CollaborationPanel.tsx` — 权限 UI

**实现：**
1. 在 collabRooms 的 session 中添加 `permissions: Map<string, 'read' | 'write' | 'admin'>`
2. 创建者默认为 admin
3. 新增 IPC: `doge:collab-set-permission`, `doge:collab-get-permission`
4. 在 CollaborationPanel 中添加权限管理 UI（下拉菜单选择权限）
5. 编辑操作前检查权限

### 1.2 代码审查评论系统
**文件：**
- `desktop/src/main/index.ts` — 添加 codeReview IPC handlers
- `desktop/src/preload/index.ts` — 添加 codeReview API
- `desktop/src/renderer/components/CodeReviewPanel.tsx` — 新组件

**实现：**
1. 基于现有评论系统，添加 `reviewId` 和 `severity` 字段
2. 新增 IPC: `doge:code-review-start`, `doge:code-review-add-comment`, `doge:code-review-resolve`
3. CodeReviewPanel 显示文件 diff + 评论 + 严重级别
4. 支持 inline comments（行内评论）

### 1.3 问题标记系统
**文件：**
- `desktop/src/main/index.ts` — 添加 issues IPC handlers
- `desktop/src/preload/index.ts` — 添加 issues API
- `desktop/src/renderer/components/IssuesPanel.tsx` — 新组件

**实现：**
1. 问题数据结构：`{ id, title, description, severity, assignee, status, createdAt }`
2. 新增 IPC: `doge:issue-create`, `doge:issue-update`, `doge:issue-list`, `doge:issue-close`
3. IssuesPanel 显示问题列表，支持筛选/排序/编辑
4. 问题可与代码行关联

### 1.4 评论通知系统
**文件：**
- `desktop/src/main/index.ts` — 添加 notifications IPC handlers
- `desktop/src/preload/index.ts` — 添加 notifications API
- `desktop/src/renderer/components/NotificationsPanel.tsx` — 新组件

**实现：**
1. 通知数据结构：`{ id, type, message, from, timestamp, read }`
2. 新增 IPC: `doge:notify-list`, `doge:notify-mark-read`, `doge:notify-unread-count`
3. 评论回复/提及时自动创建通知
4. NotificationsPanel 显示通知列表 + 红点未读数

---

## 🟡 第二批：实时通信（复用 WebRTC 基础设施）

### 2.1 语音通话
**文件：**
- `desktop/src/main/remoteSignaling.ts` — 扩展信令协议支持音频
- `desktop/src/renderer/components/RemoteControlPanel.tsx` — 添加音频轨道
- `desktop/src/renderer/components/VoiceCallPanel.tsx` — 新组件

**实现：**
1. 扩展 WebRTC PeerConnection 支持音频轨道
2. 使用 `navigator.mediaDevices.getUserMedia({ audio: true })` 获取麦克风
3. 新增信令消息类型: `audio-offer`, `audio-answer`, `audio-ice-candidate`
4. VoiceCallCallPanel 显示通话界面（静音/挂断/音量控制）
5. 基于现有 RemoteSignalingServer 转发音频信令

### 2.2 会话录制
**文件：**
- `desktop/src/main/index.ts` — 添加 recording IPC handlers
- `desktop/src/preload/index.ts` — 添加 recording API
- `desktop/src/renderer/components/RecordingPanel.tsx` — 新组件

**实现：**
1. 录制数据结构：`{ sessionId, startTime, events: Array<{type, data, timestamp}> }`
2. 新增 IPC: `doge:recording-start`, `doge:recording-stop`, `doge:recording-list`, `doge:recording-play`
3. 录制所有协作事件（编辑/评论/光标移动）
4. RecordingPanel 显示录制列表 + 回放控制
5. 使用 electron desktopCapturer 录制屏幕

---

## 🟢 第三批：插件系统增强

### 3.1 插件开发 SDK
**文件：**
- `desktop/src/main/pluginManager.ts` — 扩展为完整 SDK
- `desktop/src/plugins/sdk/` — 新建 SDK 目录
- `desktop/src/plugins/sdk/index.ts` — SDK 入口
- `desktop/src/plugins/sdk/types.ts` — SDK 类型定义
- `desktop/src/plugins/sdk/api.ts` — SDK API

**实现：**
1. 定义 SDK 接口：`PluginManifest`, `PluginContext`, `PluginAPI`
2. 提供 `registerCommand()`, `registerTool()`, `registerHook()` 方法
3. 提供 `getConfig()`, `setConfig()`, `log()` 工具方法
4. 编写 SDK 文档 README.md
5. 提供示例插件模板

### 3.2 插件热加载
**文件：**
- `desktop/src/main/pluginManager.ts` — 添加文件监听
- `desktop/src/preload/index.ts` — 添加热加载 API
- `desktop/src/renderer/components/PluginPanel.tsx` — 添加热加载 UI

**实现：**
1. 使用 `fs.watch()` 监听插件目录变化
2. 新增 IPC: `doge:plugin-hot-reload`, `doge:plugin-watch`
3. 文件变化时自动重新加载插件
4. PluginPanel 显示加载状态 + 手动重载按钮
5. 错误隔离（插件崩溃不影响主程序）

---

## 🔵 第四批：主题系统

### 4.1 主题市场
**文件：**
- `desktop/src/main/index.ts` — 添加主题市场 IPC handlers
- `desktop/src/preload/index.ts` — 添加主题市场 API
- `desktop/src/renderer/components/ThemeMarketplace.tsx` — 新组件

**实现：**
1. 主题数据结构：`{ id, name, author, version, colors, downloads }`
2. 新增 IPC: `doge:theme-marketplace-list`, `doge:theme-install`, `doge:theme-publish`
3. ThemeMarketplace 显示主题列表 + 安装/卸载
4. 主题存储在 `.doge/themes/` 目录
5. 支持从 URL 安装主题

### 4.2 主题编辑器
**文件：**
- `desktop/src/renderer/components/ThemeEditor.tsx` — 新组件

**实现：**
1. 可视化颜色选择器（dark/light 各状态颜色）
2. 实时预览（应用主题到编辑器）
3. 导出/导入主题 JSON
4. 保存到 `.doge/themes/custom/`

### 4.3 图标包
**文件：**
- `desktop/src/renderer/components/IconPackManager.tsx` — 新组件
- `desktop/src/renderer/components/FileTree.tsx` — 集成图标包

**实现：**
1. 图标包格式：`{ name, icons: Map<extension, iconPath> }`
2. 支持自定义文件类型图标
3. IconPackManager 显示已安装图标包 + 安装新包
4. FileTree 使用图标包渲染文件图标

### 4.4 字体设置
**文件：**
- `desktop/src/renderer/theme.ts` — 添加字体配置
- `desktop/src/renderer/components/EditorSettingsPanel.tsx` — 添加字体选择

**实现：**
1. ThemeColors 添加 `fontFamily`, `fontSize`, `editorFontFamily`, `editorFontSize`
2. EditorSettingsPanel 添加字体选择器
3. 编辑器字体/UI 字体分离
4. 持久化到 settings.json

---

## 🟣 第五批：外部服务集成

### 5.1 Slack 集成
**文件：**
- `desktop/src/main/index.ts` — 添加 Slack IPC handlers
- `desktop/src/services/integrations/slack.ts` — Slack 服务
- `desktop/src/renderer/components/SlackPanel.tsx` — Slack UI

**实现：**
1. Slack OAuth 认证流程
2. 发送消息到 Slack 频道
3. 接收 Slack 消息通知
4. 命令执行结果推送到 Slack

### 5.2 Discord 集成
**文件：**
- `desktop/src/services/integrations/discord.ts` — Discord 服务
- `desktop/src/renderer/components/DiscordPanel.tsx` — Discord UI

**实现：**
1. Discord Rich Presence（显示当前文件/项目）
2. Discord Webhook 通知
3. Discord Bot 命令执行

### 5.3 Jira 集成
**文件：**
- `desktop/src/services/integrations/jira.ts` — Jira 服务
- `desktop/src/renderer/components/JiraPanel.tsx` — Jira UI

**实现：**
1. Jira API 认证（API Token）
2. 任务列表/详情查看
3. 任务状态更新
4. 代码提交关联 Jira 任务

### 5.4 Notion 集成
**文件：**
- `desktop/src/services/integrations/notion.ts` — Notion 服务
- `desktop/src/renderer/components/NotionPanel.tsx` — Notion UI

**实现：**
1. Notion API 认证
2. 文档/数据库同步
3. 创建/编辑 Notion 页面

### 5.5 Figma 集成
**文件：**
- `desktop/src/services/integrations/figma.ts` — Figma 服务
- `desktop/src/renderer/components/FigmaPanel.tsx` — Figma UI

**实现：**
1. Figma API 认证
2. 设计稿预览（iframe 或图片）
3. 资源导出（SVG/PNG）

---

## ⚫ 第六批：安全与隐私

### 6.1 端到端加密
**文件：**
- `desktop/src/main/index.ts` — 添加加密 IPC handlers
- `desktop/src/utils/crypto.ts` — 加密工具
- `desktop/src/renderer/components/EncryptionSettings.tsx` — 加密设置 UI

**实现：**
1. 使用 Web Crypto API 生成密钥对
2. 会话数据 AES-GCM 加密
3. 密钥派生（PBKDF2）
4. 加密设置 UI（启用/禁用/更改密码）

### 6.2 双因素认证（TOTP）
**文件：**
- `desktop/src/utils/totp.ts` — TOTP 工具
- `desktop/src/renderer/components/TOTPSetup.tsx` — TOTP 设置 UI

**实现：**
1. 生成 TOTP 密钥 + QR 码
2. 验证 TOTP 码
3. 登录时要求输入 TOTP
4. 备份恢复码

### 6.3 会话锁定
**文件：**
- `desktop/src/main/index.ts` — 添加会话锁定 IPC handlers
- `desktop/src/renderer/components/SessionLock.tsx` — 锁定 UI

**实现：**
1. 空闲超时检测（默认 5 分钟）
2. 锁定屏幕（显示密码输入）
3. 解锁后恢复会话
4. 可配置超时时间

### 6.4 生物识别
**文件：**
- `desktop/src/main/index.ts` — 添加生物识别 IPC handlers
- `desktop/src/renderer/components/BiometricSetup.tsx` — 设置 UI

**实现：**
1. Windows: Windows Hello API
2. macOS: Touch ID via Electron
3. 生物识别作为解锁方式
4. 回退到密码

### 6.5 密钥管理增强
**文件：**
- `desktop/src/main/index.ts` — 添加密钥管理 IPC handlers
- `desktop/src/utils/keychain.ts` — 密钥链工具
- `desktop/src/renderer/components/KeyManager.tsx` — 密钥管理 UI

**实现：**
1. 使用系统密钥链（macOS Keychain/Windows Credential Manager）
2. API 密钥加密存储
3. 密钥轮换
4. 密钥访问日志

### 6.6 安全沙箱增强
**文件：**
- `desktop/src/utils/sandbox/docker-sandbox.ts` — 增强沙箱配置

**实现：**
1. 只读文件系统
2. 网络出口白名单
3. 资源限制（内存/CPU/磁盘）
4. seccomp 配置文件

---

## ⚪ 第七批：性能优化

### 7.1 GPU 加速渲染
**文件：**
- `desktop/electron.vite.config.ts` — 启用 GPU 加速
- `desktop/src/main/index.ts` — 添加 GPU 配置

**实现：**
1. 启用 Chromium GPU 加速
2. 配置 `--ignore-gpu-blocklist`
3. 使用 WebGL 渲染文本
4. 监控 GPU 性能

### 7.2 增量渲染
**文件：**
- `desktop/src/renderer/components/VirtualMessageList.tsx` — 优化渲染

**实现：**
1. 虚拟滚动优化
2. 仅渲染可见区域
3. React.memo 优化
4. 防抖滚动事件

### 7.3 启动快照
**文件：**
- `desktop/scripts/build.mjs` — 添加 V8 快照配置

**实现：**
1. 使用 mksnapshot 生成快照
2. 配置 electron-builder 打包快照
3. 启动时加载快照

### 7.4 增量更新
**文件：**
- `desktop/src/main/index.ts` — 添加增量更新 IPC handlers
- `desktop/src/utils/updater.ts` — 增量更新工具

**实现：**
1. 使用 electron-updater 增量更新
2. 二进制差分更新
3. 后台下载 + 下次启动应用
4. 更新进度显示

---

## 📝 执行顺序

1. **第一批** (协作基础设施) — 复用现有协作系统
2. **第二批** (实时通信) — 复用 WebRTC 基础设施
3. **第三批** (插件系统) — 复用插件管理器
4. **第四批** (主题系统) — 复用主题系统
5. **第五批** (外部集成) — 新建服务层
6. **第六批** (安全) — 新建安全层
7. **第七批** (性能) — 优化现有代码

每批完成后：
1. 运行 `npx tsc --noEmit --skipLibCheck` 验证 TypeScript
2. 运行 `bun run build` 验证构建
3. 提交代码
