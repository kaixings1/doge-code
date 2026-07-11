---
name: gsd-ideate
探索 捕获 | 探索 草图 探针 规范 捕获。
argument-hint: ""
allowed-tools:
  - Read
  - Skill
requires: [capture, explore, sketch, spike, spec-phase]
---

根据用户意图路由到适当的探索/捕获技能。
`gsd-note`、`gsd-add-todo`、`gsd-add-backlog` 和 `gsd-plant-seed` 已通过 #2790
合并到 `gsd-capture`（带有 `--note`、默认、`--backlog`、`--seed` 模式）。
捕获目标通过 `--list` 列出待处理的待办事项。

| 用户想要 | 调用 |
|---|---|
| 探索想法或机会 | gsd-explore |
| 草拟粗略设计或计划 | gsd-sketch |
| 有时间限制的技术探针 | gsd-spike |
| Write a spec for a phase | gsd-spec-phase |
| Capture a thought (todo / note / backlog / seed) | gsd-capture |

Invoke the matched skill directly using the Skill tool.
