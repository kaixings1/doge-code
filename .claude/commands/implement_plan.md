---
description: 根据 thoughts/shared/plans 实施技术计划并验证
---

# 实施计划

你的任务是实施来自 `thoughts/shared/plans/` 的已批准技术计划。这些计划包含具有具体变更和成功标准的阶段。

## 入门

当给定计划路径时：
- 完整读取计划并检查任何现有的勾选标记（- [x]）
- 读取原始工单和计划中提及的所有文件
- **完整读取文件** —— 绝不使用 limit/offset 参数，你需要完整的上下文
- 深入思考各部分如何组合在一起
- 创建待办列表以跟踪你的进展
- 如果你理解需要做什么就开始实施

如果未提供计划路径，询问一个。

## 实施理念

计划经过精心设计，但现实可能很混乱。你的工作是：
- 遵循计划的意图，同时适应你所发现的
- 在进入下一阶段之前完整实现每个阶段
- 验证你的工作在更广泛的代码库上下文中有意义
- 完成章节时更新计划中的复选框

当事情与计划不完全匹配时，思考为什么并清晰沟通。计划是你的指南，但你的判断也很重要。

如果你遇到不匹配：
- **停止**并深入思考为什么计划无法遵循
- 清晰地呈现问题：
  ```
  Issue in Phase [N]:
  Expected: [what the plan says]
  Found: [actual situation]
  Why this matters: [explanation]

  How should I proceed?
  ```

## 验证方法

实现一个阶段后：
- 运行成功标准检查（通常 `make check test` 覆盖一切）
- 在继续之前修复任何问题
- 在计划和待办中更新你的进展
- 使用 Edit 在计划文件中勾选已完成项
- **暂停以进行人工验证**：完成一个阶段的所有自动化验证后，暂停并告知人工该阶段已准备好手动测试。使用此格式：
  ```
  Phase [N] Complete - Ready for Manual Verification

  Automated verification passed:
  - [List automated checks that passed]

  Please perform the manual verification steps listed in the plan:
  - [List manual verification items from the plan]

  Let me know when manual testing is complete so I can proceed to Phase [N+1].
  ```

如果被指示连续执行多个阶段，跳过暂停直到最后一个阶段。否则，假设你只做一个阶段。

在用户确认之前，不要勾选手动测试步骤中的项。


## 如果你卡住了

当某些东西没有按预期工作时：
- 首先，确保你已经阅读并理解了所有相关代码
- 考虑代码库是否自计划编写以来已演变
- 清晰呈现不匹配并要求指导

谨慎使用子任务——主要用于针对性调试或探索不熟悉的领域。

## 恢复工作

如果计划有现有的勾选标记：
- 相信已完成的工作是完成的
- 从第一个未勾选的项开始
- 仅当某些东西看起来有问题时才验证先前的工作

记住：你在实现一个解决方案，而不只是勾选框。牢记最终目标并保持前进势头。
