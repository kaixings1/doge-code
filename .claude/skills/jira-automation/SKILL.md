---
name: jira-automation
description: "通过 Rube MCP (Composio) 自动执行 Jira 任务：issues, projects, sprints, boards, comments, users。"
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
### 2. 创建和编辑 Issues
### 3. 管理 Sprint 和看板
### 4. 管理评论
### 5. 管理项目和用户
## 通用模式
### JQL 语法
### 分页
## 已知陷阱
| 任务 | 工具标识 | 关键参数 |
|---|---|---|
