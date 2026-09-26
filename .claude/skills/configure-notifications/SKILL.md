---
name: configure-notifications
description: 通过自然语言配置通知集成（Telegram、Discord、Slack）。
triggers:
  - "configure notifications"
  - "setup notifications"
  - "configure telegram"
  - "setup telegram"
  - "telegram bot"
  - "configure discord"
  - "setup discord"
  - "discord webhook"
  - "configure slack"
  - "setup slack"
  - "slack webhook"
level: 2
---

# 配置通知

配置 OMC 通知集成，这样当会话结束、需要输入或后台任务完成时，你都能收到提醒。

## 路由

根据用户的请求或参数判断其想要哪个服务商：
- 如果触发词或参数包含 "telegram" → 执行 **Telegram** 小节
- 如果触发词或参数包含 "discord" → 执行 **Discord** 小节
- 如果触发词或参数包含 "slack" → 执行 **Slack** 小节
- 如果未指定服务商，使用 AskUserQuestion：

**问题：** "你想配置哪个通知服务？"

**选项：**
1. **Telegram** - 机器人 token + 聊天 ID。移动端和桌面端均可使用。
2. **Discord** - Webhook 或机器人 token + 频道 ID。
3. **Slack** - Incoming webhook URL。

---

## Telegram 配置

配置 Telegram 通知，这样当会话结束、需要输入或后台任务完成时，OMC 可以给你发消息。

### 本技能的工作方式

这是一个交互式、自然语言配置技能。通过 AskUserQuestion 向用户提问，引导其完成配置。将结果写入 `${CLAUDE_CONFIG_DIR:-~/.claude}/.omc-config.json`。

### 步骤 1：检测现有配置

```bash
CONFIG_FILE="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.omc-config.json"

if [ -f "$CONFIG_FILE" ]; then
  HAS_TELEGRAM=$(jq -r '.notifications.telegram.enabled // false' "$CONFIG_FILE" 2>/dev/null)
  CHAT_ID=$(jq -r '.notifications.telegram.chatId // empty' "$CONFIG_FILE" 2>/dev/null)
  PARSE_MODE=$(jq -r '.notifications.telegram.parseMode // "Markdown"' "$CONFIG_FILE" 2>/dev/null)

  if [ "$HAS_TELEGRAM" = "true" ]; then
    echo "EXISTING_CONFIG=true"
    echo "CHAT_ID=$CHAT_ID"
    echo "PARSE_MODE=$PARSE_MODE"
  else
    echo "EXISTING_CONFIG=false"
  fi
else
  echo "NO_CONFIG_FILE"
fi
```

如果发现现有配置，向用户展示当前已配置的内容，并询问其想要更新还是重新配置。

### 步骤 2：创建 Telegram 机器人

如果用户还没有机器人，引导其创建一个：

```
要设置 Telegram 通知，你需要一个 Telegram 机器人 token 和你的聊天 ID。

创建机器人（如果你还没有）：
1. 打开 Telegram 并搜索 @BotFather
2. 发送 /newbot
3. 选择一个名称（例如 "My OMC Notifier"）
4. 选择一个用户名（例如 "my_omc_bot"）
5. BotFather 会给你一个类似这样的 token：123456789:ABCdefGHIjklMNOpqrsTUVwxyz

获取你的聊天 ID：
1. 与你新建的机器人开始对话（发送 /start）
2. 访问：https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates
3. 查找 "chat":{"id":YOUR_CHAT_ID}
   - 个人聊天 ID 是正数（例如 123456789）
   - 群组聊天 ID 是负数（例如 -1001234567890）
```

### 步骤 3：收集机器人 token

使用 AskUserQuestion：

**问题：** "粘贴你的 Telegram 机器人 token（来自 @BotFather）"

用户会在 "Other" 字段中输入其 token。

**校验** token：
- 必须匹配模式：`digits:alphanumeric`（例如 `123456789:ABCdefGHI...`）
- 如果无效，说明格式要求并重新询问

### 步骤 4：收集聊天 ID

使用 AskUserQuestion：

**问题：** "粘贴你的 Telegram 聊天 ID（来自 getUpdates API 的数字）"

用户会在 "Other" 字段中输入其聊天 ID。

**校验** 聊天 ID：
- 必须是数字（个人为正数，群组为负数）
- 如果无效，主动帮助其查找：

```bash
# 帮助用户找到其聊天 ID
BOT_TOKEN="USER_PROVIDED_TOKEN"
echo "正在获取最近消息以查找你的聊天 ID..."
curl -s "https://api.telegram.org/bot${BOT_TOKEN}/getUpdates" | jq '.result[-1].message.chat.id // .result[-1].message.from.id // "未找到消息 - 请先向你的机器人发送 /start"'
```

### 步骤 5：选择解析模式

使用 AskUserQuestion：

**问题：** "你更喜欢哪种消息格式？"

**选项：**
1. **Markdown（推荐）** - 使用 Markdown 语法的粗体、斜体、代码块
2. **HTML** - 使用 HTML 标签的粗体、斜体、代码

### 步骤 6：配置事件

使用带 multiSelect 的 AskUserQuestion：

**问题：** "哪些事件应触发 Telegram 通知？"

