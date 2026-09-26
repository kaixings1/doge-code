---
name: merge-readiness
aliases: understanding-gate
description: "带状态支持的合并就绪检查，生成解释报告和人类可解释性测验。"
argument-hint: "[--quick|--standard|--deep] [--from-diff|--from-artifacts] <change summary or artifact path>"
---

<Purpose>
合并就绪是一项任务后的可解释性门禁。在实现、测试、QA 和审查证据都已具备之后，它会生成一份人类可读的变更解释，然后向人类提出有针对性的问题，以验证他们能够解释这项变更为何存在、改动了什么、做了哪些取舍、考虑了哪些风险，以及团队应当如何理解它。
</Purpose>

<Use_When>
- 一个任务、PR 或变更集在功能上已经完成，需要在进入合并就绪之前做最后一道人类理解度检查
- 测试、QA、代码审查、安全审查或其他验证已经跑过，或者缺失的证据必须被显式记录下来
- 用户希望由 AI 解释这项变更，然后测验人类是否能够解释它
- 在请求合并批准之前，你需要一份可持久保存的会话审计记录，说明团队为何能够信任并理解这项变更
</Use_When>

<Do_Not_Use_When>
- 实现之前需求尚不清晰；改用 `/deep-interview`
- 实现尚未完成；改用 `/ralph`、`/team` 或 `/autopilot`
- 测试或 QA 尚未运行，而用户期望这条命令能替代它们
- 用户想要的是代码审查结论；改用 `/review` 或相关的审查工作流
</Do_Not_Use_When>

<Why_This_Exists>
真正的交付不只是能跑通的代码。团队需要理解一项变更为何存在、改动了什么、哪些部分是刻意没有做的、考虑过哪些风险，以及未来的维护者应当如何看待这项变更。本工作流会在请求合并批准之前，把这种理解显式地固化下来。通过这道门禁从不意味着变更已被批准或已合并；它只意味着人类能够解释它。
</Why_This_Exists>

<Depth_Profiles>
- **Quick（`--quick`）**：小型/局部变更；正确率阈值 `>= 0.70`；最多 3 道选择题；必需维度：why / change / risk
- **Standard（`--standard`，默认）**：常规功能/缺陷修复；正确率阈值 `>= 0.80`；最多 5 道选择题；必需维度：why / change / tradeoff / risk / team
- **Deep（`--deep`）**：高风险、架构性、安全相关或跨模块的变更；正确率阈值 `>= 0.90`；最多 8 道选择题（在全部五个维度上做冗余覆盖）

如果未提供任何标志，则使用 **Standard**。阈值与轮次上限的权威定义在 `src/hooks/merge-readiness/mcq.ts`，必须与本文件保持同步。
</Depth_Profiles>

<Execution_Policy>
- 这是一条任务后命令。不要在此模式内实现代码。
- 在向人类询问那些本可在本地发现的事实时，先自行收集仓库与产物证据。
- 在一次 AI 步骤中生成解释文档 + 选择题，然后每轮一问地呈现选择题。
- 运行时（TS hook 代码）是主干：它负责校验、权威会话状态、客观的选择题评分和报告渲染。AI 负责内容生成，以及通过 AskUserQuestion 呈现选择题。
- 通过 AskUserQuestion 每轮一问地呈现每道选择题（deep-interview 风格）。每次选择都经运行时记录，以便进行客观评分。
- 提问应围绕可解释性，而不是实现层面的琐碎细节。
- 绝不要求人类记住行号、变量名、私有辅助函数名或偶然的实现细节。
- 得分即客观正确率（答对题数 / 已答题数），而不是关键词启发式判断。
- 如果所有必需选择题都已作答后正确率仍低于阈值，则把结果标记为 `paused`，并且不要声称已达成合并就绪。
- 如果缺少关键证据（没有 diff/变更信号），则把结果标记为 `blocked`。
- 通过这道门禁并不等于批准合并、替代测试、替代审查、替代安全审查、接受风险或绕过维护者批准。
- 为便于恢复，把状态持久化到 `.omc/state/merge-readiness-state.json`（按会话隔离时位于 `.omc/state/sessions/<sessionId>/`）。不要直接写入该文件。
- v1 只提供建议性质：门禁逻辑（`checkMergeReadiness`）并未接入 Stop hook，因此一个处于活跃状态的门禁不会阻塞会话。它既不执行也不批准 Git 合并。
</Execution_Policy>

