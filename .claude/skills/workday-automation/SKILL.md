---
name: Workday Automation
description: "自动执行 Workday 中的人力资源操作——通过自然语言命令管理员工、休假申请、缺勤余额和员工数据。"
requires: mcp: - rube
--- # Workday 自动化 通过 Rube MCP 自动执行 Workday 中的人力资源操作。 ## 前提条件 - Rube MCP 已连接
- 通过 `RUBE_MANAGE_CONNECTIONS` 建立有效的 Workday 连接
- 始终先调用 `RUBE_SEARCH_TOOLS` 获取当前工具 schema