**选项（multiSelect: true）：**
1. **会话结束（推荐）** - 当 Claude 会话完成时
2. **需要输入** - 当 Claude 正在等待你的回复时（非常适合长时间运行的任务）
3. **会话开始** - 当新会话启动时
4. **会话持续** - 当持久模式让会话保持存活时

默认选择：session-end + ask-user-question。

### 步骤 7：写入配置

读取现有配置，合并新的 Telegram 设置，然后写回：

```bash
CONFIG_FILE="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.omc-config.json"
mkdir -p "$(dirname "$CONFIG_FILE")"

if [ -f "$CONFIG_FILE" ]; then
  EXISTING=$(cat "$CONFIG_FILE")
else
  EXISTING='{}'
fi

# BOT_TOKEN、CHAT_ID、PARSE_MODE 由用户收集提供
echo "$EXISTING" | jq \
  --arg token "$BOT_TOKEN" \
  --arg chatId "$CHAT_ID" \
  --arg parseMode "$PARSE_MODE" \
  '.notifications = (.notifications // {enabled: true}) |
   .notifications.enabled = true |
   .notifications.telegram = {
     enabled: true,
     botToken: $token,
     chatId: $chatId,
     parseMode: $parseMode
   }' > "$CONFIG_FILE"
```

#### 如果用户未选择全部事件，添加针对具体事件的配置：

对每个未被选择的事件，将其禁用：

```bash
# 示例：如果未选择 session-start，则将其禁用
echo "$(cat "$CONFIG_FILE")" | jq \
  '.notifications.events = (.notifications.events // {}) |
   .notifications.events["session-start"] = {enabled: false}' > "$CONFIG_FILE"
```

### 步骤 8：测试配置

写入配置后，主动提出发送一条测试通知：

使用 AskUserQuestion：

**问题：** "发送一条测试通知以验证配置？"

**选项：**
1. **是，立即测试（推荐）** - 向你的 Telegram 聊天发送一条测试消息
2. **否，我稍后测试** - 跳过测试

#### 如果测试：

```bash
BOT_TOKEN="USER_PROVIDED_TOKEN"
CHAT_ID="USER_PROVIDED_CHAT_ID"
PARSE_MODE="Markdown"

RESPONSE=$(curl -s -w "\n%{http_code}" \
  "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
  -d "chat_id=${CHAT_ID}" \
  -d "parse_mode=${PARSE_MODE}" \
  -d "text=OMC 测试通知 - Telegram 已配置成功！")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)

if [ "$HTTP_CODE" = "200" ]; then
  echo "测试通知发送成功！"
else
  echo "失败（HTTP $HTTP_CODE）："
  echo "$BODY" | jq -r '.description // "未知错误"' 2>/dev/null || echo "$BODY"
fi
```

报告成功或失败。常见问题：
- **401 Unauthorized**：机器人 token 无效
- **400 Bad Request: chat not found**：聊天 ID 错误，或者用户尚未向机器人发送 `/start`
- **Network error**：检查到 api.telegram.org 的网络连通性

### 步骤 9：确认

展示最终配置摘要：

```
Telegram 通知配置完成！

  机器人:     @your_bot_username
  聊天 ID:    123456789
  格式:       Markdown
  事件:       session-end, ask-user-question

配置已保存至: ~/.claude/.omc-config.json

你也可以通过环境变量设置这些值:
  OMC_TELEGRAM_BOT_TOKEN=123456789:ABCdefGHI...
  OMC_TELEGRAM_CHAT_ID=123456789

重新配置: /oh-my-claudecode:configure-notifications telegram
配置 Discord: /oh-my-claudecode:configure-notifications discord
配置 Slack: /oh-my-claudecode:configure-notifications slack
```

### 环境变量替代方案

用户可以在自己的 shell 配置文件中设置环境变量，完全跳过此向导：

```bash
export OMC_TELEGRAM_BOT_TOKEN="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
export OMC_TELEGRAM_CHAT_ID="123456789"
```

通知系统会自动检测环境变量，无需 `.omc-config.json`。

---

## Discord 配置

配置 Discord 通知，这样当会话结束、需要输入或后台任务完成时，OMC 可以提醒你。

### 本技能的工作方式

这是一个交互式、自然语言配置技能。通过 AskUserQuestion 向用户提问，引导其完成配置。将结果写入 `${CLAUDE_CONFIG_DIR:-~/.claude}/.omc-config.json`。

### 步骤 1：检测现有配置

```bash
CONFIG_FILE="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.omc-config.json"

if [ -f "$CONFIG_FILE" ]; then
  # 检查是否已有 discord 配置
  HAS_DISCORD=$(jq -r '.notifications.discord.enabled // false' "$CONFIG_FILE" 2>/dev/null)
  HAS_DISCORD_BOT=$(jq -r '.notifications["discord-bot"].enabled // false' "$CONFIG_FILE" 2>/dev/null)
  WEBHOOK_URL=$(jq -r '.notifications.discord.webhookUrl // empty' "$CONFIG_FILE" 2>/dev/null)
  MENTION=$(jq -r '.notifications.discord.mention // empty' "$CONFIG_FILE" 2>/dev/null)

  if [ "$HAS_DISCORD" = "true" ] || [ "$HAS_DISCORD_BOT" = "true" ]; then
    echo "EXISTING_CONFIG=true"
    echo "WEBHOOK_CONFIGURED=$HAS_DISCORD"
    echo "BOT_CONFIGURED=$HAS_DISCORD_BOT"
    [ -n "$WEBHOOK_URL" ] && echo "WEBHOOK_URL=$WEBHOOK_URL"
    [ -n "$MENTION" ] && echo "MENTION=$MENTION"
  else
    echo "EXISTING_CONFIG=false"
  fi
else
  echo "NO_CONFIG_FILE"
fi
```

