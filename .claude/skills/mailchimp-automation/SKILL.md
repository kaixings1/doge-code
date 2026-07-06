---
name: mailchimp-automation
description: "通过 Rube MCP (Composio) 自动执行 Mailchimp 电子邮件营销，包括活动、受众、订阅者、细分和分析。使用前始终先搜索工具以获取当前 schema。"
risk: critical
source: community
date_added: "2026-02-27"
---

# Mailchimp 自动化

通过 Composio 的 Mailchimp 工具包自动化 Mailchimp 电子邮件营销工作流，包括活动创建与发送、受众/列表管理、订阅者操作、细分和性能分析。

## 前提条件

- 必须连接 Rube MCP（RUBE_SEARCH_TOOLS 可用）
- 通过 `RUBE_MANAGE_CONNECTIONS` 使用 `mailchimp` 工具包激活 Mailchimp 连接
- 始终先调用 `RUBE_SEARCH_TOOLS` 获取当前工具 schema

## 设置

**获取 Rube MCP**：将 `https://rube.app/mcp` 作为 MCP 服务器添加到客户端配置中。无需 API 密钥——只需添加端点即可使用。

1. 通过确认 `RUBE_SEARCH_TOOLS` 响应来验证 Rube MCP 可用
2. 使用 `mailchimp` 工具包调用 `RUBE_MANAGE_CONNECTIONS`
3. 如果连接未处于 ACTIVE 状态，请按照返回的认证链接完成 Mailchimp OAuth
4. 在运行任何工作流之前确认连接状态显示为 ACTIVE

## 核心工作流

### 1. 创建和发送电子邮件活动

**使用时机**：用户想要创建、配置、测试和发送电子邮件活动。

**工具顺序**：
1. `MAILCHIMP_GET_LISTS_INFO` - 列出可用受众并获取 list_id [前置]
2. `MAILCHIMP_ADD_CAMPAIGN` - 使用类型、受众、主题、发件人姓名创建新活动 [必需]
3. `MAILCHIMP_SET_CAMPAIGN_CONTENT` - 设置活动的 HTML 内容 [必需]
4. `MAILCHIMP_SEND_TEST_EMAIL` - 在实际发送前向审阅者发送预览 [可选]
5. `MAILCHIMP_SEND_CAMPAIGN` - 立即发送活动 [必需]
6. `MAILCHIMP_SCHEDULE_CAMPAIGN` - 安排在未来某个时间发送 [可选]

**MAILCHIMP_ADD_CAMPAIGN 的关键参数**：
- `type`："regular"、"plaintext"、"rss" 或 "variate"（必需）
- `recipients__list__id`：收件人的受众/列表 ID
- `settings__subject__line`：电子邮件主题行
- `settings__from__name`：发件人显示名称
- `settings__reply__to`：回复邮箱地址（发送必需）
- `settings__title`：内部活动标题
- `settings__preview__text`：收件箱中显示的预览文本

**MAILCHIMP_SET_CAMPAIGN_CONTENT 的关键参数**：
- `campaign_id`：创建步骤中的活动 ID（必需）
- `html`：电子邮件的原始 HTML 内容
- `plain_text`：纯文本版本（省略时自动生成）
- `template__id`：使用预构建模板替代原始 HTML

**陷阱**：
- `MAILCHIMP_SEND_CAMPAIGN` 不可逆；始终先发送测试邮件并获得用户明确批准
- 活动必须处于"save"（草稿）状态，且具有有效的受众、主题、发件人姓名、已验证邮箱和内容才能发送
- `MAILCHIMP_SCHEDULE_CAMPAIGN` 需要有效的未来日期时间；过去的时间戳会失败
- 模板和 HTML 内容必须包含合规的页脚/退订合并标签
- Mailchimp 对嵌套参数使用双下划线表示法（例如 `settings__subject__line`）

### 2. 管理受众和订阅者

**使用时机**：用户想要查看受众、列出订阅者或查看订阅者详情。

**工具顺序**：
1. `MAILCHIMP_GET_LISTS_INFO` - 列出所有受众及其成员数 [必需]
2. `MAILCHIMP_GET_LIST_INFO` - 获取特定受众的详情 [可选]
3. `MAILCHIMP_LIST_MEMBERS_INFO` - 使用状态过滤和分页列出成员 [必需]
4. `MAILCHIMP_SEARCH_MEMBERS` - 按邮箱或名称跨列表搜索 [可选]
5. `MAILCHIMP_GET_MEMBER_INFO` - 获取特定订阅者的详细资料 [可选]
6. `MAILCHIMP_LIST_SEGMENTS` - 列出受众内的细分 [可选]

