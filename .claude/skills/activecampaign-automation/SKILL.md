---
name: activecampaign-自动化
description: "通过 Rube MCP (Composio) 自动化 ActiveCampaign 操作：管理联系人、标签、列表订阅、自动化注册和任务。始终先调用 RUBE_SEARCH_TOOLS 获取最新工具架构。"
risk: critical
source: community
date_added: "2026-02-27"
---

# 通过 Rube MCP 实现 ActiveCampaign 自动化

通过 Composio 的 ActiveCampaign 工具包和 Rube MCP 自动化 ActiveCampaign CRM 和营销自动化操作。

## 前提条件

- Rube MCP 必须已连接（RUBE_SEARCH_TOOLS 可用）
- 通过 `RUBE_MANAGE_CONNECTIONS` 建立活跃的 ActiveCampaign 连接，使用工具包 `active_campaign`
- 始终首先调用 `RUBE_SEARCH_TOOLS` 以获取当前工具模式

## 设置

**获取 Rube MCP**: 在客户端配置中将 `https://rube.app/mcp` 添加为 MCP 服务器。无需 API 密钥 — 只需添加端点即可工作。

1. 通过确认 `RUBE_SEARCH_TOOLS` 响应来验证 Rube MCP 是否可用
2. 使用工具包 `active_campaign` 调用 `RUBE_MANAGE_CONNECTIONS`
3. 如果连接不是 ACTIVE 状态，请按照返回的身份验证链接完成 ActiveCampaign 认证
4. 在运行任何工作流之前确认连接状态显示为 ACTIVE

## 核心工作流

### 1. 创建和查找联系人

**何时使用**: 用户想要创建新联系人或查找现有联系人

**工具序列**:
1. `ACTIVE_CAMPAIGN_FIND_CONTACT` - 搜索现有联系人 [可选]
2. `ACTIVE_CAMPAIGN_CREATE_CONTACT` - 创建新联系人 [必需]

**查找的关键参数**:
- `email`: 按电子邮件地址搜索
- `id`: 按 ActiveCampaign 联系人ID搜索
- `phone`: 按电话号码搜索

**创建的关键参数**:
- `email`: 联系人电子邮件地址（必需）
- `first_name`: 联系人名字
- `last_name`: 联系人姓氏
- `phone`: 联系人电话号码
- `organization_name`: 联系人的组织
- `job_title`: 联系人的职位
- `tags`: Comma-separated list of tags to apply

**Pitfalls**:
- `email` is the only required field for contact creation
- Phone search uses a general search parameter internally; it may return partial matches
- When combining `email` and `phone` in FIND_CONTACT, results are filtered client-side
- Tags provided during creation are applied immediately
- Creating a contact with an existing email may update the existing contact

### 2. Manage Contact Tags

**When to use**: User wants to add or remove tags from contacts

**Tool sequence**:
1. `ACTIVE_CAMPAIGN_FIND_CONTACT` - Find contact by email or ID [Prerequisite]
2. `ACTIVE_CAMPAIGN_MANAGE_CONTACT_TAG` - Add or remove tags [Required]

**Key parameters**:
- `action`: 'Add' or 'Remove' (required)
- `tags`: Tag names as comma-separated string or array of strings (required)
- `contact_id`: Contact ID (provide this or contact_email)
- `contact_email`: Contact email address (alternative to contact_id)

**Pitfalls**:
- `action` values are capitalized: 'Add' or 'Remove' (not lowercase)
- Tags can be a comma-separated string ('tag1, tag2') or an array (['tag1', 'tag2'])
- Either `contact_id` or `contact_email` must be provided; `contact_id` takes precedence
- Adding a tag that does not exist creates it automatically
- Removing a non-existent tag is a no-op (does not error)

### 3. Manage List Subscriptions

**When to use**: User wants to subscribe or unsubscribe contacts from lists

**Tool sequence**:
1. `ACTIVE_CAMPAIGN_FIND_CONTACT` - Find the contact [Prerequisite]
2. `ACTIVE_CAMPAIGN_MANAGE_LIST_SUBSCRIPTION` - Subscribe or unsubscribe [Required]

**Key parameters**:
- `action`: 'subscribe' or 'unsubscribe' (required)
- `list_id`: Numeric list ID string (required)
- `email`: Contact email address (provide this or contact_id)
- `contact_id`: Numeric contact ID string (alternative to email)