<Steps>

## 第 0 阶段：证据收集

1. 解析 `{{ARGUMENTS}}`、深度档位和来源模式（`--from-diff|--from-artifacts`），并推导出一个任务 slug。不支持 `--from-pr`；本工作流只使用本地证据。
2. 收集可用的证据（运行时按文件名启发式规则识别产物；文件内容从不被解析）：
   - 本地 Git diff 与提交区间
   - 变更的文件
   - 测试/QA/验证类产物（文件名匹配 `test|spec|qa|verify|validation`）
   - 审查/风险/安全/就绪/结论类产物（文件名匹配 `review|risk|security|readiness|verdict`）
   - `.omc/plans/`、`.omc/specs/`、`.omc/interviews/`、`.omc/artifacts/`、`.omc/logs/`，以及相关的模式状态产物（`.omc/state/` 下记录真实运行的规范命名 `{mode}-state.json` 文件）
3. 显式记录缺失的证据。缺失的证据不会被一份好的解释所掩盖。

## 第 1 阶段：初始化

以变更摘要调用 `merge_readiness_start` 工具来初始化状态（运行时解析 `--quick`/`--deep` 档位（当两个标志都不存在时，`--standard` 是默认值；它不是一个被解析的 token））。状态结构如下：

```json
{
  "active": true,
  "current_phase": "merge-readiness",
  "phase": "content",
  "profile": "standard",
  "threshold": 0.80,
  "max_rounds": 5,
  "required_dimensions": ["why", "change", "tradeoff", "risk", "team"],
  "questions": [],
  "answers": [],
  "awaiting_content": true,
  "readiness_score": 0,
  "result": "pending"
}
```

在 AI 通过 `merge_readiness_set_content` 提交生成的文档 + 选择题之前，`awaiting_content` 一直为 true。

## 第 2 阶段：生成解释文档 + 选择题（AI 内容步骤）

基于真实 diff + 证据（而非模板）生成：

1. 一段 5 小节的叙述：**为何做**、**改动了什么**、**取舍**、**考虑过的风险**、**团队理解**。
2. 一组选择题（每题一个正确选项，带 `correctOptionId` + 可选的 `rationale`）：
   - 数量不超过该档位的最大轮次（quick 3 / standard 5 / deep 8）
   - 分布在各个必需维度上
   - 考查对本次变更的理解，而不是实现层面的琐碎细节

用 `merge_readiness_set_content` 提交它们（需要由 `merge_readiness_start` 建立的活动门禁；若没有活动门禁则会报错）。不要写入状态 JSON，也不要调用运行时内部函数。无效内容会被拒绝，并返回可恢复的校验错误。通过校验的内容会持久化到权威会话状态中。

使用 `merge_readiness_report` 直接从状态渲染五个小节、证据、测验进度、就绪度和合并边界。它是只读的，不会创建文件。在本次作答完成之前，正确答案与理由保持隐藏；取消或覆盖只会揭示已作答的问题。

合并边界必须写明："通过意味着人类能够解释这项变更。它并不批准合并、不替代测试、不替代审查，也不接受风险。"

### 维护者覆盖权限

只有当 MCP 服务启动器在 `OMC_MERGE_READINESS_AUTHENTICATED_PRINCIPAL` 中注入了一个已认证主体，并且该主体被包含在逗号分隔的 `OMC_MERGE_READINESS_MAINTAINERS` 允许列表中时，`/merge-readiness --override <reason>` 才会被接受。调用方提供的 `session_id` 只用于选定状态记录；它绝不是覆盖权限，也不会被记录为 `override_owner`。

## 第 3 阶段：人类测验循环（选择题，每轮一问，deep-interview 风格）

通过 AskUserQuestion 每轮一问地呈现每道选择题，把选项 id/文本作为可选项，然后用 `merge_readiness_record_answer` 工具（questionId + optionId）记录人类的选择。运行时会客观评分，然后要么推进到下一道题，要么结束门禁（pass / paused / blocked）。

在通过之前要覆盖以下维度（quick 只考 why/change/risk）：

