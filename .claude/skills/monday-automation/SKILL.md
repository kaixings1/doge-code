---
name: monday-automation
description: "通过 Rube MCP (Composio) 自动执行 Monday.com 工作管理，包括面板、项目、列、组、子项目和更新。使用前始终先搜索工具以获取当前 schema。"
risk: critical
source: community
date_added: "2026-02-27"
---

# 通过 Rube MCP 实现 Monday.com 自动化

通过 Composio 的 Monday 工具包自动执行 Monday.com 工作管理工作流，包括面板创建、项目管理、列值更新、组组织、子项目和更新/评论线程。

## 前提条件

- Rube MCP must be connected (RUBE_SEARCH_TOOLS available)
- Active Monday.com connection via `RUBE_MANAGE_CONNECTIONS` with toolkit `monday`
- 始终 call `RUBE_SEARCH_TOOLS` first to get current tool schemas

## 设置

**Get Rube MCP**: Add `https://rube.app/mcp` as an MCP server in your client configuration. No API keys needed — just add the endpoint and it works.

1. Verify Rube MCP is available by confirming `RUBE_SEARCH_TOOLS` responds
2. Call `RUBE_MANAGE_CONNECTIONS` with toolkit `monday`
3. If connection is not ACTIVE, follow the returned auth link to complete Monday.com OAuth
4. Confirm connection status shows ACTIVE before running any workflows

## Core Workflows

### 1. Create and Manage Boards

**When to use**: User wants to create a new board, list existing boards, or set up workspace structure.

**Tool sequence**:
1. `MONDAY_GET_WORKSPACES` - List available workspaces and resolve workspace ID [Prerequisite]
2. `MONDAY_LIST_BOARDS` - List existing boards to check for duplicates [可选]
3. `MONDAY_CREATE_BOARD` - Create a new board with name, kind, and workspace [必需]
4. `MONDAY_CREATE_COLUMN` - Add columns to the new board [可选]
5. `MONDAY_CREATE_GROUP` - Add groups to organize items [可选]
6. `MONDAY_BOARDS` - Retrieve detailed board metadata [可选]

**Key parameters**:
- `board_name`: Name for the new board (required)
- `board_kind`: "public", "private", or "share" (required)
- `workspace_id`: Numeric workspace ID; omit for default workspace
- `folder_id`: Folder ID; must be within `workspace_id` if both provided
- `template_id`: ID of accessible template to clone

**Pitfalls**:
- `board_kind` is required and must be one of: "public", "private", "share"
- If both `workspace_id` and `folder_id` are provided, the folder must exist within that workspace
- `template_id` must reference a template the authenticated user can access
- Board IDs are large integers; always use the exact value from API responses

### 2. Create and Manage Items

**When to use**: User wants to add tasks/items to a board, list existing items, or move items between groups.

**Tool sequence**:
1. `MONDAY_LIST_BOARDS` - Resolve board name to board ID [Prerequisite]
2. `MONDAY_LIST_GROUPS` - List groups on the board to get group_id [Prerequisite]
3. `MONDAY_LIST_COLUMNS` - Get column IDs and types for setting values [Prerequisite]
4. `MONDAY_CREATE_ITEM` - Create a new item with name and column values [必需]
5. `MONDAY_LIST_BOARD_ITEMS` - List all items on the board [可选]
6. `MONDAY_MOVE_ITEM_TO_GROUP` - Move an item to a different group [可选]
7. `MONDAY_ITEMS_PAGE` - Paginated item retrieval with filtering [可选]

**Key parameters**:
- `board_id`: Board ID (required, integer)
- `item_name`: Item name, max 256 characters (required)
- `group_id`: Group ID string to place the item in (optional)
- `column_values`: JSON object or string mapping column IDs to values

