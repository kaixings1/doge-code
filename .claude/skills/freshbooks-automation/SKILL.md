---
name: freshbooks-自动化
description: "自动化 FreshBooks 操作：在 FreshBooks 云端记账中管理业务、项目、时间追踪和计费。始终先调用 RUBE_SEARCH_TOOLS 获取最新工具架构。"
requires:
  mcp: [rube]
---

# FreshBooks 自动化

自动化 FreshBooks 操作，包括列出业务、管理项目、追踪时间以及为中小企业会计监控预算。

**工具包文档：**[composio.dev/toolkits/freshbooks](https://composio.dev/toolkits/freshbooks)

---

## 设置

此技能需要连接 **Rube MCP 服务器** `https://rube.app/mcp`。

在执行任何工具之前，确保 `freshbooks` 工具包存在活跃连接。如果没有活跃连接，通过 `RUBE_MANAGE_CONNECTIONS` 发起一个。

---

## 核心工作流

### 1. 列出业务

检索与已认证用户关联的所有业务。此响应中的 `business_id` 对大多数其他 FreshBooks API 调用是必需的。

**工具：** `FRESHBOOKS_LIST_BUSINESSES`

**参数：** 无需参数。

**示例：**
```
工具：FRESHBOOKS_LIST_BUSINESSES
参数：{}
```

**输出：** 返回业务成员信息，包括用户有权访问的所有业务及其在每个业务中的角色。

> **重要：** 始终先调用此方法获取有效的 `business_id`，然后再执行项目特定的操作。

---

### 2. 列出和筛选项目

检索业务的所有项目，提供全面的筛选和排序选项。

**工具：** `FRESHBOOKS_LIST_PROJECTS`

**关键参数：**
- `business_id`（必需）-- 从 `FRESHBOOKS_LIST_BUSINESSES` 获取的业务 ID
- `active` -- 按活跃状态筛选：`true`（仅活跃）、`false`（仅不活跃）、省略则返回全部
- `complete` -- 按完成状态筛选：`true`（已完成）、`false`（未完成）、省略则返回全部
- `sort_by` -- 排序方式：`"created_at"`、`"due_date"` 或 `"title"`
- `updated_since` -- RFC3339 格式的 UTC 日期时间，例如 `"2026-01-01T00:00:00Z"`
- `include_logged_duration` -- `true` 则包含每个项目记录的总时间（秒）
- `skip_group` -- `true` 则省略团队成员/邀请数据（减少响应大小）

**示例：**
```
工具：FRESHBOOKS_LIST_PROJECTS
参数：
  business_id: 123456
  active: true
  complete: false
  sort_by: "due_date"
  include_logged_duration: true
```

**使用场景：**
- 获取所有项目用于时间跟踪或开票
- 按客户、状态或日期范围查找项目
- 监控项目完成情况和预算跟踪
- 检索团队分配和项目分组

---

### 3. 监控活跃项目

通过筛选活跃、未完成的项目来跟踪项目进度和预算。

**步骤：**
1. 调用 `FRESHBOOKS_LIST_BUSINESSES` 获取 `business_id`
2. 调用 `FRESHBOOKS_LIST_PROJECTS`，参数为 `active: true`、`complete: false`、`include_logged_duration: true`
3. 分析每个项目的已记录时长与预算的关系

---

### 4. 查看最近更新的项目

使用 `updated_since` 筛选器检查最近的项目活动。

**步骤：**
1. 调用 `FRESHBOOKS_LIST_BUSINESSES` 获取 `business_id`
2. 调用 `FRESHBOOKS_LIST_PROJECTS`，将 `updated_since` 设置为截止日期时间
3. 审查返回的项目以了解最近的更改

**示例：**
```
工具：FRESHBOOKS_LIST_PROJECTS
参数：
  business_id: 123456
  updated_since: "2026-02-01T00:00:00Z"
  sort_by: "created_at"
```

---

## 推荐执行计划

1. **获取业务 ID**：调用 `FRESHBOOKS_LIST_BUSINESSES`
2. **列出项目**：使用获取的 `business_id` 调用 `FRESHBOOKS_LIST_PROJECTS`
3. **按需筛选**：使用 `active`、`complete`、`updated_since` 和 `sort_by` 参数

---

## 已知陷阱

| 陷阱 | 详情 |
|---------|--------|
| **business_id 必需** | 大多数 FreshBooks 操作需要 `business_id`。始终先调用 `FRESHBOOKS_LIST_BUSINESSES` 获取它。 |
| **日期格式** | `updated_since` 参数必须使用 RFC3339 格式：`"2026-01-01T00:00:00Z"`。其他格式将失败。 |
| **分页结果** | 项目列表响应是分页的。请检查响应中是否有其他页面。 |
| **空结果** | 如果没有项目存在或匹配应用的筛选器，则返回空列表。这不是错误。 |
| **记录时长单位** | 当 `include_logged_duration` 为 true 时，时长以秒为单位返回。转换为小时（除以 3600）以便显示。 |

---

## 快速参考

| 操作 | 方法 |
|---|---|
| 发现工具 | 调用 `RUBE_SEARCH_TOOLS` |
| 检查连接 | 调用 `RUBE_MANAGE_CONNECTIONS` |
| 执行工具 | 调用 `RUBE_MULTI_EXECUTE_TOOL` |
| 处理分页 | 检查响应中的 `cursor` 字段 |
| 错误处理 | 验证连接状态和架构合规性 |

| 工具 标识符 | 描述 |
|-----------|-------------|
| `FRESHBOOKS_LIST_BUSINESSES` | 列出已认证用户的所有业务 |
| `FRESHBOOKS_LIST_PROJECTS` | 列出业务的项目，支持筛选和排序 |

---

*由 [Composio](https://composio.dev) 提供支持*
