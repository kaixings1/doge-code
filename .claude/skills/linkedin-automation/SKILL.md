---
name: Linkedin 自动化
description: "通过 Rube MCP (Composio) 自动执行 LinkedIn 任务：创建帖子、管理个人资料、公司信息、评论和图片上传。使用前始终先搜索工具以获取当前 schema。"
risk: critical
source: community
date_added: "2026-02-27"
---

# LinkedIn 自动化

通过 Rube MCP 使用 Composio 的 LinkedIn 工具包自动执行 LinkedIn 操作。

## 前提条件

- Rube MCP 必须已连接（RUBE_SEARCH_TOOLS 可用）
- 通过 `RUBE_MANAGE_CONNECTIONS` 建立活跃的 LinkedIn 连接，工具包为 `linkedin`
- 始终先调用 `RUBE_SEARCH_TOOLS` 获取当前工具 schema

## 设置

**获取 Rube MCP**：在客户端配置中将 `https://rube.app/mcp` 添加为 MCP 服务器。无需 API 密钥 — 只需添加 端点 即可使用。

1. 通过确认 `RUBE_SEARCH_TOOLS` 响应来验证 Rube MCP 可用
2. 使用工具包 `linkedin` 调用 `RUBE_MANAGE_CONNECTIONS`
3. 如果连接不是 ACTIVE，按返回的认证链接完成 LinkedIn OAuth
4. 在运行任何工作流之前确认连接状态显示 ACTIVE

## 核心工作流

### 1. 创建 LinkedIn 帖子

**何时使用**：用户想要在 LinkedIn 上发布文本帖子

**工具顺序**：
1. `LINKEDIN_GET_MY_INFO` - 获取已验证用户的个人资料信息 [前置]
2. `LINKEDIN_REGISTER_IMAGE_UPLOAD` - 如果帖子包含图片则注册图片上传 [可选]
3. `LINKEDIN_CREATE_LINKED_IN_POST` - 发布帖子 [必需]

**关键参数**：
- `text`：帖子内容文本
- `visibility`：'PUBLIC' 或 'CONNECTIONS'
- `media_title`：附加媒体的标题
- `media_description`：附加媒体的描述

**陷阱**：
- 必须在创建帖子前通过 GET_MY_INFO 获取用户个人资料 URN
- 图片上传需要两步过程：先注册上传，然后在帖子中包含资源
- 帖子文本受 LinkedIn API 的字符限制
- 可见性默认值可能不同；始终显式指定

### 2. 获取个人资料信息

**何时使用**：用户想要检索他们的 LinkedIn 个人资料或公司信息

**工具顺序**：
1. `LINKEDIN_GET_MY_INFO` - 获取已验证用户的个人资料 [必需]
2. `LINKEDIN_GET_COMPANY_INFO` - 获取公司页面信息 [可选]

**关键参数**：
- GET_MY_INFO 无需参数（使用已验证用户）
- `organization_id`：用于 GET_COMPANY_INFO 的公司/组织 ID

**陷阱**：
- GET_MY_INFO 仅返回已验证用户；无法查询其他用户
- 公司信息需要数字组织 ID，而非公司名称或自定义 URL
- 某些个人资料字段可能受 OAuth 作用域限制

### 3. 管理帖子图片

**何时使用**：用户想要上传图片并附加到 LinkedIn 帖子

**工具顺序**：
1. `LINKEDIN_REGISTER_IMAGE_UPLOAD` - 向 LinkedIn 注册图片上传 [必需]
2. 将图片二进制文件上传到返回的上传 URL [必需]
3. `LINKEDIN_GET_IMAGES` - 验证上传的图片状态 [可选]
4. `LINKEDIN_CREATE_LINKED_IN_POST` - 使用图片资源创建帖子 [必需]

**关键参数**：
- `owner`：图片拥有者的 URN（用户或组织）
- `image_id`：用于 GET_IMAGES 的上传图片 ID

**陷阱**：
- 上传是两阶段过程：先注册然后上传二进制文件
- 创建帖子时必须使用注册时返回的图片资源 URN
- 支持的格式通常包括 JPG、PNG 和 GIF
- 大图片可能需要时间处理才能可用

### 4. 评论帖子

**何时使用**：用户想要评论现有的 LinkedIn 帖子

**工具顺序**：
1. `LINKEDIN_CREATE_COMMENT_ON_POST` - 添加评论到帖子 [必需]

**关键参数**：
- `post_id`：要评论的帖子的 URN 或 ID
- `text`：评论内容
- `actor`：评论者的 URN（用户或组织）

**陷阱**：
- 帖子 ID 必须是有效的 LinkedIn URN 格式
- 评论者 URN 必须匹配已验证用户或管理的组织
- 评论创建有速率限制；避免快速连续评论

### 5. 删除帖子

**何时使用**：用户想要删除之前发布的 LinkedIn 帖子

**工具顺序**：
1. `LINKEDIN_DELETE_LINKED_IN_POST` - 删除指定帖子 [必需]

**关键参数**：
- `post_id`：要删除的帖子的 URN 或 ID

**陷阱**：
- 删除是永久性的，无法撤销
- 只有帖子作者或组织管理员可以删除帖子
- post_id 必须是创建帖子时返回的确切 URN

## 常见模式

### ID 解析

**来自个人资料的用户 URN**：
```
1. 调用 LINKEDIN_GET_MY_INFO
2. 提取用户 URN（例如 'urn:li:person:XXXXXXXXXX'）
3. 在后续调用中使用 URN 作为 actor/owner
```

**来自公司的组织 ID**：
```
1. 使用 organization_id 调用 LINKEDIN_GET_COMPANY_INFO
2. 提取用于以公司页面身份发布的组织 URN
```

### 图片上传流程

- 调用 REGISTER_IMAGE_UPLOAD 获取上传 URL 和资源 URN
- 将图片二进制文件上传到提供的 URL
- 创建带媒体的帖子时使用资源 URN
- 如果上传状态不确定，使用 GET_IMAGES 验证

## 已知陷阱

**认证**：
- LinkedIn OAuth 令牌的作用域有限；确保已授予所需权限
- 令牌会过期；如果 API 调用返回 401 错误则重新认证

**URN 格式**：
- LinkedIn 使用 URN 标识符（例如 'urn:li:person:ABC123'）
- 始终使用完整的 URN 格式，而不仅仅是字母数字 ID 部分
- 组织 URN 不同于个人 URN

**速率限制**：
- LinkedIn API 对帖子创建和评论有严格的每日速率限制
- 对批量操作实现退避策略
- 监控 429 响应并遵守 Retry-After 标头

**内容限制**：
- 帖子受 API 强制的字符限制
- 某些内容类型（投票、文档）可能需要额外的 API 功能
- 帖子文本中不支持 HTML 标记

## 快速参考

| 操作 | 方法 |
|---|---|
| 发现工具 | 调用 `RUBE_SEARCH_TOOLS` |
| 检查连接 | 调用 `RUBE_MANAGE_CONNECTIONS` |
| 执行工具 | 调用 `RUBE_MULTI_EXECUTE_TOOL` |
| 处理分页 | 检查响应中的 `cursor` 字段 |
| 错误处理 | 验证连接状态和schema合规性 |

| Task | Tool 标识符 | Key Params |
