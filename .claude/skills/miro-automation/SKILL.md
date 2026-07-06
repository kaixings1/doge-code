---
name: miro-automation
description: "通过 Rube MCP (Composio) 自动执行 Miro 任务：boards, items, sticky notes, frames, sharing, connectors. 始终 search tools first for current schemas."
risk: critical
source: community
date_added: "2026-02-27"
---

# Miro 自动化（通过 Rube MCP）

Automate Miro whiteboard operations through Composio's Miro toolkit via Rube MCP.

## 前提条件

- Rube MCP must be connected (RUBE_SEARCH_TOOLS available)
- Active Miro connection via `RUBE_MANAGE_CONNECTIONS` with toolkit `miro`
- 始终 call `RUBE_SEARCH_TOOLS` first to get current tool schemas

## 设置

**Get Rube MCP**: Add `https://rube.app/mcp` as an MCP server in your client 配置. No API keys needed — just add the 端点 and it works.


1. Verify Rube MCP is available by confirming `RUBE_SEARCH_TOOLS` responds
2. Call `RUBE_MANAGE_CONNECTIONS` with toolkit `miro`
3. If connection is not ACTIVE, follow the returned auth link to complete Miro OAuth
4. Confirm connection status shows ACTIVE before running any workflows

## 核心工作流

### 1. List and Browse Boards

**使用场景**: User wants to find boards or get board details

**Tool sequence**:
1. `MIRO_GET_BOARDS2` - List all accessible boards [必需]
2. `MIRO_GET_BOARD` - Get detailed info for a specific board [可选]

**Key parameters**:
- `查询`: Search term to 过滤器 boards by name
- `sort`: Sort by 'default', 'last_modified', 'last_opened', 'last_created', 'alphabetically'
- `limit`: Number of results per page (max 50)
- `offset`: Pagination offset
- `board_id`: Specific board ID for detailed retrieval

**Pitfalls**:
- Pagination uses offset-based 方法, not 游标-based
- Maximum 50 boards per page; iterate with offset for full list
- Board IDs are long alphanumeric strings; always resolve by search first

### 2. Create Boards and Items

**使用场景**: User wants to create a new board or add items to an existing board

**Tool sequence**:
1. `MIRO_CREATE_BOARD` - Create a new empty board [可选]
2. `MIRO_CREATE_STICKY_NOTE_ITEM` - Add sticky notes to a board [可选]
3. `MIRO_CREATE_FRAME_ITEM2` - Add frames to organize content [可选]
4. `MIRO_CREATE_ITEMS_IN_BULK` - Add multiple items at once [可选]

**Key parameters**:
- `name` / `description`: Board name and description (for CREATE_BOARD)
- `board_id`: Target board ID (required for all item creation)
- `data`: Content object with `content` field for sticky note text
- `style`: Styling object with `fillColor` for sticky note color
- `position`: Object with `x` and `y` coordinates
- `geometry`: Object with `width` and `height`

**Pitfalls**:
- `board_id` is required for ALL item operations; resolve via GET_BOARDS2 first
- Sticky note colors use hex codes (e.g., '#FF0000') in the `fillColor` field
- Position coordinates use the board's coordinate system (origin at center)
- BULK create has a maximum items-per-请求 limit; check current 架构
- Frame items require `geometry` with both width and height

### 3. Browse and Manage Board Items

**使用场景**: User wants to view, find, or organize items on a board

**Tool sequence**:
1. `MIRO_GET_BOARD_ITEMS` - List all items on a board [必需]
2. `MIRO_GET_CONNECTORS2` - List connections between items [可选]

**Key parameters**:
- `board_id`: Target board ID (required)
- `type`: 过滤器 by item type ('sticky_note', 'shape', 'text', 'frame', 'image', 'card')
- `limit`: Number of items per page
- `游标`: Pagination 游标 from previous 响应

**Pitfalls**:
- Results are paginated; follow `游标` until absent for complete item list
- Item types must match Miro's predefined types exactly
- Large boards may have thousands of items; use type filtering to narrow results
- Connectors are separate from items; use GET_CONNECTORS2 for relationship data

### 4. Share and Collaborate on Boards

**使用场景**: User wants to share a board with team members or manage access

**Tool sequence**:
1. `MIRO_GET_BOARDS2` - Find the board to share [Prerequisite]
2. `MIRO_SHARE_BOARD` - Share the board with users [必需]
3. `MIRO_GET_BOARD_MEMBERS` - Verify current board members [可选]

**Key parameters**:
- `board_id`: Board to share (required)
- `emails`: Array of email addresses to invite
- `role`: Access level ('viewer', 'commenter', 'editor')
- `message`: 可选 invitation message

**Pitfalls**:
- Email addresses must be valid; invalid emails cause the entire 请求 to fail
- Role must be one of the predefined values; case-sensitive
- Sharing with users outside the organization may require admin approval
- GET_BOARD_MEMBERS returns all members including the owner

### 5. Create Visual Connections

**使用场景**: User wants to connect items on a board with lines or arrows

**Tool sequence**:
1. `MIRO_GET_BOARD_ITEMS` - Find items to connect [Prerequisite]
2. `MIRO_GET_CONNECTORS2` - View existing connections [可选]

**Key parameters**:
- `board_id`: Target board ID
- `startItem`: Object with `id` of the source item
- `endItem`: Object with `id` of the target item
- `style`: Connector style (line type, color, arrows)

**Pitfalls**:
- Both start and end items must exist on the same board
- Item IDs are required for connections; resolve via GET_BOARD_ITEMS first
- Connector styles vary; check available options in 架构
- Self-referencing connections (same start and end) are not allowed

## 常见模式

### ID Resolution

**Board name -> Board ID**:
```
1. Call MIRO_GET_BOARDS2 with 查询=board_name
2. Find board by name in results
3. Extract id field
```

**Item lookup on board**:
```
1. Call MIRO_GET_BOARD_ITEMS with board_id and optional type 过滤器
2. Find item by content or position
3. Extract item id for further operations
```

### Pagination

- Boards: Use `offset` and `limit` (offset-based)
- Board items: Use `游标` and `limit` (游标-based)
- Continue until no more results or 游标 is absent
- 默认 page sizes vary by 端点

### Coordinate System

- Board origin (0,0) is at the center
- Positive X is right, positive Y is down
- Items positioned by their center point
- Use `position: {x: 0, y: 0}` for center of board
- Frames define bounded areas; items inside inherit frame position

## 已知陷阱

**Board IDs**:
- Board IDs are required for virtually all operations
- 始终 resolve board names to IDs via GET_BOARDS2 first
- Do not hardcode board IDs; they vary by account

**Item Creation**:
- Each item type has different required fields
- Sticky notes need `data.content` for text
- Frames need `geometry.width` and `geometry.height`
- Position defaults to (0,0) if not specified; items may overlap

**Rate Limits**:
- Miro API has rate limits per 令牌
- Bulk operations preferred over individual item creation
- Use MIRO_CREATE_ITEMS_IN_BULK for multiple items

**响应 Parsing**:
- 响应 data may be nested under `data` key
- Item types determine which fields are present in 响应
- Parse defensively; optional fields may be absent

## 快速参考

| 操作 | 方法 |
|---|---|
| 发现工具 | 调用 `RUBE_SEARCH_TOOLS` |
| 检查连接 | 调用 `RUBE_MANAGE_CONNECTIONS` |
| 执行工具 | 调用 `RUBE_MULTI_EXECUTE_TOOL` |
| 处理分页 | 检查响应中的 `cursor` 字段 |
| 错误处理 | 验证连接状态和schema合规性 |

| Task | Tool 标识符 | Key Params |