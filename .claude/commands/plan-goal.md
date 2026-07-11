---
description: "将 Claude Code 的 /goal 桥接到当前计划。从 task_plan.md 推导目标条件并调用 /goal，使 Claude 持续工作直到计划完成。v2.38.0 起可用。"
disable-model-invocation: true
allowed-tools: "Read Bash"
---

将当前计划桥接到 Claude Code 的 `/goal` 原语。

步骤：

1. 解析当前计划：优先使用 `${PLAN_ID}` 环境变量，然后是 `.planning/.active_plan`，然后是最新的 `.planning/<dir>/`，最后是 `./task_plan.md`。
2. 读取已解析的 `task_plan.md`。
3. 从计划内容推导目标条件：
   - 默认："task_plan.md 中的所有阶段报告状态：完成且 check-complete.sh 报告所有阶段完成"
   - 如果用户传递了参数：将其作为附加条件（例如 `/plan-goal until all tests pass`）
4. 使用推导出的文本发出 Claude Code 的 `/goal <condition>`。
5. 向用户确认：打印目标条件 + 当前计划 ID + 提醒 `/goal clear` 可取消。

如果 `task_plan.md` 不存在，拒绝并指示用户先运行 `/plan`。

为什么存在：

`/goal` 运行智能体直到一个小型快速模型确认条件已满足。它仅评估对话记录，不评估文件。通过从计划文件推导条件，此命令将基于文件的计划转换为 `/goal` 的可衡量终止条件，因此循环在实际计划完成时终止，而非对话看起来完成时。

注意事项：

- `/plan-goal` 不替代 `/goal`。它与 `/goal` 组合使用。用户仍然可以直接运行 `/goal "any text"`。
- 推导出的条件保持在 `/goal` 强制执行的 4000 字符限制内，仅引用阶段标题 + 验收标准，而非完整任务正文。
- 与 `/plan-loop` 组合使用可实现"保姆式直到完成"工作流：`/plan-loop` 节奏 + `/plan-goal` 终止。
