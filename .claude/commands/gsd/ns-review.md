---
name: gsd-quality
质量门 | 代码审查 调试 审计 安全 评估 UI。
argument-hint: ""
allowed-tools:
  - Read
  - Skill
requires: [code-review, audit-uat, secure-phase, eval-review, ui-review, validate-phase, debug, forensics]
---

根据用户意图路由到适当的质量/审查技能。
`gsd-code-review-fix` 已通过 #2790 被 `gsd-code-review --fix` 吸收。

| 用户想要 | 调用 |
|---|---|
| 审查代码质量和正确性 | gsd-code-review |
| 自动修复代码审查发现 | gsd-code-review --fix |
| 审计 UAT/验收测试 | gsd-audit-uat |
| 阶段安全审查 | gsd-secure-phase |
| 评估 AI 响应质量 | gsd-eval-review |
| Review UI for design and accessibility | gsd-ui-review |
| Validate phase outputs | gsd-validate-phase |
| Debug a failing feature or error | gsd-debug |
| Forensic investigation of a broken system | gsd-forensics |

Invoke the matched skill directly using the Skill tool.