**Pitfalls**:
- `action` values are lowercase: 'subscribe' or 'unsubscribe'
- `list_id` is a numeric string (e.g., '2'), not the list name
- List IDs can be retrieved via the GET /api/3/lists endpoint (not available as a Composio tool; use the ActiveCampaign UI)
- If both `email` and `contact_id` are provided, `contact_id` takes precedence
- Unsubscribing changes status to '2' (unsubscribed) but the relationship record persists

### 4. Add Contacts to Automations

**When to use**: User wants to enroll a contact in an automation workflow

**Tool sequence**:
1. `ACTIVE_CAMPAIGN_FIND_CONTACT` - Verify contact exists [Prerequisite]
2. `ACTIVE_CAMPAIGN_ADD_CONTACT_TO_AUTOMATION` - Enroll contact in automation [Required]

**Key parameters**:
- `contact_email`: Email of the contact to enroll (required)
- `automation_id`: ID of the target automation (required)

**Pitfalls**:
- The contact must already exist in ActiveCampaign
- Automations can only be created through the ActiveCampaign UI, not via API
- `automation_id` must reference an existing, active automation
- The tool performs a two-step process: lookup contact by email, then enroll
- Automation IDs can be found in the ActiveCampaign UI or via GET /api/3/automations

### 5. Create Contact Tasks

**When to use**: User wants to create follow-up tasks associated with contacts

**Tool sequence**:
1. `ACTIVE_CAMPAIGN_FIND_CONTACT` - Find the contact to associate the task with [Prerequisite]
2. `ACTIVE_CAMPAIGN_CREATE_CONTACT_TASK` - Create the task [Required]

**Key parameters**:
- `relid`: Contact ID to associate the task with (required)
- `duedate`: Due date in ISO 8601 format with timezone (required, e.g., '2025-01-15T14:30:00-05:00')
- `dealTasktype`: Task type ID based on available types (required)
- `title`: Task title
- `note`: Task description/content
- `assignee`: User ID to assign the task to
- `edate`: End date in ISO 8601 format (must be later than duedate)
- `status`: 0 for incomplete, 1 for complete

**Pitfalls**:
- `duedate` must be a valid ISO 8601 datetime with timezone offset; do NOT use placeholder values
- `edate` must be later than `duedate`
- `dealTasktype` is a string ID referencing task types configured in ActiveCampaign
- `relid` is the numeric contact ID, not the email address
- `assignee` is a user ID; resolve user names to IDs via the ActiveCampaign UI

## Common Patterns

### Contact Lookup Flow

```
1. Call ACTIVE_CAMPAIGN_FIND_CONTACT with email
2. If found, extract contact ID for subsequent operations
3. If not found, create contact with ACTIVE_CAMPAIGN_CREATE_CONTACT
4. Use contact ID for tags, subscriptions, or automations
```

### Bulk Contact Tagging

```
1. For each contact, call ACTIVE_CAMPAIGN_MANAGE_CONTACT_TAG
2. Use contact_email to avoid separate lookup calls
3. Batch with reasonable delays to respect rate limits
```

### ID Resolution

**Contact email -> Contact ID**:
```
1. Call ACTIVE_CAMPAIGN_FIND_CONTACT with email
2. Extract id from the response
```

## 已知陷阱

**Action Capitalization**:
- Tag actions: 'Add', 'Remove' (capitalized)
- Subscription actions: 'subscribe', 'unsubscribe' (lowercase)
- Mixing up capitalization causes errors

**ID Types**:
- Contact IDs: numeric strings (e.g., '123')
- List IDs: numeric strings
- Automation IDs: numeric strings
- All IDs should be passed as strings, not integers

**Automations**:
- Automations cannot be created via API; only enrollment is possible
- Automation must be active to accept new contacts
- Enrolling a contact already in the automation may have no effect

**Rate Limits**:
- ActiveCampaign API has rate limits per account
- Implement backoff on 429 responses
- Batch operations should be spaced appropriately

**Response Parsing**:
- Response data may be nested under `data` or `data.data`
- Parse defensively with fallback patterns
- Contact search may return multiple results; match by email for accuracy

## 快速参考

| Task | Tool Slug | Key Params |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  18 HOURS 12 MINUTES 22 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE