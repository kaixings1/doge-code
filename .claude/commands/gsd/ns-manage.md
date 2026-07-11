---
name: gsd-manage
配置 工作区 | 工作流 工作线 更新 发布 收件箱。
argument-hint: ""
allowed-tools:
  - Read
  - Skill
requires: [config, workspace, workstreams, thread, pause-work, resume-work, update, ship, inbox, pr-branch, undo]
---

根据用户意图路由到适当的管理技能。
`gsd-config`（设置 + 高级 + 集成 + 配置文件）和 `gsd-workspace`
（新建 + 列出 + 移除）是 #2790 之后的合并条目。

| 用户想要 | 调用 |
|---|---|
| 配置 GSD 设置（基础/高级/集成/配置文件） | gsd-config |
| 管理工作区（创建/列出/移除） | gsd-workspace |
| 管理并行工作线 | gsd-workstreams |
| 在新上下文线程中继续工作 | gsd-thread |
| Pause current work | gsd-pause-work |
| Resume paused work | gsd-resume-work |
| Update the GSD installation | gsd-update |
| Ship completed work | gsd-ship |
| Process inbox items | gsd-inbox |
| Create a clean PR branch | gsd-pr-branch |
| Undo the last GSD action | gsd-undo |

Invoke the matched skill directly using the Skill tool.
