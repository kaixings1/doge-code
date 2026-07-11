---
name: 迭代、看板、评论和用户管理
description: "通过 Rube MCP (Composio) 自动执行 Jira 任务：问题、项目、迭代、看板、评论和用户管理。"
risk: critical
source: community
date_added: "2026-02-27"
---
# Jira 自动化

通过 Composio 的 Jira 工具包和 Rube MCP 自动化 Jira 操作。

## 前提条件

- Rube MCP 必须已连接
- 使用 RUBE_MANAGE_CONNECTIONS 建立 Jira 连接
- 始终先调用 RUBE_SEARCH_TOOLS

## 核心工作流

### 1. 搜索和筛选 Issues

使用 JQL（Jira Query Language）精确搜索：
```
project = "PROJ" AND status = "In Progress" AND assignee = currentUser()
```

### 2. 创建和编辑 Issues

- 自动填充摘要、描述、优先级、经办人
- 批量更新状态和字段

### 3. 管理 Sprint 和看板

- 创建/关闭 Sprint
- 移动 Issue 到不同状态列
- 生成冲刺报告

### 4. 管理评论

- 自动添加工作日志
- 回复客户反馈
- 提交流转评

### 5. 管理项目和用户

- 列出项目成员和角色
- 分配/转移 Issue

## 通用模式

### JQL 语法

| 操作符 | 示例 |
|---------|------|
| `=` | `status = "Done"` |
| `!=` | `priority != "Low"` |
| `~` | `summary ~ "bug"`（模糊搜索） |
| `IN` | `status IN ("To Do", "In Progress")` |
| `AND` | `project = "X" AND sprint = 5` |
| `ORDER BY` | `created DESC` |

### 分页

- `startAt`：起始索引（从 0 开始）
- `maxResults`：每页数量（建议 50-100）

## 已知陷阱

| 任务 | 工具标识 | 关键参数 |
|---|---|---|
| 搜索 Issues | `JIRA_SEARCH_ISSUES` | `jql`, `startAt`, `maxResults` |
| 创建 Issue | `JIRA_CREATE_ISSUE` | `project`, `summary`, `issueType` |
| 更新 Issue | `JIRA_UPDATE_ISSUE` | `issueIdOrKey`, `fields` |
| 添加评论 | `JIRA_ADD_COMMENT` | `issueIdOrKey`, `body` |
| 过渡 Issue | `JIRA_TRANSITION_ISSUE` | `issueIdOrKey`, `transition` |

- 始终先搜索：工具 schema 会变化
- 检查连接：验证 ACTIVE 状态
- JQL 中日期使用 `yyyy/MM/dd` 格式