如果发现现有配置，向用户展示当前已配置的内容，并询问其想要更新还是重新配置。

### 步骤 2：选择 Discord 方式

使用 AskUserQuestion：

**问题：** "你想如何发送 Discord 通知？"

**选项：**
1. **Webhook（推荐）** - 在你的 Discord 频道中创建一个 webhook。简单，无需机器人。只需粘贴 URL。
2. **Bot API** - 使用 Discord 机器人 token + 频道 ID。更灵活，但需要创建一个机器人应用。

### 步骤 3A：Webhook 配置

如果用户选择了 Webhook：

使用 AskUserQuestion：

**问题：** "粘贴你的 Discord webhook URL。创建方法：服务器设置 > 集成 > Webhooks > 新建 Webhook > 复制 URL"

用户会在 "Other" 字段中输入 webhook URL。

**校验** URL：
- 必须以 `https://discord.com/api/webhooks/` 或 `https://discordapp.com/api/webhooks/` 开头
- 如果无效，说明格式要求并重新询问

### 步骤 3B：Bot API 配置

如果用户选择了 Bot API：

询问两个问题：

1. **"粘贴你的 Discord 机器人 token"** - 来自 discord.com/developers > 你的应用 > Bot > Token
2. **"粘贴频道 ID"** - 右键点击频道 > 复制频道 ID（需要开启开发者模式）

### 步骤 4：配置提及（用户提醒）

使用 AskUserQuestion：

**问题：** "你希望通知中提及（提醒）某人吗？"

**选项：**
1. **是，提及某个用户** - 通过 Discord 用户 ID 标记特定用户
2. **是，提及某个角色** - 通过角色 ID 标记某个角色
3. **不提及任何人** - 直接发布消息，不提醒任何人

#### 如果用户想提及某个用户：

询问："要提及的 Discord 用户 ID 是什么？（右键点击用户 > 复制用户 ID，需要开启开发者模式）"

提及格式为：`<@USER_ID>`（例如 `<@1465264645320474637>`）

#### 如果用户想提及某个角色：

询问："要提及的 Discord 角色 ID 是什么？（服务器设置 > 角色 > 右键点击角色 > 复制角色 ID）"

提及格式为：`<@&ROLE_ID>`（例如 `<@&123456789>`）

### 步骤 5：配置事件

使用带 multiSelect 的 AskUserQuestion：

**问题：** "哪些事件应触发 Discord 通知？"

**选项（multiSelect: true）：**
1. **会话结束（推荐）** - 当 Claude 会话完成时
2. **需要输入** - 当 Claude 正在等待你的回复时（非常适合长时间运行的任务）
3. **会话开始** - 当新会话启动时
4. **会话持续** - 当持久模式让会话保持存活时

默认选择：session-end + ask-user-question。

### 步骤 6：可选的用户名覆盖

使用 AskUserQuestion：

**问题：** "自定义机器人显示名称？（在 Discord 中显示为 webhook 发送者名称）"

**选项：**
1. **OMC（默认）** - 显示为 "OMC"
2. **Claude Code** - 显示为 "Claude Code"
3. **自定义** - 输入自定义名称

### 步骤 7：写入配置

读取现有配置，合并新的 Discord 设置，然后写回：

```bash
CONFIG_FILE="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.omc-config.json"
mkdir -p "$(dirname "$CONFIG_FILE")"

if [ -f "$CONFIG_FILE" ]; then
  EXISTING=$(cat "$CONFIG_FILE")
else
  EXISTING='{}'
fi
```

#### 对于 Webhook 方式：

用收集到的值构建 notifications 对象，并使用 jq 合并到 `.omc-config.json`：

```bash
# WEBHOOK_URL、MENTION、USERNAME 由用户收集提供
# EVENTS 是已启用事件的列表

echo "$EXISTING" | jq \
  --arg url "$WEBHOOK_URL" \
  --arg mention "$MENTION" \
  --arg username "$USERNAME" \
  '.notifications = (.notifications // {enabled: true}) |
   .notifications.enabled = true |
   .notifications.discord = {
     enabled: true,
     webhookUrl: $url,
     mention: (if $mention == "" then null else $mention end),
     username: (if $username == "" then null else $username end)
   }' > "$CONFIG_FILE"
```

#### 对于 Bot API 方式：

```bash
echo "$EXISTING" | jq \
  --arg token "$BOT_TOKEN" \
  --arg channel "$CHANNEL_ID" \
  --arg mention "$MENTION" \
  '.notifications = (.notifications // {enabled: true}) |
   .notifications.enabled = true |
   .notifications["discord-bot"] = {
     enabled: true,
     botToken: $token,
     channelId: $channel,
     mention: (if $mention == "" then null else $mention end)
   }' > "$CONFIG_FILE"
```

