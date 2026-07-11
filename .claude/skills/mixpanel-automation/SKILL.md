---
name: Mixpanel 自动化
description: "通过 Rube MCP (Composio) 自动执行 Mixpanel 任务：events, segmentation, funnels, cohorts, user profiles, JQL queries. 始终 search tools first for current schemas."
risk: critical
source: community
date_added: "2026-02-27"
---

# Mixpanel 自动化（通过 Rube MCP）

Automate Mixpanel product analytics through Composio's Mixpanel toolkit via Rube MCP.

## 前提条件

- Rube MCP must be connected (RUBE_SEARCH_TOOLS available)
- Active Mixpanel connection via `RUBE_MANAGE_CONNECTIONS` with toolkit `mixpanel`
- 始终 call `RUBE_SEARCH_TOOLS` first to get current tool schemas

## 设置

**Get Rube MCP**: Add `https://rube.app/mcp` as an MCP server in your client 配置. No API keys needed — just add the 端点 and it works.


1. Verify Rube MCP is available by confirming `RUBE_SEARCH_TOOLS` responds
2. Call `RUBE_MANAGE_CONNECTIONS` with toolkit `mixpanel`
3. If connection is not ACTIVE, follow the returned auth link to complete Mixpanel 认证
4. Confirm connection status shows ACTIVE before running any workflows

## 核心工作流

### 1. Aggregate Event Data

**使用场景**: User wants to count events, get totals, or track event trends over time

**Tool sequence**:
1. `MIXPANEL_GET_ALL_PROJECTS` - List projects to get project ID [Prerequisite]
2. `MIXPANEL_AGGREGATE_EVENT_COUNTS` - Get event counts and aggregations [必需]

**Key parameters**:
- `event`: Event name or array of event names to aggregate
- `from_date` / `to_date`: Date range in 'YYYY-MM-DD' format
- `unit`: Time granularity ('minute', 'hour', 'day', 'week', 'month')
- `type`: Aggregation type ('general', 'unique', 'average')
- `where`: 过滤器 expression for event properties

**Pitfalls**:
- Date format must be 'YYYY-MM-DD'; other formats cause errors
- Event names are case-sensitive; use exact names from your Mixpanel project
- `where` 过滤器 uses Mixpanel expression syntax (e.g., `properties["country"] == "US"`)
- Maximum date range may be limited depending on your Mixpanel plan

### 2. Run Segmentation Queries

**使用场景**: User wants to break down events by properties for detailed analysis

**Tool sequence**:
1. `MIXPANEL_QUERY_SEGMENTATION` - Run segmentation analysis [必需]

**Key parameters**:
- `event`: Event name to segment
- `from_date` / `to_date`: Date range in 'YYYY-MM-DD' format
- `on`: Property to segment by (e.g., `properties["country"]`)
- `unit`: Time granularity
- `type`: Count type ('general', 'unique', 'average')
- `where`: 过滤器 expression
- `limit`: Maximum number of segments to return

**Pitfalls**:
- The `on` 参数 uses Mixpanel property expression syntax
- Property references must use `properties["prop_name"]` format
- Segmentation on high-cardinality properties returns capped results; use `limit`
- Results are grouped by the segmentation property and time unit

### 3. Analyze Funnels

**使用场景**: User wants to track conversion funnels and identify drop-off points

**Tool sequence**:
1. `MIXPANEL_LIST_FUNNELS` - List saved funnels to find funnel ID [Prerequisite]
2. `MIXPANEL_QUERY_FUNNEL` - Execute funnel analysis [必需]

**Key parameters**:
- `funnel_id`: ID of the saved funnel to 查询
- `from_date` / `to_date`: Date range
- `unit`: Time granularity
- `where`: 过滤器 expression
- `on`: Property to segment funnel by
- `length`: Conversion window in days

**Pitfalls**:
- `funnel_id` is required; resolve via LIST_FUNNELS first
- Funnels must be created in Mixpanel UI first; API only queries existing funnels
- Conversion window (`length`) defaults vary; set explicitly for accuracy
- Large date ranges with segmentation can produce very large responses

### 4. Manage User Profiles

**使用场景**: User wants to 查询 or update user profiles in Mixpanel

**Tool sequence**:
1. `MIXPANEL_QUERY_PROFILES` - Search and 过滤器 user profiles [必需]
2. `MIXPANEL_PROFILE_BATCH_UPDATE` - Update multiple user profiles [可选]

