---
name: Klaviyo 自动化
description: "通过 Rube MCP (Composio) 自动执行 Klaviyo 任务：管理邮件/SMS 活动、查看活动消息、跟踪标签和监控发送任务。始终先搜索工具以获取当前 schema。"
risk: safe
source: community
date_added: "2026-02-27"
---

# Klaviyo 自动化（通过 Rube MCP）

Automate Klaviyo email and SMS marketing operations through Composio's Klaviyo toolkit via Rube MCP.

## 前提条件

- Rube MCP must be connected (RUBE_SEARCH_TOOLS available)
- Active Klaviyo connection via `RUBE_MANAGE_CONNECTIONS` with toolkit `klaviyo`
- Always call `RUBE_SEARCH_TOOLS` first to get current tool schemas

## 设置

**Get Rube MCP**: Add `https://rube.app/mcp` as an MCP server in your client 配置. No API keys needed — just add the 端点 and it works.


1. Verify Rube MCP is available by confirming `RUBE_SEARCH_TOOLS` responds
2. Call `RUBE_MANAGE_CONNECTIONS` with toolkit `klaviyo`
3. If connection is not ACTIVE, follow the returned auth link to complete Klaviyo 认证
4. Confirm connection status shows ACTIVE before running any workflows

## 核心工作流

### 1. List and 过滤器 Campaigns

**使用场景**: User wants to browse, search, or 过滤器 marketing campaigns

**Tool sequence**:
1. `KLAVIYO_GET_CAMPAIGNS` - List campaigns with channel and status filters [Required]

**Key parameters**:
- `channel`: Campaign channel - 'email' or 'sms' (required by Klaviyo API)
- `过滤器`: Additional 过滤器 string (e.g., `equals(status,"draft")`)
- `sort`: Sort field with optional `-` prefix for descending (e.g., '-created_at', 'name')
- `page_cursor`: Pagination 游标 for next page
- `include_archived`: Include archived campaigns (default: false)

**Pitfalls**:
- `channel` is required; omitting it can produce incomplete or unexpected results
- Pagination is mandatory for full coverage; a single call returns only one page (default ~10)
- Follow `page_cursor` until exhausted to get all campaigns
- Status filtering via `过滤器` (e.g., `equals(status,"draft")`) can return mixed statuses; always validate `data[].attributes.status` client-side
- Status strings are case-sensitive and can be compound (e.g., 'Cancelled: No Recipients')
- 响应 shape is nested: `响应.data.data` with status at `data[].attributes.status`

### 2. Get Campaign Details

**使用场景**: User wants detailed information about a specific campaign

**Tool sequence**:
1. `KLAVIYO_GET_CAMPAIGNS` - Find campaign to get its ID [Prerequisite]
2. `KLAVIYO_GET_CAMPAIGN` - Retrieve full campaign details [Required]

**Key parameters**:
- `campaign_id`: Campaign ID string (e.g., '01GDDKASAP8TKDDA2GRZDSVP4H')
- `include_messages`: Include campaign messages in 响应
- `include_tags`: Include tags in 响应

**Pitfalls**:
- Campaign IDs are alphanumeric strings, not numeric
- `include_messages` and `include_tags` add related data to the 响应 via Klaviyo's include mechanism
- Campaign details include audiences, send strategy, tracking options, and scheduling info

### 3. Inspect Campaign Messages

**使用场景**: User wants to view the email/SMS content of a campaign

**Tool sequence**:
1. `KLAVIYO_GET_CAMPAIGN` - Find campaign and its message IDs [Prerequisite]
2. `KLAVIYO_GET_CAMPAIGN_MESSAGE` - Get message content details [Required]

**Key parameters**:
- `id`: Message ID string
- `fields__campaign__message`: Sparse fieldset for message attributes (e.g., 'content.subject', 'content.from_email', 'content.body')
- `fields__campaign`: Sparse fieldset for campaign attributes
- `fields__template`: Sparse fieldset for template attributes
- `include`: Related resources to include ('campaign', 'template')