#### 如果用户未选择全部事件，添加针对具体事件的配置：

对每个未被选择的事件，将其禁用：

```bash
# 示例：如果未选择 session-start，则将其禁用
echo "$(cat "$CONFIG_FILE")" | jq \
  '.notifications.events = (.notifications.events // {}) |
   .notifications.events["session-start"] = {enabled: false}' > "$CONFIG_FILE"
```

### 步骤 8：测试配置

写入配置后，主动提出发送一条测试通知：

使用 AskUserQuestion：

**问题：** "发送一条测试通知以验证配置？"

**选项：**
1. **是，立即测试（推荐）** - 向你的 Discord 频道发送一条测试消息
2. **否，我稍后测试** - 跳过测试

#### 如果测试：

```bash
# 对于 webhook：
curl -s -o /dev/null -w "%{http_code}" \
  -H "Content-Type: application/json" \
  -d "{\"content\": \"${MENTION:+$MENTION\\n}OMC 测试通知 - Discord 已配置成功！\"}" \
  "$WEBHOOK_URL"
```

报告成功或失败。如果失败，帮助用户排查（检查 URL、权限等）。

### 步骤 9：确认

展示最终配置摘要：

```
Discord 通知配置完成！

  方式:     Webhook / Bot API
  提及:     <@1465264645320474637>（或 "none"）
  事件:     session-end, ask-user-question
  用户名:   OMC

配置已保存至: ~/.claude/.omc-config.json

你也可以通过环境变量设置这些值:
  OMC_DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
  OMC_DISCORD_MENTION=<@1465264645320474637>

重新配置: /oh-my-claudecode:configure-notifications discord
配置 Telegram: /oh-my-claudecode:configure-notifications telegram
配置 Slack: /oh-my-claudecode:configure-notifications slack
```

### 环境变量替代方案

用户可以在自己的 shell 配置文件中设置环境变量，完全跳过此向导：

**Webhook 方式：**
```bash
export OMC_DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."
export OMC_DISCORD_MENTION="<@1465264645320474637>"  # 可选
```

**Bot API 方式：**
```bash
export OMC_DISCORD_NOTIFIER_BOT_TOKEN="your-bot-token"
export OMC_DISCORD_NOTIFIER_CHANNEL="your-channel-id"
export OMC_DISCORD_MENTION="<@1465264645320474637>"  # 可选
```

通知系统会自动检测环境变量，无需 `.omc-config.json`。

---

## Slack 配置

配置 Telegram 通知，这样当会话结束、需要输入或后台任务完成时，OMC 可以给你发消息。

### 本技能的工作方式

这是一个交互式、自然语言配置技能。通过 AskUserQuestion 向用户提问，引导其完成配置。将结果写入 `${CLAUDE_CONFIG_DIR:-~/.claude}/.omc-config.json`。

### 步骤 1：检测现有配置

```bash
CONFIG_FILE="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.omc-config.json"

if [ -f "$CONFIG_FILE" ]; then
  HAS_SLACK=$(jq -r '.notifications.slack.enabled // false' "$CONFIG_FILE" 2>/dev/null)
  WEBHOOK_URL=$(jq -r '.notifications.slack.webhookUrl // empty' "$CONFIG_FILE" 2>/dev/null)
  MENTION=$(jq -r '.notifications.slack.mention // empty' "$CONFIG_FILE" 2>/dev/null)
  CHANNEL=$(jq -r '.notifications.slack.channel // empty' "$CONFIG_FILE" 2>/dev/null)

  if [ "$HAS_SLACK" = "true" ]; then
    echo "EXISTING_CONFIG=true"
    [ -n "$WEBHOOK_URL" ] && echo "WEBHOOK_URL=$WEBHOOK_URL"
    [ -n "$MENTION" ] && echo "MENTION=$MENTION"
    [ -n "$CHANNEL" ] && echo "CHANNEL=$CHANNEL"
  else
    echo "EXISTING_CONFIG=false"
  fi
else
  echo "NO_CONFIG_FILE"
fi
```

如果发现现有配置，向用户展示当前已配置的内容，并询问其想要更新还是重新配置。

### 步骤 2：创建 Slack Incoming Webhook

如果用户还没有 webhook，引导其创建一个：

```
要设置 Slack 通知，你需要一个 Slack incoming webhook URL。

创建 WEBHOOK：
1. 访问 https://api.slack.com/apps
2. 点击 "Create New App" > "From scratch"
3. 为你的应用命名（例如 "OMC Notifier"）并选择你的工作区
4. 在左侧边栏进入 "Incoming Webhooks"
5. 将 "Activate Incoming Webhooks" 开关打开
6. 点击 "Add New Webhook to Workspace"
7. 选择通知要发布到的频道
8. 复制 webhook URL（以 https://hooks.slack.com/services/... 开头）
```

### 步骤 3：收集 Webhook URL

使用 AskUserQuestion：

**问题：** "粘贴你的 Slack incoming webhook URL（以 https://hooks.slack.com/services/... 开头）"

用户会在 "Other" 字段中输入 webhook URL。

