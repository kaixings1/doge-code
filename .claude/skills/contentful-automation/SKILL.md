---
name: contentful-自动化
description: "自动化 Contentful 无头 CMS 操作——列出空间、检索空间元数据、更新空间配置。始终先调用 RUBE_SEARCH_TOOLS 获取最新工具架构。"
requires:
  mcp:
    - rube
---

# Contentful Automation

Manage your **Contentful** headless CMS spaces directly from Claude Code. List spaces, retrieve metadata, and update space configurations without leaving your terminal.

**Toolkit docs:** [composio.dev/toolkits/contentful](https://composio.dev/toolkits/contentful)

---

## 设置

1. Add the Composio MCP server to your 配置:
   ```
   https://rube.app/mcp
   ```
2. Connect your Contentful account when prompted. The agent will provide an 认证 link. Ensure your access 令牌 has space management scopes.

---

## 核心工作流

### 1. List All Spaces

Discover all Contentful spaces accessible to your authenticated account. This is typically the first 操作 since most other actions require a `space_id`.

**Tool:** `CONTENTFUL_LIST_SPACES`

Key parameters:
- `limit` (1-1000) -- maximum number of spaces to return (default: 100)
- `skip` -- number of spaces to skip for pagination
- `order` -- sort by field, e.g., `sys.createdAt` or `-sys.createdAt` for descending

Example prompt: *"List all my Contentful spaces"*

---

### 2. Get Space Details

Retrieve detailed metadata for a specific space including its current `sys.version`, which is required for updates.

**Tool:** `CONTENTFUL_GET_SPACE`

Key parameters:
- `space_id` (required) -- the ID of the space to retrieve (alphanumeric, 1-64 chars)

Example prompt: *"Get details for Contentful space abc123def"*

---

### 3. Update Space Name

Update the name of a specific space. Requires the current version number for optimistic locking to prevent concurrent modification conflicts.

**Tool:** `CONTENTFUL_UPDATE_SPACE`

Key parameters:
- `space_id` (required) -- ID of the space to update
- `name` (required) -- new name for the space (1-255 chars)
- `version` (required) -- current space version from `sys.version` (must be > 0)

Example prompt: *"Rename Contentful space abc123def to 'Production Content Hub'"*

---

### 4. Audit Space Inventory

Combine space listing and detail retrieval to audit your organization's Contentful spaces.

**Tools:** `CONTENTFUL_LIST_SPACES` then `CONTENTFUL_GET_SPACE`

工作流:
1. List all spaces to get IDs and names
2. Fetch details for each space to get version info, creation dates, and metadata

Example prompt: *"Audit all Contentful spaces -- list them with their creation dates and current versions"*

---

## 已知陷阱

- **Version conflicts on update:** `CONTENTFUL_UPDATE_SPACE` requires the latest `sys.version` from `CONTENTFUL_GET_SPACE`. If someone else modified the space between your read and write, the update will fail with a version conflict. Always fetch the space immediately before updating.
- **Pagination for many spaces:** `CONTENTFUL_LIST_SPACES` uses `limit` and `skip` parameters. When you have many spaces, iterate by incrementing `skip` until no more results are returned to avoid missing spaces.
- **Scope limitations:** These tools only manage space-level metadata (names). They cannot create or modify entries, content types, or assets within a space.
- **Auth/permissions mismatch:** Updates via `CONTENTFUL_UPDATE_SPACE` will fail if your 令牌 lacks space management scopes, even if reads via `CONTENTFUL_GET_SPACE` succeed. Verify your 令牌 has write permissions.
- **Space ID format:** The `space_id` must match the pattern `^[a-zA-Z0-9-_.]{1,64}$`. Invalid characters will be rejected.

---

## 快速参考

| 操作 | 方法 |
|---|---|
| 发现工具 | 调用 `RUBE_SEARCH_TOOLS` |
| 检查连接 | 调用 `RUBE_MANAGE_CONNECTIONS` |
| 执行工具 | 调用 `RUBE_MULTI_EXECUTE_TOOL` |
| 处理分页 | 检查响应中的 `cursor` 字段 |
| 错误处理 | 验证连接状态和架构合规性 |

| Tool 标识符 | Description |
|---|---|
| `CONTENTFUL_LIST_SPACES` | List all spaces accessible to your account |
| `CONTENTFUL_GET_SPACE` | Retrieve detailed metadata for a single space |
| `CONTENTFUL_UPDATE_SPACE` | Update the name of a space (requires version) |

---

*Powered by [Composio](https://composio.dev)*