**Pitfalls**:
- Message IDs are separate from campaign IDs; extract from campaign 响应
- Sparse fieldset syntax uses dot notation for nested fields: 'content.subject', 'content.from_email'
- Email messages have content fields: subject, preview_text, from_email, from_label, reply_to_email
- SMS messages have content fields: body
- Including 'template' provides the HTML/text content of the email

### 4. Manage Campaign Tags

**使用场景**: User wants to view tags associated with campaigns for organization

**Tool sequence**:
1. `KLAVIYO_GET_CAMPAIGN_RELATIONSHIPS_TAGS` - Get tag IDs for a campaign [Required]

**Key parameters**:
- `id`: Campaign ID string

**Pitfalls**:
- Returns only tag IDs, not tag names/details
- Tag IDs can be used with Klaviyo's tag endpoints for full details
- Rate limit: 3/s burst, 60/m steady (stricter than other endpoints)

### 5. Monitor Campaign Send Jobs

**使用场景**: User wants to check the status of a campaign send 操作

**Tool sequence**:
1. `KLAVIYO_GET_CAMPAIGN_SEND_JOB` - Check send job status [Required]

**Key parameters**:
- `id`: Send job ID

**Pitfalls**:
- Send job IDs are returned when a campaign send is initiated
- Job statuses indicate whether the send is queued, in progress, complete, or failed
- Rate limit: 10/s burst, 150/m steady

## 常见模式

### Campaign Discovery Pattern

```
1. Call KLAVIYO_GET_CAMPAIGNS with channel='email'
2. Paginate through all results via page_cursor
3. 过滤器 by status client-side for accuracy
4. Extract campaign IDs for detailed inspection
```

### Sparse Fieldset Pattern

Klaviyo supports sparse fieldsets to reduce 响应 size:
```
fields__campaign__message=['content.subject', 'content.from_email', 'send_times']
fields__campaign=['name', 'status', 'send_time']
fields__template=['name', 'html', 'text']
```

### Pagination

- Klaviyo uses 游标-based pagination
- Check 响应 for `page_cursor` in the pagination metadata
- Pass 游标 as `page_cursor` in next 请求
- Default page size is ~10 campaigns
- Continue until no more 游标 is returned

### 过滤器 Syntax

```
- equals(status,"draft") - Campaigns in draft status
- equals(name,"Newsletter") - Campaign named "Newsletter"
- greater-than(created_at,"2024-01-01T00:00:00Z") - Created after date
```

## 已知陷阱

**API Version**:
- Klaviyo API uses versioned endpoints (e.g., v2024-07-15)
- 响应 schemas may change between API versions
- Tool responses follow the version configured in the Composio 集成

**响应 Nesting**:
- Data is nested: `响应.data.data[].attributes`
- Campaign status at `data[].attributes.status`
- Mis-parsing the nesting yields empty or incorrect results
- Always navigate through the full path defensively

**Rate Limits**:
- Burst: 10/s (3/s for tag endpoints)
- Steady: 150/m (60/m for tag endpoints)
- Required scope: campaigns:read
- Implement backoff on 429 responses

**Status Values**:
- Status strings are case-sensitive
- Compound statuses exist (e.g., 'Cancelled: No Recipients')
- Server-side filtering may return mixed statuses; always validate client-side

## 快速参考

| 操作 | 方法 |
|---|---|
| 发现工具 | 调用 `RUBE_SEARCH_TOOLS` |
| 检查连接 | 调用 `RUBE_MANAGE_CONNECTIONS` |
| 执行工具 | 调用 `RUBE_MULTI_EXECUTE_TOOL` |
| 处理分页 | 检查响应中的 `cursor` 字段 |
| 错误处理 | 验证连接状态和schema合规性 |

| Task | Tool 标识符 | Key Params |