**校验** URL：
- 必须以 `https://hooks.slack.com/services/` 开头
- 如果无效，说明格式要求并重新询问

### 步骤 4：配置提及（用户/群组提醒）

使用 AskUserQuestion：

**问题：** "你希望通知中提及（提醒）某人吗？"

**选项：**
1. **是，提及某个用户** - 通过 Slack 成员 ID 标记特定用户
2. **是，提及某个频道** - 使用 @channel 通知频道内所有人
3. **是，提及 @here** - 只通知频道内在线的成员
3. **不提及任何人** - 直接发布消息，不提醒任何人

#### 如果用户想提及某个用户：

询问："要提及的 Slack 成员 ID 是什么？（点击用户个人资料 > 更多 (⋯) > 复制成员 ID）"

提及格式为：`<@MEMBER_ID>`（例如 `<@U1234567890>`）

#### 如果用户想提及 @channel：

提及格式为：`<!channel>`

#### 如果用户想提及 @here：

提及格式为：`<!here>`

### 步骤 5：配置事件

使用带 multiSelect 的 AskUserQuestion：

**问题：** "哪些事件应触发 Slack 通知？"

**选项（multiSelect: true）：**
1. **会话结束（推荐）** - 当 Claude 会话完成时
2. **需要输入** - 当 Claude 正在等待你的回复时（非常适合长时间运行的任务）
3. **会话开始** - 当新会话启动时
4. **会话持续** - 当持久模式让会话保持存活时

默认选择：session-end + ask-user-question。

### 步骤 6：可选的频道覆盖

使用 AskUserQuestion：

**问题：** "覆盖默认通知频道？（该 webhook 已经有一个默认频道）"

**选项：**
1. **使用 webhook 默认值（推荐）** - 发布到设置 webhook 时选择的频道
2. **覆盖频道** - 指定其他频道（例如 #alerts）

如果选择覆盖，询问频道名称（例如 `#alerts`）。

### 步骤 7：可选的用户名覆盖

使用 AskUserQuestion：

**问题：** "自定义机器人显示名称？（在 Slack 中显示为 webhook 发送者名称）"

**选项：**
1. **OMC（默认）** - 显示为 "OMC"
2. **Claude Code** - 显示为 "Claude Code"
3. **自定义** - 输入自定义名称

### 步骤 8：写入配置

读取现有配置，合并新的 Slack 设置，然后写回：

```bash
CONFIG_FILE="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.omc-config.json"
mkdir -p "$(dirname "$CONFIG_FILE")"

if [ -f "$CONFIG_FILE" ]; then
  EXISTING=$(cat "$CONFIG_FILE")
else
  EXISTING='{}'
fi

# WEBHOOK_URL、MENTION、USERNAME、CHANNEL 由用户收集提供
echo "$EXISTING" | jq \
  --arg url "$WEBHOOK_URL" \
  --arg mention "$MENTION" \
  --arg username "$USERNAME" \
  --arg channel "$CHANNEL" \
  '.notifications = (.notifications // {enabled: true}) |
   .notifications.enabled = true |
   .notifications.slack = {
     enabled: true,
     webhookUrl: $url,
     mention: (if $mention == "" then null else $mention end),
     username: (if $username == "" then null else $username end),
     channel: (if $channel == "" then null else $channel end)
   }' > "$CONFIG_FILE"
```

#### 如果用户未选择全部事件，添加针对具体事件的配置：

对每个未被选择的事件，将其禁用：

```bash
# 示例：如果未选择 session-start，则将其禁用
echo "$(cat "$CONFIG_FILE")" | jq \
  '.notifications.events = (.notifications.events // {}) |
   .notifications.events["session-start"] = {enabled: false}' > "$CONFIG_FILE"
```

### 步骤 9：测试配置

写入配置后，主动提出发送一条测试通知：

使用 AskUserQuestion：

**问题：** "发送一条测试通知以验证配置？"

**选项：**
1. **是，立即测试（推荐）** - 向你的 Slack 频道发送一条测试消息
2. **否，我稍后测试** - 跳过测试

#### 如果测试：

```bash
# 对于 webhook：
MENTION_PREFIX=""
if [ -n "$MENTION" ]; then
  MENTION_PREFIX="${MENTION}\n"
fi

curl -s -o /dev/null -w "%{http_code}" \
  -H "Content-Type: application/json" \
  -d "{\"text\": \"${MENTION_PREFIX}OMC 测试通知 - Slack 已配置成功！\"}" \
  "$WEBHOOK_URL"
```

报告成功或失败。常见问题：
- **403 Forbidden**：Webhook URL 无效或已被撤销
- **404 Not Found**：Webhook URL 不正确
- **channel_not_found**：频道覆盖无效
- **Network error**：检查到 hooks.slack.com 的网络连通性

### 步骤 10：确认

展示最终配置摘要：

```
Slack 通知配置完成！

  Webhook:  https://hooks.slack.com/services/T00/B00/xxx...
  提及:     <@U1234567890>（或 "none"）
  频道:     #alerts（或 "webhook default"）
  事件:     session-end, ask-user-question
  用户名:   OMC

配置已保存至: ~/.claude/.omc-config.json

你也可以通过环境变量设置这些值:
  OMC_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
  OMC_SLACK_MENTION=<@U1234567890>

重新配置: /oh-my-claudecode:configure-notifications slack
配置 Discord: /oh-my-claudecode:configure-notifications discord
配置 Telegram: /oh-my-claudecode:configure-notifications telegram
```

