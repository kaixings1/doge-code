---
name: ultragoal
description: "超级目标 — 将大型任务分解为有序目标集，持久跟踪执行进度"
参数-hint: "<brief or subcommand>"
level: 3
---

<目的>
Ultragoal将简报分解为有序目标集，在持久追加日志中记录开始/检查点/阻塞/失败事件，并指导活动Claude代理如何与计划一起驱动Claude Code `/goal`斜杠命令。它不能从shell修改Claude `/goal`状态；它持久化仓库状态并打印面向模型的交接说明，活动代理必须在会话中执行。
</目的>

<使用时机>
- 用户希望使用持久、仓库原生方式跨多个Claude会话或工作树跟踪超级目标
- 工作足够大，需要多个有序"故事"、尝试计数和每个故事的证据
- 用户希望最终完成通过ai-slop-cleaner + 验证 + 代码审查门控
- 用户希望活动Claude `/goal`指令与日志协调，以便会话重启不会丢失进度
</使用时机>

<不使用时机>
- 任务是单个小更改 — 使用直接委托或`ralph`代替
- 用户希望助手从shell直接调用`/goal` — 这不可能；`omc ultragoal`仅写入工件并打印交接文本
- 用户想要仅规划工件，没有执行循环 — 使用`plan`代替
</不使用时机>

<存在原因>
Claude Code `/goal`是会话范围的停止钩子：它阻止会话停止直到条件满足，并在成功时自动清除。这是一个很好的单会话执行原语，但它在会话之间丢失状态，并且本身不强制执行最终审查门控。`omc ultragoal`添加了持久计划、日志和门控层，使长期多步骤计划能够在会话重启、新工作树和审查迭代中存活，同时仍利用Claude `/goal`保持活动代理专注。
</存在原因>

<使用方法>

1. 从简报创建计划：
   ```
   omc ultragoal create-goals --brief-file plan.md
   ```
   或使用明确的故事：
   ```
   omc ultragoal create-goals --brief "ship the 迁移" \
     --goal "架构::Add new columns" \
     --goal "Backfill::Backfill rows in batches" \
     --goal "Cutover::Drop old columns and switch reads"
   ```
   默认模式是`aggregate`（一个Claude `/goal`覆盖整个运行）。
   如果希望每个故事有自己的`/goal`，请传递`--claude-goal-mode per-story`。

   **多仓库工作空间/并行会话：** 当同一工作空间中的多个Claude会话需要同时运行`/ultragoal`时，传递`--plan-id <stable-id>`或`--auto-plan-id`，以便计划写入`.omc/ultragoal/plans/{planId}/`而不是共享的单计划路径。
   没有此标志，两个创建目标的会话会相互覆盖。
   `--auto-plan-id`从简报标题派生`{epochMs}-{标识符}`。然后在同一会话的每个后续子命令中传递相同的`--plan-id <id>`。
   需要时使用`omc ultragoal list-plans`枚举可用planId。

2. 开始（或恢复）下一个故事：
   ```
   omc ultragoal complete-goals
   ```
   这会打印面向模型的交接说明。活动Claude代理必须阅读它并：
   - 确认/设置此会话中的活动`/goal`条件。
   - 执行故事工作。
   - 当故事完成时（对于最终故事，在完整质量门控之后），共享活动`/goal`状态的快照并调用`checkpoint`。

3. 检查点故事：
   ```
   omc ultragoal checkpoint --goal-id G001-... --status complete \
     --evidence "tests/files/PR evidence" \
     --claude-goal-json '{"goal":{"objective":"...","status":"active"}}'
   ```
   对于最终故事，还要传递包含`aiSlopCleaner`、`verification`和`codeReview`证据（全部干净）的`--quality-gate-json`。

4. 如果最终审查不干净，请勿标记完成。记录阻塞项：
   ```
   omc ultragoal record-review-blockers --goal-id G00X-... \
     --title "Resolve final code-review blockers" \
     --objective "Fix the listed review findings and rerun final gates" \
     --evidence "<the review findings>" \
     --claude-goal-json '{"goal":{"objective":"...","status":"active"}}'
   ```
   这会追加新的阻塞故事并保持Claude `/goal`活动。

5. 随时检查状态：
   ```
   omc ultragoal status
   ```

</使用方法>

<重要限制>
- shell不能调用或修改Claude Code `/goal`状态。`omc ultragoal`仅持久化工件并打印活动Claude代理在会话中读取和执行的指令。
- 通过`--claude-goal-json`传递的快照是模型提供的活动`/goal`状态证明；OMC验证它们与计划预期目标和日志事件的文本一致性，但不能独立观察Claude `/goal`状态。
- 如果Claude `/goal`斜杠命令重命名或重组，只需更改交接措辞；协调逻辑是名称无关的。
</重要限制>
