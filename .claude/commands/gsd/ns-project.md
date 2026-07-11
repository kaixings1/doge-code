---
name: gsd-project
项目生命周期 | 里程碑 审计 摘要。
argument-hint: ""
allowed-tools:
  - Read
  - Skill
---

根据用户意图路由到适当的项目/里程碑技能。
`gsd-plan-milestone-gaps` 已通过 #2790 删除——差距规划现在内联发生，
作为 `gsd-audit-milestone` 输出的一部分。

| 用户想要 | 调用 |
|---|---|
| 启动新项目 | gsd-new-project |
| 创建新里程碑 | gsd-new-milestone |
| 完成当前里程碑 | gsd-complete-milestone |
| 审计里程碑问题 | gsd-audit-milestone |
| 总结里程碑状态 | gsd-milestone-summary |

Invoke the matched skill directly using the Skill tool.