### 环境变量替代方案

用户可以在自己的 shell 配置文件中设置环境变量，完全跳过此向导：

```bash
export OMC_SLACK_WEBHOOK_URL="https://hooks.slack.com/services/T00/B00/xxx"
export OMC_SLACK_MENTION="<@U1234567890>"  # 可选
```

通知系统会自动检测环境变量，无需 `.omc-config.json`。

### Slack 提及格式

| 类型 | 格式 | 示例 |
|------|--------|---------|
| 用户 | `<@MEMBER_ID>` | `<@U1234567890>` |
| 频道 | `<!channel>` | `<!channel>` |
| 在线成员 | `<!here>` | `<!here>` |
| 所有人 | `<!everyone>` | `<!everyone>` |
| 用户组 | `<!subteam^GROUP_ID>` | `<!subteam^S1234567890>` |

---

## 平台激活标志

所有通知平台都需要在每次会话中通过 CLI 标志激活：

- `omc --telegram` — 激活 Telegram 通知（设置 `OMC_TELEGRAM=1`）
- `omc --discord` — 激活 Discord 通知（设置 `OMC_DISCORD=1`）
- `omc --slack` — 激活 Slack 通知（设置 `OMC_SLACK=1`）
- `omc --webhook` — 激活 webhook 通知（设置 `OMC_WEBHOOK=1`）
- `omc --openclaw` — 激活 OpenClaw 网关集成（设置 `OMC_OPENCLAW=1`）

如果不加这些标志，已配置的平台将保持休眠。这样既能避免开发期间收到不需要的通知，又能让配置持久保留。

**示例：**
- `omc --telegram --discord` — Telegram + Discord 已激活
- `omc --telegram --slack --webhook` — Telegram + Slack + Webhook 已激活
- `omc --telegram --openclaw` — Telegram + OpenClaw 已激活
- `omc` — 不发送任何通知（所有平台都需要显式激活）

---

## Hook 事件模板

使用 `omc_config.hook.json` 按事件和平台自定义通知消息。

### 路由

如果触发词或参数包含 "hook"、"template" 或 "customize messages" → 执行本小节。

### 步骤 1：检测现有 Hook 配置

检查 `${CLAUDE_CONFIG_DIR:-~/.claude}/omc_config.hook.json` 是否存在。如果存在，展示当前配置。如果不存在，说明它的作用。

```
Hook 事件模板让你可以自定义发送到各平台的通知消息。
你可以为 Discord、Telegram、Slack 分别设置不同的消息，并控制哪些
事件在哪个平台上触发。

配置文件: ~/.claude/omc_config.hook.json
```

### 步骤 2：选择要配置的事件

使用 AskUserQuestion：

**问题：** "你想为哪个事件配置模板？"

**选项：**
1. **session-end** - 当 Claude 会话完成时（最常见）
2. **ask-user-question** - 当 Claude 正在等待输入时
3. **session-idle** - 当 Claude 完成并等待输入时
4. **session-start** - 当新会话启动时

### 步骤 3：展示可用变量

展示所选事件可用的模板变量：

```
可用的模板变量：

原始字段：
  {{sessionId}}      - 会话标识符
  {{timestamp}}      - ISO 时间戳
  {{tmuxSession}}    - tmux 会话名称
  {{projectPath}}    - 项目目录完整路径
  {{projectName}}    - 项目目录的基本名称
  {{reason}}         - 停止/结束原因
  {{activeMode}}     - 当前激活的 OMC 模式名称
  {{question}}       - 问题文本（仅 ask-user-question）
  {{agentName}}      - Agent 名称（仅 agent-call）
  {{agentType}}      - Agent 类型（仅 agent-call）

计算字段（智能格式化）：
  {{duration}}       - 人类可读的时长（例如 "5m 23s"）
  {{time}}           - 本地化的时间字符串
  {{modesDisplay}}   - 逗号分隔的模式列表，或为空
  {{iterationDisplay}} - "3/10" 格式，或为空
  {{agentDisplay}}   - "2/5 completed"，或为空
  {{projectDisplay}} - 带兜底值的项目名称
  {{footer}}         - tmux + 项目信息行
  {{tmuxTailBlock}}  - 代码围栏中的最近输出，或为空
  {{reasonDisplay}}  - 带 "unknown" 兜底值的原因

条件语句：
  {{#if variableName}}条件为真时显示的内容{{/if}}
```

### 步骤 4：收集模板

使用 AskUserQuestion：

**问题：** "输入此事件的消息模板（使用 {{variables}} 表示动态内容）"

**选项：**
1. **使用默认模板** - 保留内置的消息格式
2. **简单摘要** - 简短的单行格式
3. **自定义** - 输入你自己的模板

