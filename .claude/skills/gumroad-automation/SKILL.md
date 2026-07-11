---
name: 行 Gumroad 产品管理
description: "通过 Composio MCP 集成使用自然语言自动执行 Gumroad 产品管理、销售跟踪、许可证验证和 webhook 订阅。"
category: e-commerce
requires:
  mcp:
    - rube
---

# Gumroad 自动化

自动化您的 Gumroad 商店——列出产品、跟踪销售、验证许可证和管理实时 webhook——全部通过自然语言命令完成。

**工具包文档：** [composio.dev/toolkits/gumroad](https://composio.dev/toolkits/gumroad)

---

## 设置

1. 将 Composio MCP 服务器添加到您的客户端配置：
   ```
   https://rube.app/mcp
   ```
2. 根据提示连接您的 Gumroad 账户（API 密钥认证）。
3. 开始发出自然语言命令来管理您的 Gumroad 商店。

---

## 核心工作流

### 1. 列出所有产品
检索您已验证的 Gumroad 账户中的每个产品，以获取下游操作所需的产品 ID。

**工具：** `GUMROAD_LIST_PRODUCTS`

**示例提示：**
> "列出我所有的 Gumroad 产品"

**参数：** 无需参数——返回已验证账户的所有产品。

---

### 2. 带筛选条件的销售跟踪
检索成功销售记录，可选择按邮箱、日期范围、产品或分页进行筛选。

**工具：** `GUMROAD_GET_SALES`

**示例提示：**
> "显示 2025 年 1 月产品 prod_ABC123 的所有 Gumroad 销售记录"

**关键参数：**
- `after` -- ISO8601 日期/时间，筛选此时间之后的销售（例如 `2025-01-01T00:00:00Z`）
- `before` -- ISO8601 日期/时间，筛选此时间之前的销售
- `email` -- 按客户邮箱地址筛选
- `product_id` -- 按特定产品 ID 筛选
- `page` -- 分页结果的页码（至少 1）

---

### 3. 验证许可证密钥
检查许可证密钥对特定产品是否有效，检查使用次数，或验证会员资格。

**工具：** `GUMROAD_VERIFY_LICENSE`

**示例提示：**
> "验证产品 prod_ABC123 的许可证密钥 ABCD-EFGH-IJKL-MNOP"

**关键参数（全部必需）：**
- `product_id` -- 要验证的产品 ID（2023 年 1 月 9 日当日及之后创建的产品必需）
- `license_key` -- 许可证密钥字符串（例如 `ABCD-EFGH-IJKL-MNOP`）
- `increment_uses_count` -- 是否增加使用计数（默认为 true）

---

### 4. 订阅 Webhook 事件
通过将您的端点 URL 订阅到特定的 Gumroad 资源事件来设置实时事件通知。

**工具：** `GUMROAD_SUBSCRIBE_TO_RESOURCE`

**示例提示：**
> "将我的 webhook https://example.com/hook 订阅到 Gumroad 销售事件"

**关键参数（全部必需）：**
- `resource_name` -- 其中之一：`sale`、`refund`、`dispute`、`dispute_won`、`cancellation`、`subscription_updated`、`subscription_ended`、`subscription_restarted`
- `post_url` -- 接收 HTTP POST 通知的端点 URL

---

### 5. 列出活跃的 Webhook 订阅
在添加新的 webhook 订阅之前，查看给定资源类型的现有订阅以避免重复。

**工具：** `GUMROAD_GET_RESOURCE_SUBSCRIPTIONS`

**示例提示：**
> "显示我所有活跃的 Gumroad 销售事件 webhook 订阅"

**关键参数（必需）：**
- `resource_name` -- 八种支持的事件类型之一（例如 `sale`、`refund`）

---

## 已知陷阱

- **许可证验证需要产品 ID**：2023 年 1 月 9 日当日及之后创建的产品需要 `product_id` 参数。较旧的产品可能无需此参数即可工作，但建议提供。
- **销售记录分页**：销售结果是分页的。始终通过递增 `page` 参数检查是否还有更多页。
- **Webhook 去重**：在订阅资源之前，使用 `GUMROAD_GET_RESOURCE_SUBSCRIPTIONS` 检查现有订阅以避免重复 webhook。
- **ISO8601 日期格式**：销售记录的日期筛选必须使用 ISO8601 格式（例如 `2025-01-01T00:00:00Z`），而非普通日期。

---

## 快速参考

| 操作 | 方法 |
|---|---|
| 发现工具 | 调用 `RUBE_SEARCH_TOOLS` |
| 检查连接 | 调用 `RUBE_MANAGE_CONNECTIONS` |
| 执行工具 | 调用 `RUBE_MULTI_EXECUTE_TOOL` |
| 处理分页 | 检查响应中的 `cursor` 字段 |
| 错误处理 | 验证连接状态和schema合规性 |

| 操作 | 工具标识 | 必需参数 |
|---|---|---|
| 列出产品 | `GUMROAD_LIST_PRODUCTS` | 无 |
| 获取销售记录 | `GUMROAD_GET_SALES` | 无（所有筛选条件均为可选） |
| 验证许可证 | `GUMROAD_VERIFY_LICENSE` | `product_id`、`license_key` |
| 订阅事件 | `GUMROAD_SUBSCRIBE_TO_RESOURCE` | `resource_name`、`post_url` |
| 列出 webhook 订阅 | `GUMROAD_GET_RESOURCE_SUBSCRIPTIONS` | `resource_name` |

---

*由 [Composio](https://composio.dev) 提供支持*
