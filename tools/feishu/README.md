# 飞书桥接

把飞书消息接进本机 CLI 会话：飞书发消息 → 进命令队列 → 助手回复写回原消息。

支持两种接入方式，**推荐长连接**：

| 方式 | 需要公网地址 | 额外配置 | 适用 |
|---|---|---|---|
| **长连接**（`FEISHU_LONG_CONNECTION=1`） | ❌ 不需要 | 只需 App ID / Secret | 绝大多数场景，NAT/内网也能用 |
| webhook | ✅ 需要穿透 | 回调 URL、Verification Token | 无法使用长连接时 |

---

## 方式一：长连接 + 一次性配对码（推荐）

不需要公网端口，也不需要回调地址。本机主动连飞书。

### 1. 配置（只填两项）

复制 `settings.local.example.json` 到 `.claude/settings.local.json`：

```json
{
  "env": {
    "FEISHU_BRIDGE": "1",
    "FEISHU_APP_ID": "cli_xxxxxxxxxxxxxxxx",
    "FEISHU_APP_SECRET": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "FEISHU_LONG_CONNECTION": "1"
  }
}
```

> 凭证必须走 settings 的 `env`，不要写进 `d.bat`（避免密钥进版本库）。
> 项目级 `.claude/settings.json`（团队共享）不生效——`FEISHU_*` 不在 `SAFE_ENV_VARS` 白名单里。

### 2. 启动并取配对码

```cmd
set DOGE_FEISHU=1
d.bat
```

会话里输入 `/feishu` 查看配对码：

```
📱 飞书配对

配对码：428913
在飞书里私聊机器人，发送：
  /pair 428913

配对码 15 分钟内有效，成功一次后自动失效。
```

### 3. 在飞书完成配对

打开飞书，**私聊机器人**发送 `/pair 428913`。收到「✅ 配对成功」即完成。

绑定写入 `~/.doge/feishu-bind.json`（只存 chat_id / open_id，不含密钥），
**下次启动自动恢复，不用再配对**。

### 4. 之后怎么用

私聊直接发消息即可（群聊需 @机器人）。行为和 `/mobile-connect` 一致：
消息进本机会话队列，助手回复写回飞书。

常用命令：

```
/feishu                  查看配对码与已绑定会话
/feishu unbind <chatId>  解除某个会话的绑定
```

### 开放平台侧

1. 创建自建应用，开通 `im.message.receive_v1` 权限并发布版本。
2. **事件订阅 → 订阅方式选「长连接」**（不要选 webhook）。
3. 无需填写请求地址。

---

## 方式二：webhook（需要公网地址）

模板：`settings.webhook.example.json`。

| 环境变量 | 必填 | 说明 |
|---|---|---|
| `FEISHU_WEBHOOK_PORT` | 否 | 本地回调端口，默认 `9901` |
| `FEISHU_VERIFICATION_TOKEN` | 强烈建议 | 校验回调 `header.token` |
| `FEISHU_ENCRYPT_KEY` | 强烈建议 | 回调体为 AES-256-CBC 密文，需解密 |
| `FEISHU_BOT_OPEN_ID` | 建议 | 群聊只响应 @机器人 |
| `FEISHU_WEBHOOK_URL` | 否 | 公网地址，仅用于展示 |

> ⚠️ 两项鉴权都不配时，回调不做来源校验；端口一旦暴露到公网，等于任何人都能向本机会话注入指令。
> 日志会打印 error 级告警。

开放平台侧：事件订阅选「将事件发送至开发者服务器」，请求地址填
`https://<公网地址>/feishu/webhook`，并配置 Verification Token（和/或 Encrypt Key）。

---

## 已知限制

- **长连接是集群模式**：同一个应用若在多个机器上跑长连接，消息只会随机投递给其中一台。
  多机部署时请给每台机器分配独立应用。
- **回复匹配**：按「先入站先回复」队列匹配。连续快速发多条时，回复可能落到前一条上；
  单问单答与正常节奏的多轮对话不受影响。超过 10 分钟未回复的请求会过期丢弃。
- **仅交互模式**：桥接在 REPL（交互会话）挂载时启动；`-p` 无头模式不会拉起。