**Pitfalls**:
- `column_values` must use column IDs (not titles); get them from `MONDAY_LIST_COLUMNS`
- Column value formats vary by type: status uses `{"index": 0}` or `{"label": "Done"}`, date uses `{"date": "YYYY-MM-DD"}`, people uses `{"personsAndTeams": [{"id": 123, "kind": "person"}]}`
- `item_name` has a 256-character maximum
- Subitem boards are NOT supported by `MONDAY_CREATE_ITEM`; use GraphQL via `MONDAY_CREATE_OBJECT`

### 3. Update Item Column Values

**When to use**: User wants to change status, date, text, or other column values on existing items.

**Tool sequence**:
1. `MONDAY_LIST_COLUMNS` or `MONDAY_COLUMNS` - Get column IDs and types [Prerequisite]
2. `MONDAY_LIST_BOARD_ITEMS` or `MONDAY_ITEMS_PAGE` - Find the target item ID [Prerequisite]
3. `MONDAY_CHANGE_SIMPLE_COLUMN_VALUE` - Update text, status, or dropdown with a string value [必需]
4. `MONDAY_UPDATE_ITEM` - Update complex column types (timeline, people, date) with JSON [必需]

**Key parameters for MONDAY_CHANGE_SIMPLE_COLUMN_VALUE**:
- `board_id`: Board ID (integer, required)
- `item_id`: Item ID (integer, required)
- `column_id`: Column ID string (required)
- `value`: Simple string value (e.g., "Done", "Working on it")
- `create_labels_if_missing`: true to auto-create status/dropdown labels (default true)

**Key parameters for MONDAY_UPDATE_ITEM**:
- `board_id`: Board ID (integer, required)
- `item_id`: Item ID (integer, required)
- `column_id`: Column ID string (required)
- `value`: JSON object matching the column type schema
- `create_labels_if_missing`: false by default; set true for status/dropdown

**Pitfalls**:
- Use `MONDAY_CHANGE_SIMPLE_COLUMN_VALUE` for simple text/status/dropdown updates (string value)
- Use `MONDAY_UPDATE_ITEM` for complex types like timeline, people, date (JSON value)
- Column IDs are lowercase strings with underscores (e.g., "status_1", "date_2", "text"); get them from `MONDAY_LIST_COLUMNS`
- 状态 values can be set by label name ("Done") or index number ("1")
- `create_labels_if_missing` defaults differ: true for CHANGE_SIMPLE, false for UPDATE_ITEM

### 4. Work with Groups and Board Structure

**When to use**: User wants to organize items into groups, add columns, or inspect board structure.

**Tool sequence**:
1. `MONDAY_LIST_BOARDS` - Resolve board ID [Prerequisite]
2. `MONDAY_LIST_GROUPS` - List all groups on a board [必需]
3. `MONDAY_CREATE_GROUP` - Create a new group [可选]
4. `MONDAY_LIST_COLUMNS` or `MONDAY_COLUMNS` - Inspect column structure [必需]
5. `MONDAY_CREATE_COLUMN` - Add a new column to the board [可选]
6. `MONDAY_MOVE_ITEM_TO_GROUP` - Reorganize items across groups [可选]

**Key parameters**:
- `board_id`: Board ID (required for all group/column operations)
- `group_name`: Name for new group (CREATE_GROUP)
- `column_type`: Must be a valid GraphQL enum token in snake_case (e.g., "status", "text", "long_text", "numbers", "date", "dropdown", "people")
- `title`: Column display title
- `defaults`: JSON string for status/dropdown labels, e.g., `'{"labels": ["To Do", "In Progress", "Done"]}'`

**Pitfalls**:
- `column_type` must be exact snake_case values; "person" is NOT valid, use "people"
- Group IDs are strings (e.g., "topics", "new_group_12345"), not integers
- `MONDAY_COLUMNS` accepts an array of `board_ids` and returns column metadata including settings
- `MONDAY_LIST_COLUMNS` is simpler and takes a single `board_id`

### 5. Manage Subitems and Updates

**When to use**: User wants to view subitems of a task or add comments/updates to items.