如果选择 "简单摘要"，使用预置的紧凑模板：
- session-end: `{{projectDisplay}} 会话已结束（{{duration}}）— {{reasonDisplay}}`
- ask-user-question: `{{projectDisplay}} 需要输入：{{question}}`
- session-idle: `{{projectDisplay}} 处于空闲状态。{{#if reason}}原因：{{reason}}{{/if}}`
- session-start: `会话已开始：{{projectDisplay}}，时间 {{time}}`

### 步骤 5：按平台覆盖

使用 AskUserQuestion：

**问题：** "你想为特定平台使用不同的消息吗？"

**选项：**
1. **否，全部相同（推荐）** - 在所有位置使用同一个模板
2. **是，按平台自定义** - 为 Discord、Telegram、Slack 设置不同的模板

如果按平台自定义：分别询问每个已启用平台的模板。

### 步骤 6：写入配置

读取或创建 `${CLAUDE_CONFIG_DIR:-~/.claude}/omc_config.hook.json` 并合并新设置：

```json
{
  "version": 1,
  "enabled": true,
  "events": {
    "<event-name>": {
      "enabled": true,
      "template": "<user-provided-template>",
      "platforms": {
        "discord": { "template": "<discord-specific>" },
        "telegram": { "template": "<telegram-specific>" }
      }
    }
  }
}
```

### 步骤 7：校验与测试

使用 `validateTemplate()` 校验模板，检查是否存在未知变量。如果发现未知变量，警告用户并提供修正建议。

主动提出使用新模板发送一条测试通知。

### 示例配置

```json
{
  "version": 1,
  "enabled": true,
  "events": {
    "session-end": {
      "enabled": true,
      "template": "会话 {{sessionId}} 在 {{duration}} 后结束。原因：{{reasonDisplay}}",
      "platforms": {
        "discord": {
          "template": "**会话完成** | `{{projectDisplay}}` | {{duration}} | {{reasonDisplay}}"
        },
        "telegram": {
          "template": "完成：{{projectDisplay}}（{{duration}}）\n{{#if contextSummary}}摘要：{{contextSummary}}{{/if}}"
        }
      }
    },
    "ask-user-question": {
      "enabled": true,
      "template": "{{#if question}}{{question}}{{/if}}\n{{projectDisplay}} 正在等待输入"
    }
  }
}
```

---

## 相关

- `/oh-my-claudecode:configure-openclaw` — 配置 OpenClaw 网关集成

---

## 自定义集成（OpenClaw、n8n、CLI 等）

为原生 Discord/Telegram/Slack 集成之外的服务配置自定义 webhook 和 CLI 命令。

### 路由

如果用户提到 "custom integration"、"openclaw"、"n8n"、"webhook"、"cli command" 或类似内容 → 执行本小节。

### 从 OpenClaw 迁移

如果 `~/.claude/omc_config.openclaw.json` 存在，检测并提供迁移：

**步骤 1：检测旧版配置**
```bash
LEGACY_CONFIG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/omc_config.openclaw.json"
if [ -f "$LEGACY_CONFIG" ]; then
  echo "LEGACY_FOUND=true"
  # 检查是否已迁移
  if jq -e '.customIntegrations.integrations[] | select(.preset == "openclaw")' "$CONFIG_FILE" >/dev/null 2>&1; then
    echo "ALREADY_MIGRATED=true"
  else
    echo "ALREADY_MIGRATED=false"
  fi
else
  echo "LEGACY_FOUND=false"
fi
```

**步骤 2：提供迁移**
如果发现旧版配置且尚未迁移：

**问题：** "检测到现有 OpenClaw 配置。你想将其迁移到新格式吗？"

**选项：**
1. **是，立即迁移** - 将旧版配置转换为自定义集成
2. **否，从头配置** - 跳过迁移并重新开始
3. **先让我看看旧版配置** - 展示当前 OpenClaw 设置

如果迁移：
- 读取 `omc_config.openclaw.json`
- 转换为自定义集成格式
- 保存到 `.omc-config.json`
- 将旧版配置备份为 `omc_config.openclaw.json.bak`
- 显示成功消息

### 自定义集成向导

**步骤 1：选择集成类型**

**问题：** "你想配置哪种类型的自定义集成？"

**选项：**
1. **OpenClaw 网关** - 唤醒外部自动化流程和 AI agent
2. **n8n Webhook** - 触发 n8n 工作流
3. **自定义 Agent 网关** - 将通知发送到自定义 agent webhook
4. **通用 Webhook** - 自定义 HTTPS webhook
5. **通用 CLI 命令** - 在事件发生时执行 shell 命令

### OpenClaw/n8n/自定义 Agent 网关预设流程

**步骤 2：网关 URL**

**问题：** "你的网关/webhook URL 是什么？"

**校验：**
- 必须是 HTTPS（开发环境下的 localhost 除外）
- 必须是有效的 URL 格式

**步骤 3：认证（可选）**

**问题：** "你的网关需要认证吗？"

**选项：**
1. **Bearer token** - Authorization: Bearer <token>
2. **自定义请求头** - 名称和值
3. **不需要认证**

如果选择 Bearer：询问 token
如果选择自定义：询问请求头名称和值

**步骤 4：事件**

使用带 multiSelect 的 AskUserQuestion：

**问题：** "哪些事件应触发此集成？"

**选项（含预设默认值）：**
- session-start
- session-end
- session-stop
- session-idle
- ask-user-question

