---
name: ultragoal
description: 持久化多目标工作流，在 .omc/ultragoal 下持久化计划/账本产物，并为当前会话输出 Claude /goal 交接文本。
argument-hint: "<brief or subcommand>"
level: 3
---

<Purpose>
Ultragoal 把一段简报拆解为一组有序的目标，把 start/checkpoint/blocker/failure 事件记录进一个持久化的、只追加的账本，并告诉当前活跃的 Claude agent 如何配合计划去驱动 Claude Code 的 `/goal` 斜杠命令。它不会——也无法——从 shell 修改 Claude `/goal` 的状态；它做的是持久化仓库状态，并打印一份面向模型的交接文本，由当前活跃的 agent 在会话内据此行动。
</Purpose>

<Use_When>
- 用户想要一种持久的、与仓库原生契合的方式，跨多个 Claude 会话或 worktree 跟踪一个 ultragoal
- 工作量足够大，需要用多个有序的“故事”来承载，并带有尝试次数与每个故事各自的证据
- 用户希望最终的完成必须通过 ai-slop-cleaner + verification + $code-review 三道关卡
- 用户希望当前活跃的 Claude `/goal` 指令与账本保持协同，这样会话重启也不会丢失进度
</Use_When>

<Do_Not_Use_When>
- 任务只是一处很小的改动——请改用直接委派或 `ralph`
- 用户希望助手真的从 shell 里自己去调用 `/goal`——这是做不到的；`omc ultragoal` 只写入产物并打印交接文本
- 用户只想要一个不带动执行循环的纯规划产物——请改用 `plan`
</Do_Not_Use_When>

<Why_This_Exists>
Claude Code `/goal` 是一个会话作用域的 Stop hook：在某个条件成立之前，它会阻止会话停止，并在成功时自动清除。作为单会话的执行原语，它非常出色，但它会跨会话丢失状态，自身也不强制设立最终评审关卡。`omc ultragoal` 增加了一层持久化计划、账本与关卡机制，让一个长期多步骤的计划能够挺过会话重启、全新 worktree 和一轮轮评审，同时仍然借助 Claude `/goal` 让当前活跃的 agent 保持专注。
</Why_This_Exists>

<How_To_Use>

1. 根据简报创建计划：
   ```
   omc ultragoal create-goals --brief-file plan.md
   ```
   或者显式给出各个故事：
   ```
   omc ultragoal create-goals --brief "推进这次迁移" \
     --goal "Schema::新增列" \
     --goal "Backfill::分批回填数据行" \
     --goal "Cutover::删除旧列并切换读取路径"
   ```
   默认模式是 `aggregate`（整轮运行由同一个 Claude `/goal` 覆盖）。
   如果你希望每个故事都有自己的 `/goal`，就传 `--claude-goal-mode per-story`。

   **多仓库工作区 / 并行会话：**当同一个工作区里有多个 Claude 会话
   需要并发运行 `/ultragoal` 时，传入
   `--plan-id <stable-id>` 或 `--auto-plan-id`，这样计划会被写入
   `.omc/ultragoal/plans/{planId}/`，而不是共享的单计划路径。
   不加这个参数，两个会话各自创建目标时就会互相覆盖。
   `--auto-plan-id` 会从简报标题推导出 `{epochMs}-{slug}`。之后，在该会话中
   后续的每一条子命令都要串上同一个 `--plan-id <id>`。
   需要时可以用 `omc ultragoal list-plans` 列出所有可用的 planId。

2. 开始（或恢复）下一个故事：
   ```
   omc ultragoal complete-goals
   ```
   这会打印一份面向模型的交接文本。当前活跃的 Claude agent 必须读取它，并：
   - 为本会话设置原生的 Claude `/goal`——在独立运行的 Claude Code 中，无论是
     shell 还是 agent 都做不到，所以要请用户输入 `/goal <aggregate objective>`，然后
     等待。`--claude-goal-json`（见下文）只用于对账账本，并不满足
     PreToolUse 的 `/goal` 守卫——该守卫会一直拦截工具调用，直到它观测到一个活跃的 `/goal`。
   - 推进这个故事。
   - 当故事完成时（对于最后一个故事，则是在通过完整质量关卡之后），回传一份当前活跃 `/goal` 状态的快照，并调用 `checkpoint`。

3. 对一个故事做 checkpoint：
   ```
   omc ultragoal checkpoint --goal-id G001-... --status complete \
     --evidence "tests/files/PR evidence" \
     --claude-goal-json '{"goal":{"objective":"...","status":"active"}}'
   ```
   对于最后一个故事，还要传入包含
   `aiSlopCleaner`、`verification`、`codeReview` 证据的 `--quality-gate-json`（三者都必须是干净通过的）。

4. 如果最终评审不干净，绝不要标记为完成。改为记录阻塞项：
   ```
   omc ultragoal record-review-blockers --goal-id G00X-... \
     --title "解决最终的代码评审阻塞项" \
     --objective "修复列出的评审发现并重跑最终关卡" \
     --evidence "<the review findings>" \
     --claude-goal-json '{"goal":{"objective":"...","status":"active"}}'
   ```
   这会追加一个新的阻塞故事，并让 Claude `/goal` 保持活跃。

5. 随时查看状态：
   ```
   omc ultragoal status
   ```

</How_To_Use>

<Important_Limitations>
- shell 无法调用或修改 Claude Code 的 `/goal` 状态。`omc ultragoal` 只持久化耐久产物，并打印出当前活跃的 Claude agent 会在会话内读取并执行的指令。
- 通过 `--claude-goal-json` 传入的快照，是模型自己提供的、关于活跃 `/goal` 状态的证明；OMC 会校验它们在文本上与计划预期的 objective 以及账本事件是否一致，但无法独立观测 Claude `/goal` 的状态。它们不满足 PreToolUse 的 `/goal` 守卫——该守卫要求确实存在一个活跃的 `/goal`，即由宿主注入的快照，或用户在会话内设置的原生 `/goal`。
- 如果 Claude `/goal` 斜杠命令被改名或重构，只需要改动交接文本的措辞；对账逻辑本身与名称无关。
</Important_Limitations>