**Tool sequence**:
1. `MONDAY_LIST_BOARD_ITEMS` - Find parent item IDs [Prerequisite]
2. `MONDAY_LIST_SUBITEMS_BY_PARENT` - Retrieve subitems with column values [必需]
3. `MONDAY_CREATE_UPDATE` - Add a comment/update to an item [可选]
4. `MONDAY_CREATE_OBJECT` - Create subitems via GraphQL mutation [可选]

**Key parameters for MONDAY_LIST_SUBITEMS_BY_PARENT**:
- `parent_item_ids`: Array of parent item IDs (integer array, required)
- `include_column_values`: true to include column data (default true)
- `include_parent_fields`: true to include parent item info (default true)

**Key parameters for MONDAY_CREATE_OBJECT** (GraphQL):
- `query`: Full GraphQL mutation string
- `variables`: 可选 variables object

**Pitfalls**:
- Subitems can only be queried through their parent items
- To create subitems, use `MONDAY_CREATE_OBJECT` with a `create_subitem` GraphQL mutation
- `MONDAY_CREATE_UPDATE` is for adding comments/updates to items (Monday's "updates" feature), not for modifying item values
- `MONDAY_CREATE_OBJECT` is a raw GraphQL endpoint; ensure correct mutation syntax

## Common Patterns

### ID Resolution
始终 resolve display names to IDs before operations:
- **Board name -> board_id**: `MONDAY_LIST_BOARDS` and match by name
- **Group name -> group_id**: `MONDAY_LIST_GROUPS` with `board_id`
- **Column title -> column_id**: `MONDAY_LIST_COLUMNS` with `board_id`
- **Workspace name -> workspace_id**: `MONDAY_GET_WORKSPACES` and match by name
- **Item name -> item_id**: `MONDAY_LIST_BOARD_ITEMS` or `MONDAY_ITEMS_PAGE`

### Pagination
Monday.com uses cursor-based pagination for items:
- `MONDAY_ITEMS_PAGE` returns a `cursor` in the response for the next page
- Pass the `cursor` to the next call; `board_id` and `query_params` are ignored when cursor is provided
- Cursors are cached for 60 minutes
- Maximum `limit` is 500 per page
- `MONDAY_LIST_BOARDS` and `MONDAY_GET_WORKSPACES` use page-based pagination with `page` and `limit`

### Column Value 格式ting
Different column types require different value formats:
- **状态**: `{"index": 0}` or `{"label": "Done"}` or simple string "Done"
- **Date**: `{"date": "YYYY-MM-DD"}`
- **People**: `{"personsAndTeams": [{"id": 123, "kind": "person"}]}`
- **Text/Numbers**: Plain string or number
- **Timeline**: `{"from": "YYYY-MM-DD", "to": "YYYY-MM-DD"}`

## 已知陷阱

### ID Formats
- Board IDs and item IDs are large integers (e.g., 1234567890)
- Group IDs are strings (e.g., "topics", "new_group_12345")
- Column IDs are short strings (e.g., "status_1", "date4", "text")
- Workspace IDs are integers

### Rate Limits
- Monday.com GraphQL API has complexity-based rate limits
- Large boards with many columns increase query complexity
- Use `limit` parameter to reduce items per request if hitting limits

### Parameter Quirks
- `column_type` for CREATE_COLUMN must be exact snake_case enum values; "people" not "person"
- `column_values` in CREATE_ITEM accepts both JSON string and object formats
- `MONDAY_CHANGE_SIMPLE_COLUMN_VALUE` auto-creates missing labels by default; `MONDAY_UPDATE_ITEM` does not
- `MONDAY_CREATE_OBJECT` is a raw GraphQL interface; use it for operations without dedicated tools (e.g., create_subitem, delete_item, archive_board)

### Response Structure
- Board items are returned as arrays with `id`, `name`, and `state` fields
- Column values include both raw `value` (JSON) and rendered `text` (display string)
- Subitems are nested under parent items and cannot be queried independently

## 快速参考

| Task | Tool Slug | Key Params |