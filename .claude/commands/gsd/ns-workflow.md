---
name: gsd-workflow
工作流 | 讨论 规划 执行 验证 阶段 进度。
argument-hint: ""
allowed-tools:
  - Read
  - Skill
requires: [discuss-phase, spec-phase, plan-phase, execute-phase, verify-work, phase, progress, ultraplan-phase, plan-review-convergence]
---

根据用户意图路由到适当的阶段管道技能。
下面的子技能名称是 #2790 之后的合并目标——`gsd-phase`
吸收了之前的 add/insert/remove/edit-phase 命令，`gsd-progress`
吸收了之前的 next/do 命令。

| 用户想要 | 调用 |
|---|---|
| 在规划前收集上下文 | gsd-discuss-phase |
| 明确阶段的交付内容 | gsd-spec-phase |
| 创建 PLAN.md | gsd-plan-phase |
| Execute plans in a phase | gsd-execute-phase |
| Verify built features through UAT | gsd-verify-work |
| Add / insert / remove / edit a phase | gsd-phase |
| Advance to the next logical step | gsd-progress |
| Offload planning to the ultraplan cloud | gsd-ultraplan-phase |
| Cross-AI plan review convergence loop | gsd-plan-review-convergence |

Invoke the matched skill directly using the Skill tool.
