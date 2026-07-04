---
name: Toggl Automation
description: "通过自然语言命令自动执行 Toggl Track 中的时间跟踪工作流——创建时间条目、管理项目、客户、标签和工作区。"
requires:
  mcp:
    - rube
---

# Toggl 自动化

直接从 Claude Code 自动化你的 Toggl Track 时间追踪操作。记录时间、管理项目和客户、使用标签组织、控制工作区——全部无需离开终端。

**工具包文档：** [composio.dev/toolkits/toggl](https://composio.dev/toolkits/toggl)

---

## 设置

1. 使用 URL 将 Rube MCP 服务器添加到你的 Claude Code 配置中：`https://rube.app/mcp`
2. 出现提示时，通过提供的连接链接验证你的 Toggl Track 帐户
3. 开始使用自然语言自动化时间跟踪工作流程

---

## 核心工作流程

### 1. 创建和停止时间条目

使用项目、任务和标签关联或启动/停止计时器记录时间。

**工具：** `TOGGL_CREATE_TIME_ENTRY`, `TOGGL_PATCH_STOP_TIME_ENTRY`

```
开始一个时间