**MAILCHIMP_LIST_MEMBERS_INFO 的关键参数**：
- `list_id`：受众 ID（必需）
- `status`："subscribed"、"unsubscribed"、"cleaned"、"pending"、"transactional"、"archived"
- `count`：每页记录数（默认 10，最大 1000）
- `offset`：分页偏移量（默认 0）
- `sort_field`："timestamp_opt"、"timestamp_signup" 或 "last_changed"
- `fields`：逗号分隔列表，用于限制响应大小

**陷阱**：
- `stats.avg_open_rate` 和 `stats.avg_click_rate` 是 0-1 的小数，不是 0-100 的百分比
- 始终使用 `status="subscribed"` 过滤活跃订阅者；省略将返回所有状态
- 必须使用 `count` 和 `offset` 进行分页，直到收集的成员数与 `total_items` 匹配
- 大型列表响应可能被截断；数据位于 `响应.data.members` 下

### 3. 添加和更新订阅者

**使用时机**：用户想要添加新订阅者、更新现有订阅者或批量管理列表成员资格。

**工具顺序**：
1. `MAILCHIMP_GET_LIST_INFO` - 验证目标受众存在 [前置]
2. `MAILCHIMP_SEARCH_MEMBERS` - 检查联系人是否已存在 [可选]
3. `MAILCHIMP_ADD_OR_UPDATE_LIST_MEMBER` - 插入订阅者（创建或更新） [必需]
4. `MAILCHIMP_ADD_MEMBER_TO_LIST` - 添加新订阅者（仅创建） [可选]
5. `MAILCHIMP_BATCH_ADD_OR_REMOVE_MEMBERS` - 批量管理细分成员资格 [可选]

**MAILCHIMP_ADD_OR_UPDATE_LIST_MEMBER 的关键参数**：
- `list_id`：受众 ID（必需）
- `subscriber_hash`：小写邮箱的 MD5 哈希（必需）
- `email_address`：订阅者邮箱（必需）
- `status_if_new`：新订阅者的状态："subscribed"、"pending" 等（必需）
- `status`：现有订阅者的状态
- `merge_fields`：包含合并标签键的对象（例如 `{"FNAME": "John", "LNAME": "Doe"}`）
- `tags`：标签字符串数组

**MAILCHIMP_ADD_MEMBER_TO_LIST 的关键参数**：
- `list_id`：受众 ID（必需）
- `email_address`：订阅者邮箱（必需）
- `status`："subscribed"、"pending"、"unsubscribed"、"cleaned"、"transactional"（必需）

**陷阱**：
- `subscriber_hash` 必须是**小写**邮箱的 MD5；大小写错误会导致 404 或重复
- 使用 `MAILCHIMP_ADD_OR_UPDATE_LIST_MEMBER`（插入）替代 `MAILCHIMP_ADD_MEMBER_TO_LIST` 以避免重复错误
- `status_if_new` 仅适用于新联系人；现有联系人使用 `status`
- 使用 `skip_merge_validation: true` 可跳过必需的合并字段验证
- `MAILCHIMP_BATCH_ADD_OR_REMOVE_MEMBERS` 管理的是静态细分成员资格，而非列表成员资格

### 4. 查看活动报告和分析

**使用时机**：用户想要查看活动表现、打开率、点击率或订阅者互动情况。

**工具顺序**：
1. `MAILCHIMP_LIST_CAMPAIGNS` - 列出已发送活动及其报告摘要 [必需]
2. `MAILCHIMP_SEARCH_CAMPAIGNS` - 按名称、主题或内容查找活动 [可选]
3. `MAILCHIMP_GET_CAMPAIGN_REPORT` - 获取活动的详细性能报告 [必需]
4. `MAILCHIMP_LIST_CAMPAIGN_REPORTS` - 批量获取多个活动的报告 [可选]
5. `MAILCHIMP_LIST_CAMPAIGN_DETAILS` - 获取链接级别的点击统计 [可选]
6. `MAILCHIMP_GET_CAMPAIGN_LINK_DETAILS` - 深入查看特定链接的点击数据 [可选]
7. `MAILCHIMP_LIST_CLICKED_LINK_SUBSCRIBERS` - 查看谁点击了特定链接 [可选]
8. `MAILCHIMP_GET_SUBSCRIBER_EMAIL_ACTIVITY` - 获取每个订阅者的活动参与情况 [可选]
9. `MAILCHIMP_GET_CAMPAIGN_CONTENT` - 检索活动 HTML 内容 [可选]

