---
name: google-calendar-自动化
description: "轻量级 Google Calendar 集成，使用独立 OAuth 认证。不需要 MCP 服务器。"
license: Apache-2.0
risk: critical
source: community
metadata:
  author: sanjay3290
  version: "1.0"
---

# Google Calendar

轻量级 Google Calendar 集成，使用独立 OAuth 认证。不需要 MCP 服务器。

> **⚠️ 需要 Google Workspace 账户。** 不支持个人 Gmail 账户。

## 使用场景
- 需要从本地脚本列出、创建、检查或更新 Google Calendar 事件
- 任务需要基于 OAuth 的日历自动化，无需搭建 MCP 服务器
- 需要在 Workspace 环境中快速操作访问日历、日程、与会者或事件详情

## 首次设置

使用 Google 进行认证（打开浏览器）：
```bash
python scripts/auth.py login
```

检查认证状态：
```bash
python scripts/auth.py status
```

需要时注销：
```bash
python scripts/auth.py logout
```

## 命令

所有操作通过 `scripts/gcal.py` 进行。如果未登录，首次使用时自动认证。

### 列出日历
```bash
python scripts/gcal.py list-calendars
```

### 列出事件
```bash
# 列出主要日历中的事件（默认：未来30天）
python scripts/gcal.py list-events

# 列出特定时间范围内的事件
python scripts/gcal.py list-events --time-min 2024-01-15T00:00:00Z --time-max 2024-01-31T23:59:59Z

# 列出特定日历中的事件
python scripts/gcal.py list-events --calendar "work@example.com"

# 限制结果数量
python scripts/gcal.py list-events --max-results 10
```

### 获取事件详情
```bash
python scripts/gcal.py get-event EVENT_ID
python scripts/gcal.py get-event EVENT_ID --calendar "work@example.com"
```

### 创建事件
```bash
# 基本事件
python scripts/gcal.py create-event "Team Meeting" "2024-01-15T10:00:00Z" "2024-01-15T11:00:00Z"

# 带描述和位置的事件
python scripts/gcal.py create-event "Team Meeting" "2024-01-15T10:00:00Z" "2024-01-15T11:00:00Z" \
    --description "Weekly sync" --location "Conference Room A"

# 带与会者的事件
python scripts/gcal.py create-event "Team Meeting" "2024-01-15T10:00:00Z" "2024-01-15T11:00:00Z" \
    --attendees user1@example.com user2@example.com

# 在特定日历上创建事件
python scripts/gcal.py create-event "Meeting" "2024-01-15T10:00:00Z" "2024-01-15T11:00:00Z" \
    --calendar "work@example.com"
```

### 更新事件
```bash
# 更新事件标题
python scripts/gcal.py update-event EVENT_ID --summary "New Title"

# 更新事件时间
python scripts/gcal.py update-event EVENT_ID --start "2024-01-15T14:00:00Z" --end "2024-01-15T15:00:00Z"

# 更新多个字段
python scripts/gcal.py update-event EVENT_ID \
    --summary "Updated Meeting" --description "New agenda" --location "Room B"

# 更新与会者
python scripts/gcal.py update-event EVENT_ID --attendees user1@example.com user3@example.com
```

### 删除事件
```bash
python scripts/gcal.py delete-event EVENT_ID
python scripts/gcal.py delete-event EVENT_ID --calendar "work@example.com"
```

### 查找空闲时间
查找指定与会者的第一个可用会议时间段：
```bash
# 为自己查找30分钟的空闲时间段
python scripts/gcal.py find-free-time \
    --attendees me \
    --time-min "2024-01-15T09:00:00Z" \
    --time-max "2024-01-15T17:00:00Z" \
    --duration 30

# 为多个与会者查找60分钟的空闲时间段
python scripts/gcal.py find-free-time \
    --attendees me user1@example.com user2@example.com \
    --time-min "2024-01-15T09:00:00Z" \
    --time-max "2024-01-19T17:00:00Z" \
    --duration 60
```

### 响应事件邀请
```bash
# 接受邀请
python scripts/gcal.py respond-to-event EVENT_ID accepted

# 拒绝邀请
python scripts/gcal.py respond-to-event EVENT_ID declined

# 标记为暂定
python scripts/gcal.py respond-to-event EVENT_ID tentative

# 响应而不通知组织者
python scripts/gcal.py respond-to-event EVENT_ID accepted --no-notify
```

## Date/Time Format

All times use ISO 8601 format with timezone:
- UTC: `2024-01-15T10:30:00Z`
- With offset: `2024-01-15T10:30:00-05:00` (EST)

## Calendar ID Format

- Primary calendar: Use `primary` or omit the `--calendar` flag
- Other calendars: Use the calendar ID from `list-calendars` (usually an email address)

## Token Management

Tokens stored securely using the system keyring:
- **macOS**: Keychain
- **Windows**: Windows Credential Locker
- **Linux**: Secret Service API (GNOME Keyring, KDE Wallet, etc.)

Service name: `google-calendar-skill-oauth`

Tokens are automatically refreshed when expired using Google's cloud function.

## 局限性
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.
