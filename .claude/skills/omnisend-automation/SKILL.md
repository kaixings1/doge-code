---
name: Omnisend 自动化
description: "通过 Composio 自动执行电子商务营销工作流，包括联系人管理、批量操作和订阅者细分"
requires:
  mcp:
    - rube
---

# Omnisend 自动化

自动执行电子商务营销操作——创建和更新联系人、使用游标分页管理订阅者列表、运行批量操作以及细分受众——全部通过 Composio MCP 集成编排。

**工具包文档：** [composio.dev/toolkits/omnisend](https://composio.dev/toolkits/omnisend)

---

## 设置

1. Connect your Omnisend account through the Composio MCP server at `https://rube.app/mcp`
2. The agent will prompt you with an 认证 link if no active connection exists
3. Once connected, all `OMNISEND_*` tools become available for execution

---

## 核心工作流

### 1. Create or Update a Contact
Upsert a contact by email identifier with subscription status, profile fields, and optional welcome message.

**Tool:** `OMNISEND_CREATE_OR_UPDATE_CONTACT`

| 参数 | Type | 必需 | Description |
|-----------|------|----------|-------------|
| `identifiers` | array | Yes | At least one identifier object with `id` (email), `type` (`email`), optional `channels.email.status` (`subscribed`, `nonSubscribed`, `unsubscribed`), and `sendWelcomeMessage` (boolean) |
| `firstName` | string | No | Contact's first name |
| `lastName` | string | No | Contact's last name |
| `gender` | string | No | `m` or `f` |
| `birthdate` | string | No | Format: `YYYY-MM-DD` |
| `country` | string | No | Full country name |
| `countryCode` | string | No | ISO 3166-1 alpha-2 code (e.g., `US`) |
| `city` | string | No | City name |
| `address` | string | No | Street address |
| `postalCode` | string | No | ZIP/postal code |

---

### 2. List Contacts with Pagination
Retrieve contacts in batches with optional filters for email, phone, status, segment, or tag.

**Tool:** `OMNISEND_LIST_CONTACTS`

| 参数 | Type | 必需 | Description |
|-----------|------|----------|-------------|
| `limit` | integer | No | Results per page (default: 100, max: 250) |
| `after` | string | No | 游标 for next page (base64-encoded ContactID) |
| `before` | string | No | 游标 for previous page |
| `email` | string | No | 过滤器 by exact email address |
| `phone` | string | No | 过滤器 by full phone number with country code |
| `status` | string | No | 过滤器 by: `subscribed`, `nonSubscribed`, `unsubscribed` |
| `segmentID` | integer | No | 过滤器 by segment ID |
| `tag` | string | No | 过滤器 by tag (e.g., `VIP`) |

---

### 3. Get Contact Details
Retrieve the full profile for a single contact when you already have their contact ID.

**Tool:** `OMNISEND_GET_CONTACT`

| 参数 | Type | 必需 | Description |
|-----------|------|----------|-------------|
| `contactId` | string | Yes | Unique contact identifier (e.g., `60e7412b1234567890abcdef`) |

---

### 4. Update an Existing Contact
Patch specific fields on a contact by ID without overwriting the entire record.

**Tool:** `OMNISEND_UPDATE_CONTACT`

需要 the `contactId` and the fields to update. Retrieve the contact ID first via `OMNISEND_LIST_CONTACTS` or `OMNISEND_GET_CONTACT`.

---

### 5. Bulk Batch Operations
Process many records asynchronously in a single call -- contacts, products, orders, events, or categories.

**Tool:** `OMNISEND_CREATE_BATCH`

| 参数 | Type | 必需 | Description |
|-----------|------|----------|-------------|
| `method` | string | Yes | `POST` or `PUT` |
| `端点` | string | Yes | Target: `contacts`, `orders`, `products`, `events`, `categories` |
| `items` | array | Yes | Array of 载荷 objects for each 操作 |
| `eventID` | string | Conditional | 必需 when 端点 is `events` |

Use batch operations to avoid rate limits when processing large data sets.

---

## 已知陷阱

| Pitfall | Details |
|---------|---------|
| **Identifier required** | `OMNISEND_CREATE_OR_UPDATE_CONTACT` requires at least one identifier in the `identifiers` array -- only `email` type is supported |
| **游标-based pagination** | `OMNISEND_LIST_CONTACTS` uses base64-encoded `after`/`before` cursors, not page numbers -- follow cursors to avoid incomplete data |
| **Contact ID resolution** | `OMNISEND_UPDATE_CONTACT` requires a `contactId` -- always resolve it first via list or get operations |
| **Batch method constraints** | `OMNISEND_CREATE_BATCH` only accepts `POST` or `PUT` methods -- no `DELETE` or `PATCH` |
| **Event ID dependency** | When batching events, the `eventID` 参数 is mandatory -- omitting it causes the batch to fail |

---

## 快速参考

| 操作 | 方法 |
|---|---|
| 发现工具 | 调用 `RUBE_SEARCH_TOOLS` |
| 检查连接 | 调用 `RUBE_MANAGE_CONNECTIONS` |
| 执行工具 | 调用 `RUBE_MULTI_EXECUTE_TOOL` |
| 处理分页 | 检查响应中的 `cursor` 字段 |
| 错误处理 | 验证连接状态和schema合规性 |

| Tool 标识符 | 目的 |
|-----------|---------|
| `OMNISEND_CREATE_OR_UPDATE_CONTACT` | Create or upsert a contact by email |
| `OMNISEND_LIST_CONTACTS` | List contacts with filtering and 游标 pagination |
| `OMNISEND_GET_CONTACT` | Get full profile for a single contact by ID |
| `OMNISEND_UPDATE_CONTACT` | Patch specific fields on an existing contact |
| `OMNISEND_CREATE_BATCH` | Bulk async operations for contacts, products, orders, events |

---

*Powered by [Composio](https://composio.dev)*
