# 飞书远程控制集成计划

## 调研发现

### GitHub 相关项目

| 项目 | 星标 | 说明 |
|------|------|------|
| [larksuite/openclaw-lark](https://github.com/larksuite/openclaw-lark) | 2350 | **飞书官方出品** OpenClaw 飞书 Channel 插件，基于 OpenClaw Plugin SDK |
| [zarazhangrui/lark-coding-agent-bridge](https://github.com/zarazhangrui/lark-coding-agent-bridge) | 2174 | 轻量桥接飞书与 Claude Code/Codex CLI，支持流式卡片、会话管理 |
| [deepcoldy/botmux](https://github.com/deepcoldy/botmux) | 1001 | 飞书遥控 AI 编程 CLI，功能最全但较重（独立 daemon 进程） |

### 选型结论

**不直接集成外部项目**，而是：
- 复用 `larksuite/openclaw-lark` 的飞书官方 SDK (`@larksuiteoapi`) 和消息格式
- 参考 `lark-coding-agent-bridge` 的轻量桥接模式
- 基于现有 `src/bridge/` 架构实现，保持代码库一致性

## 架构设计

```
┌──────────────┐  Webhook/WebSocket  ┌──────────────────┐  Bridge协议  ┌──────────────┐
│  飞书 App    │ ◀─────────────────▶ │ src/services/     │ ──────────▶ │ Claude Code  │
│  (用户输入)  │                     │  feishu/          │             │  本机程序     │
└──────────────┘                     └──────────────────┘             └──────────────┘
                                           │
                                           ▼
                                    src/bridge/
                                    feishuBridge.ts
```

## 文件清单

### 新建文件（src/services/feishu/）

| 文件 | 功能 | 参考 |
|------|------|------|
| `index.ts` | FeishuBridge 主入口 | mobileBridge.ts |
| `feishuApiClient.ts` | 飞书 API 客户端（发消息、卡片） | larksuite/openclaw-lark |
| `feishuWebhook.ts` | Webhook 处理器（签名验证、事件分发） | lark-coding-agent-bridge |
| `feishuMessageAdapter.ts` | 飞书消息 ↔ 内部消息格式转换 | mobileProtocol.ts |
| `feishuCommandMapper.ts` | 飞书文本命令 → Bridge 请求映射 | mobileProtocol.ts |

### 修改现有文件

| 文件 | 改动 |
|------|------|
| `src/commands.ts` | 注册 `install-feishu-app` 命令 |
| `src/bridge/bridgeEnabled.ts` | 添加 `FEISHU_BRIDGE` 检测 |
| `src/bridge/bridgeConfig.ts` | 添加飞书配置项 |

### 新建命令（src/commands/install-feishu-app/）

| 文件 | 功能 |
|------|------|
| `index.ts` | 命令注册 |
| `install-feishu-app.tsx` | 安装向导 UI |

## 依赖

```
npm install @larksuiteoapi/node-sdk
```

## 实施步骤

### Phase 1：核心通信层（src/services/feishu/）

1. **feishuApiClient.ts** — 飞书 API 客户端
   - 使用 `@larksuiteoapi/node-sdk`
   - 发送文本消息、卡片消息
   - 上传图片/文件

2. **feishuMessageAdapter.ts** — 消息格式转换
   - 飞书消息 → 内部 `BridgeMessage`
   - 内部回复 → 飞书卡片/文本
   - 支持 @mention、图片、文件

3. **feishuWebhook.ts** — Webhook 处理器
   - 签名验证（飞书 Challenge 验证）
   - 事件分发（`im.message.receive_v1`）
   - 长连接 fallback（WebSocket）

4. **feishuCommandMapper.ts** — 命令映射
   - `/help` → help
   - `/status` → status
   - `/run <cmd>` → execute
   - `/read <file>` → readFile
   - `/ls [path]` → listFiles
   - 普通文本 → sendMessage（作为 prompt）

5. **index.ts** — FeishuBridge 主类
   - 桥接 Webhook → Bridge 系统
   - 会话管理（每个飞书用户/群独立会话）
   - 心跳和重连

### Phase 2：Bridge 集成

- `feishuBridge.ts` 连接 `feishuBot` ↔ `bridgeMain`
- 复用 `MobileRequest` / `MobileResponse` 协议
- 环境变量：`FEISHU_BRIDGE=1`, `FEISHU_APP_ID`, `FEISHU_APP_SECRET`

### Phase 3：安装向导

- `install-feishu-app` 命令
- 输入 App ID / Secret
- 配置 Webhook URL
- 自动验证连接

### Phase 4：测试

- 353 个现有测试保持通过
- 新功能手动测试

## 飞书开放平台配置

用户需手动完成：
1. 创建企业自建应用 → 启用机器人能力
2. 获取 App ID / App Secret
3. 配置事件订阅（`im.message.receive_v1`）
4. 配置 Request URL（Webhook 回调）
5. 发布应用

## 风险评估

| 风险 | 应对 |
|------|------|
| Webhook 需公网 | 支持长连接模式（飞书 SDK 内置） |
| 消息长度限制 4KB | 结果分片发送 |
| 与 mobileBridge 冲突 | 独立环境变量 `FEISHU_BRIDGE=1` |
