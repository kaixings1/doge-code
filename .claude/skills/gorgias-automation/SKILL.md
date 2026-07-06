---
name: Gorgias Automation
description: "自动执行 Gorgias 中的电商客服工作流——通过自然语言命令管理工单、客户、标签和团队。"
requires:
  mcp:
    - rube
---

# Gorgias 自动化

直接从 Claude Code 自动化您的 Gorgias 客服操作。创建、更新和分类支持工单，管理客户，组织您的支持团队——无需离开终端。

**工具包文档：** [composio.dev/toolkits/gorgias](https://composio.dev/toolkits/gorgias)

---

## 设置

1. 将 Rube MCP 服务器添加到您的 Claude Code 配置中，URL 为 `https://rube.app/mcp`
2. 根据提示，通过提供的连接链接认证您的 Gorgias 账户
3. 开始使用自然语言自动化您的支持工作流

---

## 核心工作流

### 1. 列出和筛选工单

通过状态、渠道、负责人、日期范围等条件检索工单。

**工具：** `GORGIAS_LIST_TICKETS`

```
列出过去 7 天内从电子邮件渠道创建的所有未结工单
```

关键参数：
- `status` -- 按工单状态筛选（例如 "open"、"closed"）
- `channel` -- 按渠道筛选（例如 "email"、"chat"）
- `assignee_user_id` / `assignee_team_id` -- 按分配的客服或团队筛选
- `created_from` / `created_to` -- ISO 日期范围筛选
- `limit`（最大 100）/ `offset` -- 分页控制
- `order_by` / `order_dir` -- 排序选项

### 2. 创建和更新工单

创建新工单或更新现有工单的分配、优先级和状态变更。

**工具：** `GORGIAS_CREATE_TICKET`、`GORGIAS_UPDATE_TICKET`、`GORGIAS_GET_TICKET`

```
为客户 12345 创建一个关于缺失订单的高优先级工单，主题为"订单 #9876 未送达"
```

- `GORGIAS_CREATE_TICKET` 需要 `customer_id`；接受 `subject`、`status`、`priority`、`channel`、`messages`、`tags`
- `GORGIAS_UPDATE_TICKET` 需要 `ticket_id`；所有其他字段均为可选的局部更新
- `GORGIAS_GET_TICKET` 通过 `ticket_id` 检索完整的工单详情

### 3. 管理工单标签

为工单添加标签以进行分类、路由和报告。

**工具：** `GORGIAS_ADD_TICKET_TAGS`、`GORGIAS_LIST_TICKET_TAGS`

```
为工单 5678 添加标签 101 和 202，然后显示该工单的所有标签
```

- `GORGIAS_ADD_TICKET_TAGS` 需要 `ticket_id` 和 `tag_ids`（整数数组）
- `GORGIAS_LIST_TICKET_TAGS` 需要 `ticket_id` 来检索当前标签

### 4. 客户管理

创建新客户或合并重复的客户记录。

**工具：** `GORGIAS_CREATE_CUSTOMER`、`GORGIAS_MERGE_CUSTOMERS`、`GORGIAS_LIST_CUSTOMERS`

```
创建一个名为"张三"的新客户，邮箱为 zhangsan@example.com，电话渠道
```

- `GORGIAS_CREATE_CUSTOMER` 需要 `name`；接受 `email`、`channels`（包含 `type` 和 `value` 的数组）、`external_id`、`address`、`data`
- `GORGIAS_MERGE_CUSTOMERS` 需要 `source_customer_id` 和 `target_customer_id` -- 源客户合并到目标客户
- `GORGIAS_LIST_CUSTOMERS` 检索带筛选选项的客户列表

### 5. 团队与账户操作

列出团队、检索账户信息以及查看工单自定义字段。

**工具：** `GORGIAS_LIST_TEAMS`、`GORGIAS_GET_TEAM`、`GORGIAS_GET_ACCOUNT`、`GORGIAS_LIST_TICKET_FIELD_VALUES`

```
显示我们 Gorgias 账户中的所有支持团队
```

- `GORGIAS_GET_ACCOUNT` 返回账户级别的指标和配置
- `GORGIAS_LIST_TEAMS` / `GORGIAS_GET_TEAM` 管理团队查询
- `GORGIAS_LIST_TICKET_FIELD_VALUES` 返回指定工单的自定义字段值

### 6. 活动与事件跟踪

监控工单活动和客户事件历史。

**工具：** `GORGIAS_LIST_EVENTS`

```
列出近期事件以查看我们的支持队列中有哪些活动
```

- `GORGIAS_LIST_EVENTS` 提供带筛选选项的活动时间线

---

## 已知陷阱

- **需要分页：** `GORGIAS_LIST_TICKETS` 使用 `limit`/`offset` 分页。不循环页面将错过较旧的工单并产生不完整的数据。
- **筛选条件精确性：** `GORGIAS_LIST_TICKETS` 缺少或过于宽泛的筛选条件可能导致导出超载或遗漏所需的报告窗口。始终为时间范围查询设置 `created_from`/`created_to`。
- **自定义字段是独立的：** 关键业务 KPI 可能仅存在于自定义字段中。您必须显式查询 `GORGIAS_LIST_TICKET_FIELD_VALUES` 才能包含它们。
- **速率限制：** 在 `GORGIAS_LIST_TICKETS` 和相关端点上的高量导出可能触及 Gorgias 的速率限制。添加退避策略并从最后一个偏移量继续。
- **认证错误：** 任何 Gorgias 工具上的 401/403 响应都表示令牌或权限问题。不要将部分数据视为完整数据集。

---

## 快速参考

| 操作 | 方法 |
|---|---|
| 发现工具 | 调用 `RUBE_SEARCH_TOOLS` |
| 检查连接 | 调用 `RUBE_MANAGE_CONNECTIONS` |
| 执行工具 | 调用 `RUBE_MULTI_EXECUTE_TOOL` |
| 处理分页 | 检查响应中的 `cursor` 字段 |
| 错误处理 | 验证连接状态和架构合规性 |

| 工具标识 | 描述 |
|---|---|
| `GORGIAS_LIST_TICKETS` | 带筛选条件列出工单（状态、渠道、日期、负责人） |
| `GORGIAS_GET_TICKET` | 通过 ID 检索特定工单 |
| `GORGIAS_CREATE_TICKET` | 创建新工单（需要 `customer_id`） |
| `GORGIAS_UPDATE_TICKET` | 更新工单字段（需要 `ticket_id`） |
| `GORGIAS_ADD_TICKET_TAGS` | 为工单添加标签 |
| `GORGIAS_LIST_TICKET_TAGS` | 列出工单上的所有标签 |
| `GORGIAS_LIST_TICKET_FIELD_VALUES` | 列出工单的自定义字段值 |
| `GORGIAS_CREATE_CUSTOMER` | 创建新客户（需要 `name`） |
| `GORGIAS_MERGE_CUSTOMERS` | 合并两条客户记录 |
| `GORGIAS_LIST_CUSTOMERS` | 带筛选条件列出客户 |
| `GORGIAS_LIST_TEAMS` | 列出所有团队 |
| `GORGIAS_GET_TEAM` | 检索特定团队 |
| `GORGIAS_GET_ACCOUNT` | 检索账户信息 |
| `GORGIAS_LIST_EVENTS` | 带筛选条件列出活动事件 |

---

*由 [Composio](https://composio.dev) 提供支持*