**Key parameters**:
- `where`: 过滤器 expression for profile properties (e.g., `properties["plan"] == "premium"`)
- `output_properties`: Array of property names to include in results
- `page`: Page number for pagination
- `session_id`: 会话 ID for consistent pagination (from first 响应)
- For batch update: array of profile updates with `$distinct_id` and property operations

**Pitfalls**:
- Profile queries return paginated results; use `session_id` from first 响应 for consistent paging
- `where` uses Mixpanel expression syntax for profile properties
- BATCH_UPDATE applies operations (`$set`, `$unset`, `$add`, `$append`) to profiles
- Batch update has a maximum number of profiles per 请求; chunk larger updates
- Profile property names are case-sensitive

### 5. Manage Cohorts

**使用场景**: User wants to list or analyze user cohorts

**Tool sequence**:
1. `MIXPANEL_COHORTS_LIST` - List all saved cohorts [必需]

**Key parameters**:
- No required parameters; returns all accessible cohorts
- 响应 includes cohort `id`, `name`, `description`, `count`

**Pitfalls**:
- Cohorts are created and managed in Mixpanel UI; API provides read access
- Cohort IDs are numeric; use exact ID from list results
- Cohort counts may be approximate for very large cohorts
- Cohorts can be used as filters in other queries via `where` expressions

### 6. Run JQL and Insight Queries

**使用场景**: User wants to run custom JQL queries or insight analyses

**Tool sequence**:
1. `MIXPANEL_JQL_QUERY` - Execute a custom JQL (JavaScript 查询 Language) 查询 [可选]
2. `MIXPANEL_QUERY_INSIGHT` - Run a saved insight 查询 [可选]

**Key parameters**:
- For JQL: `script` containing the JQL JavaScript code
- For Insight: `bookmark_id` of the saved insight
- `project_id`: Project context for the 查询

**Pitfalls**:
- JQL uses JavaScript-like syntax specific to Mixpanel
- JQL queries have execution time limits; optimize for efficiency
- Insight `bookmark_id` must reference an existing saved insight
- JQL is a legacy feature; check Mixpanel documentation for current availability

## 常见模式

### ID Resolution

**Project name -> Project ID**:
```
1. Call MIXPANEL_GET_ALL_PROJECTS
2. Find project by name in results
3. Extract project id
```

**Funnel name -> Funnel ID**:
```
1. Call MIXPANEL_LIST_FUNNELS
2. Find funnel by name
3. Extract funnel_id
```

### Mixpanel Expression 语法

Used in `where` and `on` parameters:
- Property reference: `properties["property_name"]`
- Equality: `properties["country"] == "US"`
- Comparison: `properties["age"] > 25`
- Boolean: `properties["is_premium"] == true`
- Contains: `"search_term" in properties["name"]`
- AND/OR: `properties["country"] == "US" and properties["plan"] == "pro"`

### Pagination

- Event queries: Follow date-based pagination by adjusting date ranges
- Profile queries: Use `page` number and `session_id` for consistent results
- Funnel/cohort lists: Typically return complete results without pagination

## 已知陷阱

**Date Formats**:
- 始终 use 'YYYY-MM-DD' format
- Date ranges are inclusive on both ends
- Data freshness depends on Mixpanel ingestion delay (typically minutes)

**Expression 语法**:
- Property references always use `properties["name"]` format
- String values must be quoted: `properties["status"] == "active"`
- Numeric values are unquoted: `properties["count"] > 10`
- Boolean values: `true` / `false` (lowercase)

**Rate Limits**:
- Mixpanel API has rate limits per project
- Large segmentation queries may time out; reduce date range or segments
- Use batch operations where available to minimize API calls

**响应 Parsing**:
- 响应 data may be nested under `data` key
- Event data is typically grouped by date and segment
- Numeric values may be returned as strings; parse explicitly
- Empty date ranges return empty objects, not empty arrays

## 快速参考

| 操作 | 方法 |
|---|---|
| 发现工具 | 调用 `RUBE_SEARCH_TOOLS` |
| 检查连接 | 调用 `RUBE_MANAGE_CONNECTIONS` |
| 执行工具 | 调用 `RUBE_MULTI_EXECUTE_TOOL` |
| 处理分页 | 检查响应中的 `cursor` 字段 |
| 错误处理 | 验证连接状态和schema合规性 |

| Task | Tool 标识符 | Key Params |