1. **why** —— 为什么这项变更值得做
2. **change** —— 什么行为、工作流、接口或维护模型发生了改变
3. **tradeoff** —— 选择了什么、推迟了什么、否决了什么，以及原因
4. **risk** —— 考虑过哪些风险，以及哪些部分仍具风险
5. **team** —— 团队应当如何理解并维护这项变更

禁止的题型：

- 函数名琐碎细节
- 行号琐碎细节
- 变量名回忆
- 私有辅助函数背诵
- 任何其答案无助于审阅者解释该变更的问题

## 第 4 阶段：就绪度评分（由运行时负责，客观）

运行时计算：

- `readiness_score` = 正确率 = （答对题数）/（已答题数），取值于 [0, 1]
- 逐维度覆盖 = 每个必需维度是否至少有一道已作答的选择题

门禁结果：

- `pass`：所有必需选择题均已作答，且正确率 >= 阈值，且必需维度均已覆盖
- `paused`：所有必需选择题均已作答，但正确率低于阈值（或有必需维度未覆盖）
- `blocked`：缺少最小必要证据（没有 diff/变更信号）

阈值：quick `0.70` / standard `0.80` / deep `0.90`。

## 第 5 阶段：结晶结果

把以下字段持久化到终态会话状态中，并用 `merge_readiness_report` 检查它们：

- 最终就绪度得分
- 维度明细
- 人类的回答
- AI 评估
- 结果
- 阻塞或暂停的缺口
- 下一步

## 第 6 阶段：交接

如果结果为 `pass`：
- 说明该变更可以进入人类合并批准环节。
- 不要执行合并。

如果结果为 `paused`：
- 说明缺失的是哪个解释维度。
- 建议重读或修订报告，然后重新运行 `/merge-readiness`。

如果结果为 `blocked`：
- 说明在重新运行之前必须先产出哪些证据。

</Steps>

<Tool_Usage>
- 在向人类询问上下文之前，先用仓库搜索和本地产物完成证据收集。
- 在可用时使用结构化用户提问。
- 用 `merge_readiness_start` 初始化门禁，用 `merge_readiness_set_content` 提交报告 + 选择题，用 `merge_readiness_record_answer` 记录每次选择，用 `merge_readiness_report` 渲染当前审计记录。对 `.omc/state/merge-readiness-state.json` 只使用状态读取/查询/清除；绝不要用通用的状态写入来提交测验内容。`state_clear` 会让 merge-readiness 走取消路径并保留终态；请传入当前 session_id，以免取消并发的测验。
</Tool_Usage>

<Escalation_And_Stop_Conditions>
- 用户说 stop/cancel/abort -> 持久化终态 `cancelled` 并停止。
- 缺少 diff 或变更证据 -> `blocked`。
- 人类无法解释某个必需维度 -> `paused`。
- 达到就绪度阈值且强制门禁均满足 -> `pass`。
</Escalation_And_Stop_Conditions>

<Final_Checklist>
- [ ] 证据收集已完成
- [ ] 缺失证据已记录
- [ ] 解释文档（5 个小节）+ 选择题已通过 merge_readiness_set_content 提交
- [ ] 选择题已通过 AskUserQuestion 每轮一问地呈现
- [ ] 每个回答都已从带标记的 AskUserQuestion 输出中对应取出（客观评分）
- [ ] 问题避开了实现层面的琐碎细节
- [ ] 正确率由运行时计算
- [ ] 结果为 `pass`、`paused`、`blocked`、`overridden` 或 `cancelled`
- [ ] 合并边界已明确说明
- [ ] 未直接执行实现或合并
</Final_Checklist>

<Advanced>
## 推荐的交付流水线

```text
/deep-interview
  -> /omc-plan 或 /ralplan
  -> /ralph、/team 或 /autopilot
  -> /ultraqa 与审查
  -> /merge-readiness
  -> 人类合并批准
```

## Autopilot 桥接

配置开启后，Autopilot 可以在 QA/验证之后调用本工作流：

```jsonc
{
  "autopilot": {
    "mergeReadiness": true
  }
}
```

`autopilot.understandingGate` 是 `autopilot.mergeReadiness` 的已废弃兼容别名。
</Advanced>

任务：{{ARGUMENTS}}