**MAILCHIMP_LIST_CAMPAIGNS 的关键参数**：
- `status`："save"、"paused"、"schedule"、"sending"、"sent"
- `count` / `offset`：分页（默认 10，最大 1000）
- `since_send_time` / `before_send_time`：ISO 8601 日期范围过滤
- `sort_field`："create_time" 或 "send_time"
- `fields`：限制响应字段以提升性能

**MAILCHIMP_GET_CAMPAIGN_REPORT 的关键参数**：
- `campaign_id`：活动 ID（必需）
- 返回：打开、点击、退回、退订、时间序列、行业统计

**陷阱**：
- `MAILCHIMP_LIST_CAMPAIGNS` 仅返回高级别的 `report_summary`；使用 `MAILCHIMP_GET_CAMPAIGN_REPORT` 获取详细指标
- 草稿/未发送的活动缺乏有意义的报告数据
- 在 LIST_CAMPAIGNS 上使用 `fields` 参数时，明确请求 `send_time` 和 `report_summary` 子字段
- 分页默认值较小（10 条记录）；使用 `count` 和 `offset` 迭代直到覆盖 `total_items`
- `send_time` 是带时区的 ISO 8601 格式；请仔细解析

## 常见模式

### ID 解析
操作前始终将名称解析为 ID：
- **受众名称 -> list_id**：`MAILCHIMP_GET_LISTS_INFO` 并按名称匹配
- **订阅者邮箱 -> subscriber_hash**：在代码中计算小写邮箱的 MD5
- **活动名称 -> campaign_id**：使用 `MAILCHIMP_SEARCH_CAMPAIGNS` 查询
- **细分名称 -> segment_id**：使用 `MAILCHIMP_LIST_SEGMENTS` 并指定 list_id

### 分页
Mailchimp 使用基于偏移量的分页：
- 使用 `count`（页面大小，最大 1000）和 `offset`（跳过 N 条记录）
- 持续进行直到收集的记录数与响应中的 `total_items` 匹配
- 默认 `count` 为 10；批量操作时始终显式设置
- 搜索端点的上限为 10 页（每页 30 条，共 300 条结果）

### 订阅者哈希
许多端点需要 `subscriber_hash`（小写邮箱的 MD5）：
```
import hashlib
subscriber_hash = hashlib.md5(email.lower().encode()).hexdigest()
```

## 已知陷阱

### ID 格式
- `list_id`（受众 ID）是短字母数字字符串（例如 "abc123def4"）
- `campaign_id` 是字母数字字符串
- `subscriber_hash` 是 MD5 十六进制字符串（32 个字符）
- 细分 ID 是整数

### 速率限制
- Mailchimp 强制执行 API 速率限制；对批量订阅者操作使用批处理
- 高频率使用 GET_MEMBER_INFO 和 ADD_OR_UPDATE_LIST_MEMBER 可能触发限流
- 对批量细分操作使用 `MAILCHIMP_BATCH_ADD_OR_REMOVE_MEMBERS`

### 参数特性
- 嵌套参数使用双下划线表示法：`settings__subject__line`、`recipients__list__id`
- `avg_open_rate` 和 `avg_click_rate` 是 0-1 的小数，不是百分比
- `status_if_new` 仅适用于插入操作中的新联系人
- `subscriber_hash` 必须是小写邮箱的 MD5；错误的格式会创建幽灵记录
- 活动 `type` 在创建时为必需项；最常见的是 "regular"
- `MAILCHIMP_SEND_CAMPAIGN` 成功时返回 HTTP 204（无响应体）

### 内容和合规性
- 活动 HTML 必须包含退订链接和实际地址（合并标签）
- 发送前必须通过 `MAILCHIMP_SET_CAMPAIGN_CONTENT` 设置内容
- 测试邮件要求活动已设置内容

## 快速参考

| 操作 | 方法 |
|---|---|
| 发现工具 | 调用 `RUBE_SEARCH_TOOLS` |
| 检查连接 | 调用 `RUBE_MANAGE_CONNECTIONS` |
| 执行工具 | 调用 `RUBE_MULTI_EXECUTE_TOOL` |
| 处理分页 | 检查响应中的 `cursor` 字段 |
| 错误处理 | 验证连接状态和schema合规性 |

| 任务 | 工具标识 | 关键参数 |
|------|----------|----------|