OpenClaw 的默认值：session-start、session-end、stop
n8n 的默认值：session-end、ask-user-question

**步骤 5：测试**

**问题：** "发送一条测试通知以验证配置？"

**选项：**
1. **是，立即测试** - 发送测试 webhook
2. **否，跳过测试**

如果测试：
```bash
# 对于 webhook 集成
curl -X POST \
  -H "Content-Type: application/json" \
  ${AUTH_HEADER:+"-H \"$AUTH_HEADER\""} \
  -d '{"event":"test","instruction":"OMC 测试通知","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' \
  "$WEBHOOK_URL"
```

展示结果（HTTP 状态码、任何错误）。

**步骤 6：写入配置**

合并到 `.omc-config.json`：

```json
{
  "notifications": { /* 现有的原生配置 */ },
  "customIntegrations": {
    "enabled": true,
    "integrations": [
      {
        "id": "my-openclaw",
        "type": "webhook",
        "preset": "openclaw",
        "enabled": true,
        "config": {
          "url": "https://my-gateway.example.com/wake",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json",
            "Authorization": "Bearer ..."
          },
          "bodyTemplate": "{\\"event\\":\\"{{event}}\\",\\"instruction\\":\\"会话 {{sessionId}} {{event}}\\",\\"timestamp\\":\\"{{timestamp}}\\"}",
          "timeout": 10000
        },
        "events": ["session-start", "session-end"]
      }
    ]
  }
}
```

### 通用 Webhook 流程

**步骤 2：URL**
询问 webhook URL（需要 HTTPS）。

**步骤 3：请求方法**
询问 HTTP 方法（GET、POST、PUT、PATCH、DELETE）。默认：POST。

**步骤 4：请求头**
询问请求头，格式为 "名称: 值"，每行一个。默认：Content-Type: application/json

**步骤 5：请求体模板**
展示可用的模板变量，并询问请求体模板（JSON 或其他格式）。

默认：
```json
{
  "event": "{{event}}",
  "sessionId": "{{sessionId}}",
  "projectName": "{{projectName}}",
  "timestamp": "{{timestamp}}"
}
```

**步骤 6：超时**
询问超时时间，单位为毫秒（1000-60000）。默认：10000。

**步骤 7：事件**
多选事件。

**步骤 8：测试并保存**
与预设流程相同。

### 通用 CLI 命令流程

**步骤 2：命令**

**问题：** "应执行哪个命令？（单个可执行文件，不带参数）"

**示例：** `curl`、`/usr/local/bin/my-script`、`notify-send`

**校验：**
- 不能包含空格
- 不能包含 shell 元字符

**步骤 3：参数**

**问题：** "命令参数（使用 {{variable}} 表示动态值）。每行输入一个。"

**示例：**
```
-X
POST
-d
{"event":"{{event}}","session":"{{sessionId}}"}
https://my-api.com/notify
```

展示可用的模板变量参考。

**步骤 4：超时**
询问超时时间（1000-60000ms）。默认：5000。

**步骤 5：事件**
多选事件。

**步骤 6：测试并保存**

测试时，使用测试值执行命令：
```bash
$COMMAND "${ARGS[@]//{{event}}/test}"
```

展示 stdout/stderr 和退出码。

### 管理自定义集成

**列出已有的：**
```bash
jq '.customIntegrations.integrations[] | {id, type, preset, enabled, events}' "$CONFIG_FILE"
```

**禁用/启用：**
```bash
# 禁用
jq '.customIntegrations.integrations = [.customIntegrations.integrations[] | if .id == "my-integration" then .enabled = false else . end]' "$CONFIG_FILE"

# 启用
jq '.customIntegrations.integrations = [.customIntegrations.integrations[] | if .id == "my-integration" then .enabled = true else . end]' "$CONFIG_FILE"
```

**移除：**
```bash
jq '.customIntegrations.integrations = [.customIntegrations.integrations[] | select(.id != "my-integration")]' "$CONFIG_FILE"
```

### 模板变量参考

所有自定义集成都支持以下模板变量：

| 变量 | 说明 | 示例 |
|----------|-------------|---------|
| `{{sessionId}}` | 唯一的会话 ID | `sess_abc123` |
| `{{projectPath}}` | 项目完整路径 | `/home/user/my-project` |
| `{{projectName}}` | 项目目录名称 | `my-project` |
| `{{timestamp}}` | ISO 8601 时间戳 | `2026-03-05T14:30:00Z` |
| `{{event}}` | 事件名称 | `session-end` |
| `{{duration}}` | 人类可读的时长 | `45s` |
| `{{durationMs}}` | 以毫秒为单位的时长 | `45000` |
| `{{reason}}` | 停止/结束原因 | `completed` |
| `{{tmuxSession}}` | tmux 会话名称 | `claude:my-project` |

仅 session-end：
- `{{agentsSpawned}}`, `{{agentsCompleted}}`, `{{modesUsed}}`, `{{contextSummary}}`

仅 ask-user-question：
- `{{question}}`

---

## 相关

- 模板变量：`src/notifications/template-variables.ts`
- 校验：`src/notifications/validation.ts`
- 预设：`src/notifications/presets.ts`
