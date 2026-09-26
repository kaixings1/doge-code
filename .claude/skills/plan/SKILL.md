---
name: omc-plan
description: 带可选访谈工作流的战略规划。在用户想要在实现之前先规划时使用。
argument-hint: "[--direct|--consensus|--review] [--interactive] [--deliberate] <task description>"
pipeline: [deep-interview]
handoff-policy: approval-required
handoff: .omc/plans/ralplan-*.md
level: 4
---

<Purpose>
Plan 通过智能交互创建全面、可执行的工作计划。它自动判断是访谈用户（宽泛请求）还是直接规划（详细请求），并支持共识模式（带 RALPLAN-DR 结构化审议的 Planner → Architect → Critic 迭代循环）和审查模式（由 Critic 评估既有计划）。
</Purpose>

<Use_When>

- 用户想在实现之前先规划 —— "plan this"、"plan the"、"let's plan"
- 用户想对一个含糊的想法做结构化需求收集
- 用户想审查一份既有计划 —— "review this plan"、`--review`
- 用户想对一个计划获得多视角共识 —— `--consensus`、"ralplan"
- 任务宽泛或含糊，在写任何代码之前需要先界定范围
  </Use_When>

<Do_Not_Use_When>

- 用户想要自主的端到端执行 —— 改用 `autopilot`
- 用户想在任务清晰时立刻开始编码 —— 使用 `ralph` 或委派给 executor
- 用户问了一个可直接回答的简单问题 —— 直接回答即可
- 任务是范围明显的单个聚焦修复 —— 使用执行技能，而非从这个规划模块运行
  </Do_Not_Use_When>

<Why_This_Exists>
在不理解需求的情况下直接写代码会导致返工、范围蔓延和遗漏边界情况。Plan 提供结构化的需求收集、专家分析和经过质量把关的计划，让执行从坚实的基础上开始。共识模式为高风险项目增加了多视角验证。
</Why_This_Exists>

<Execution_Policy>

- 根据请求的具体程度自动判断访谈模式还是直接模式
- 访谈期间一次只问一个问题 —— 绝不把多个问题批量提出
- 先通过 `explore` 代理收集代码库事实，再就此询问用户
- 计划必须达到质量标准：80% 以上的论断引用 file/line，90% 以上的标准可测试
- 共识模式默认全自动运行；添加 `--interactive` 可在草稿评审和最终批准步骤启用用户提示
- 共识模式默认使用 RALPLAN-DR short 模式；用 `--deliberate` 切换到 deliberate 模式，或在请求明确暗示高风险时切换（认证/安全、数据迁移、破坏性/不可逆变更、生产事故、合规/PII、公共 API 破坏）
- **规划/执行边界：** 规划模式只检查上下文并产出计划/规格/提案。除用户已在本轮或通过结构化批准界面明确选择执行外，它们**必须**把工件标记为 `pending approval`。在获得明确执行批准之前，规划模式**不得**运行面向修改的 shell 命令、编辑源文件、提交、推送、开 PR、调用执行技能或委派实现任务。
- **Goal 工作流边界：** 当计划比较 Claude Code 的 `/goal`、Ralph、Team、UltraQA 或仅工件的 Ultragoal 时，确定**唯一**一个主循环权威，并使用确定性的冲突策略 `refuse`、`adopt_existing` 和 `artifact_only`，而非不确定性的警告处理。`/goal` 的事实**只能**引用 Claude Code/Anthropic 来源（Claude Code `/goal` 文档：https://code.claude.com/docs/en/goal；Anthropic Claude Code 变更日志：https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md），且计划**不得**声称 `/goal` 求值器独立运行命令或读取文件；在任何完成断言之前要求出示已浮出水面的证据。
- **Goal 工作流文档目标：** 对面向用户的比较，保持示例与 `docs/shared/mode-selection-guide.md#goal-oriented-workflow-selection` 以及 `docs/REFERENCE.md#goal-workflow-ux-goal-ralph-team-ultraqa-ultragoal` 一致。
  </Execution_Policy>

<Steps>

### 模式选择

| 模式 | 触发条件 | 行为 |
| --------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Interview | 宽泛请求的默认模式 | 交互式需求收集 |
| Direct | `--direct`，或详细请求 | 跳过访谈，直接生成计划 |
| Consensus | `--consensus`、"ralplan" | Planner → Architect → Critic 循环直到达成一致，采用 RALPLAN-DR 结构化审议（默认 short，高风险用 `--deliberate`）；添加 `--interactive` 可在草稿和批准步骤启用用户提示 |
| Review | `--review`、"review this plan" | 由 Critic 评估既有计划 |

### 访谈模式（宽泛/含糊请求）

1. **对请求分类**：宽泛型（动词含糊、无具体文件、涉及 3 个以上区域）触发访谈模式
2. **提出一个聚焦的问题**，用 `AskUserQuestion` 询问偏好、范围和约束
3. **先收集代码库事实**：在问"你的代码用了什么模式？"之前，先生成 `explore` 代理去查明，然后再问有依据的追问
4. **基于回答推进**：每个问题都建立在前一个回答之上
5. **咨询 Analyst**（Opus）以发现隐藏需求、边界情况和风险
6. 当用户表示就绪时**创建计划**："create the plan"、"I'm ready"、"make it a work plan"

### 直接模式（详细请求）

1. **快速分析**：可选的简短 Analyst 咨询
2. **创建计划**：立即生成全面的工作计划
3. **审查**（可选）：如要求则进行 Critic 审查

### 共识模式（`--consensus` / "ralplan"）

**RALPLAN-DR 模式**：**Short**（默认，受限结构）和 **Deliberate**（用于 `--deliberate` 或明确的高风险请求）。两种模式保持相同的 Planner → Architect → Critic 顺序和相同的 `AskUserQuestion` 关卡。

**提供方覆盖（在已安装提供方 CLI 时支持）：**

- `--architect codex` —— 把 Claude Architect 环节替换为 `omc ask codex --agent-prompt architect "..."`，用于实现密集型的架构审查
- `--critic codex` —— 把 Claude Critic 环节替换为 `omc ask codex --agent-prompt critic "..."`，用于执行前的外部审查
- 如果请求的提供方不可用，简要说明并继续使用该阶段的默认 Claude Architect/Critic 步骤

**状态生命周期**：持久化模式的 stop hook 使用 `ralplan-state.json` 在共识循环期间强制续跑。该技能**必须**管理此状态：

- **进入时**：在第 1 步之前调用 `state_write(mode="ralplan", active=true, session_id=<current_session_id>)`
- **交接给执行时**（批准 → ralph/team）：调用 `state_write(mode="ralplan", active=false, session_id=<current_session_id>)`。此处**不要**用 `state_clear` —— `state_clear` 会写入一个 30 秒的取消信号，禁用**所有**模式的 stop-hook 强制，使新启动的执行模式失去保护。
- **真正终止退出时**（驳回、非交互式计划输出、错误/中止）：调用 `state_clear(mode="ralplan", session_id=<current_session_id>)` —— 其后没有执行模式，因此取消信号窗口无害。
- **不要**在 Critic 批准或达到最大迭代次数展示这类中间步骤清除状态，因为用户仍可能选择 "Request changes"。

若不清理，stop hook 会用 `[RALPLAN - CONSENSUS PLANNING]` 强化消息阻塞之后的所有停止，即使共识工作流已结束。始终传递 `session_id`，以避免清除其他并发会话的状态。

1. **Planner** 创建初始计划，并在任何 Architect 审查之前产出一份精简的 **RALPLAN-DR 摘要**。摘要**必须**包含：
   - **Principles**（3-5 条）
   - **Decision Drivers**（前 3 项）
   - **Viable Options**（≥2 个），每个选项带有界的优缺点
   - 如果只剩一个可行选项，需对被否决的替代方案给出明确的**失效理由**
   - 在 **deliberate 模式**下：一份 **pre-mortem**（3 个失败场景）和一份**扩展测试计划**，覆盖 **单元 / 集成 / e2e / 可观测性**
2. **用户反馈** _（仅 --interactive）_：如果用 `--interactive` 运行，**必须**使用 `AskUserQuestion` 呈现草稿计划**外加 RALPLAN-DR 的 Principles / Decision Drivers / Options 摘要以便早期对齐方向**，选项如下：
   - **Proceed to review** —— 送交 Architect 和 Critic 评估
   - **Request changes** —— 带着用户反馈回到第 1 步
   - **Skip review** —— 直接进入最终批准（第 7 步）
     若**未**用 `--interactive` 运行，则自动进入审查（第 3 步）。
3. **Architect** 用 `Task(subagent_type="oh-my-claudecode:architect", ...)` 审查架构合理性。Architect 审查**必须**包含：针对最受青睐选项的最强 steelman 反论（对立面）、至少一处有意义的权衡张力，以及（在可能时）一条综合路径。在 deliberate 模式下，Architect 应显式标记违反原则之处。**在进入第 4 步之前等待本步骤完成。** 不要把第 3 步和第 4 步并行运行。
4. **Critic** 用 `Task(subagent_type="oh-my-claudecode:critic", ...)` 按质量标准评估。Critic **必须**校验原则与选项的一致性、替代方案探索的充分性、风险缓解的清晰度、验收标准的可测试性以及具体的验证步骤。Critic **必须**明确否决肤浅的替代方案、驱动因素自相矛盾、含糊的风险或薄弱的验证。在 deliberate 模式下，Critic **必须**否决缺失/薄弱的 pre-mortem 或缺失/薄弱的扩展测试计划。仅在第 3 步完成后运行。
5. **重审循环**（最多 5 轮）：如果 Critic 驳回，执行以下闭环：
   a. 收集来自 Architect + Critic 的全部驳回反馈
   b. 把反馈交给 Planner 产出修订版计划
   c. **回到第 3 步** —— Architect 审查修订版计划
   d. **回到第 4 步** —— Critic 评估修订版计划
   e. 重复直到 Critic 批准，或达到最多 5 轮
   f. 如果达到最大轮数仍未获批准，通过 `AskUserQuestion` 把最佳版本呈现给用户，并注明未达成专家共识
6. **应用改进**：当审查者带着改进建议批准时，在继续之前把所有被接受的改进合并进计划文件。最终共识输出**必须**包含一个 **ADR** 章节，含：**Decision**、**Drivers**、**Alternatives considered**、**Why chosen**、**Consequences**、**Follow-ups**。具体而言：
   a. 收集来自 Architect 和 Critic 响应的全部改进建议
   b. 对建议去重并归类
   c. 用被接受的改进更新 `.omc/plans/` 中的计划文件（补充缺失细节、细化步骤、强化验收标准、更新 ADR 等）
   d. 在计划末尾用一个简短的变更日志章节记录应用了哪些改进
7. 在 Critic 批准（且改进已应用）后：把计划状态标记为 `pending approval`，除非已经取得明确的执行批准。_（仅 --interactive）_ 如果用 `--interactive` 运行，使用 `AskUserQuestion` 呈现计划，选项如下：
   - **Approve execution via team**（推荐）—— 明确选择通过协同的并行团队代理（`/team`）继续。自 v4.1.7 起，Team 是规范的编排界面。
   - **Approve execution via ralph** —— 明确选择通过 ralph+ultrawork 继续（带验证的顺序执行）
   - **Compact then return for execution approval** —— 明确选择先压缩上下文窗口（在规划后上下文很大时推荐），然后在已保存的待批准计划处停下，并在启动执行前再次询问
   - **Request changes** —— 带着用户反馈回到第 1 步
   - **Reject** —— 完全丢弃该计划
     若**未**用 `--interactive` 运行，输出标记为 `pending approval` 的最终计划，调用 `state_clear(mode="ralplan", session_id=<current_session_id>)`，然后停止。不要自动执行。
8. _（仅 --interactive）_ 用户通过结构化的 `AskUserQuestion` 界面选择（绝不以纯文本征求批准）。如果用户选择 **Reject**，调用 `state_clear(mode="ralplan", session_id=<current_session_id>)` 并停止。
9. 在用户批准后（仅 --interactive）：在调用执行技能（ralph/team）**之前**调用 `state_write(mode="ralplan", active=false, session_id=<current_session_id>)`，以使 stop hook 不干扰执行模式自身的强制。此处不要用 `state_clear` —— 它会写入取消信号，从而禁用新启动模式的强制机制。
   - **Approve execution via team**：**必须**调用 `Skill("oh-my-claudecode:team")`，并把 `.omc/plans/` 中已批准的计划路径作为上下文。不要直接实现。team 技能跨分阶段流水线协调并行代理，以更快执行大型任务。这是推荐的执行默认路径。
   - **Approve execution via ralph**：**必须**调用 `Skill("oh-my-claudecode:ralph")`，并把 `.omc/plans/` 中已批准的计划路径作为上下文。不要直接实现。不要在规划代理中编辑源代码文件。ralph 技能通过 ultrawork 并行代理处理执行。
   - **Compact then return for execution approval**：先调用 `Skill("compact")` 压缩上下文窗口（减少规划期间累积的 token 用量），然后带着已保存的待批准计划路径返回，并要求在任何 ralph/team 启动前获得一次全新的明确执行批准。当规划会话后上下文窗口已占用 50% 以上时，推荐此路径。

### 审查模式（`--review`）

1. 从 `.omc/plans/` 读取计划文件
2. 用 `Task(subagent_type="oh-my-claudecode:critic", ...)` 交由 Critic 评估
3. 返回裁决：APPROVED、REVISE（附具体反馈）或 REJECT（需要重新规划）

### 计划输出格式

每份计划包含：

- 需求摘要
- 验收标准（可测试）
- 实现步骤（带文件引用）
- 风险与缓解措施
- 验证步骤
- 对 consensus/ralplan：**RALPLAN-DR 摘要**（Principles、Decision Drivers、Options）
- 对 consensus/ralplan 最终输出：**ADR**（Decision、Drivers、Alternatives considered、Why chosen、Consequences、Follow-ups）
- 对 deliberate 共识模式：**Pre-mortem（3 个场景）**和**扩展测试计划**（单元/集成/e2e/可观测性）

计划保存到 `.omc/plans/`。草稿保存到 `.omc/drafts/`。
</Steps>

<Tool_Usage>

- 对偏好类问题（范围、优先级、时间线、风险容忍度）使用 `AskUserQuestion` —— 提供可点击界面
- 对需要具体值的问题（端口号、名称、后续澄清）使用纯文本
- 在询问用户之前，用 `explore` 代理（Haiku，30 秒超时）收集代码库事实
- 对大范围计划的规划校验使用 `Task(subagent_type="oh-my-claudecode:planner", ...)`
- 需求分析使用 `Task(subagent_type="oh-my-claudecode:analyst", ...)`
- 在共识与审查模式下的计划评审使用 `Task(subagent_type="oh-my-claudecode:critic", ...)`
- **关键 —— 共识模式下的代理调用必须串行，绝不并行。** 始终先等待 Architect 的 Task 结果，再发出 Critic 的 Task。
- 共识模式下默认使用 RALPLAN-DR short 模式；在 `--deliberate` 或明确的高风险信号下启用 deliberate 模式（认证/安全、迁移、破坏性变更、生产事故、合规/PII、公共 API 破坏）
- 带 `--interactive` 的共识模式：用户反馈步骤（第 2 步）和最终批准步骤（第 7 步）使用 `AskUserQuestion` —— 绝不以纯文本征求批准。不带 `--interactive` 时，跳过这两个提示，把计划标记为 `pending approval`，输出最终计划并停止。
- 带 `--interactive` 的共识模式下，在用户明确批准后**必须**调用 `Skill("oh-my-claudecode:ralph")` 或 `Skill("oh-my-claudecode:team")` 执行（第 9 步）—— 绝不在规划代理中直接实现
- 在获得明确执行批准之前，规划模式**不得**运行面向修改的 shell 命令、编辑文件、提交、推送、开 PR、调用执行技能或委派实现任务；它只能检查上下文，以及起草/更新计划/规格/提案类工件。
- 当用户在第 7 步选择 "Compact then return for execution approval"（仅 --interactive）：保持计划标记为 `pending approval`，调用 `state_write(mode="ralplan", active=false, current_phase="pending_approval", session_id=<current_session_id>)`，然后调用 `Skill("compact")` 压缩累积的规划上下文。压缩之后，在任何 ralph/team 启动前要求一次全新的明确执行批准；绝不从压缩续跑中自动开始实现
- **关键 —— 共识模式状态生命周期**：在停止或交接给执行之前，始终停用 ralplan 状态。交接路径（批准 → ralph/team）使用 `state_write(active=false)`，真正终止退出（驳回、错误）使用 `state_clear`。**绝不**在启动执行模式前使用 `state_clear` —— 其取消信号会禁用 stop-hook 强制达 30 秒。
  </Tool_Usage>

<Examples>
<Good>
自适应访谈（先收集事实再提问）：
```
Planner: [生成 explore 代理："查找认证实现"]
Planner: [收到："认证在 src/auth/ 中，使用 JWT 加 passport.js"]
Planner: "我看到你在 src/auth/ 中使用了 JWT 认证加 passport.js。
         对这个新功能，我们应该扩展现有认证，还是再加一套独立的认证流程？"
```
好的原因：先自行回答自己的代码库问题，然后再提一个有依据的偏好问题。
</Good>

<Good>
一次只问一个问题：
```
Q1: "主要目标是什么？"
A1: "提升性能"
Q2: "就性能而言，哪个更重要 —— 延迟还是吞吐量？"
A2: "延迟"
Q3: "就延迟而言，我们要优化的是 p50 还是 p99？"
```
好的原因：每个问题都建立在前一个回答之上。聚焦且递进。
</Good>

<Bad>
询问本可自行查到的事情：
```
Planner: "你的代码库里认证是在哪里实现的？"
User: "呃，我想大概在 src/auth 的某处吧？"
```
不好的原因：规划器应生成 explore 代理去查明，而不是问用户。
</Bad>

<Bad>
把多个问题批量提出：
```
"范围是什么？时间线呢？目标用户又是谁？"
```
不好的原因：一次三个问题会导致回答肤浅。一次只问一个。
</Bad>

<Bad>
一次性呈现所有设计选项：
```
"这里有 4 种方案：选项 A……选项 B……选项 C……选项 D……你更倾向于哪一个？"
```
不好的原因：决策疲劳。先呈现一个带权衡的选项，获取反应，然后再呈现下一个。
</Bad>
</Examples>

<Escalation_And_Stop_Conditions>

- 当需求已清晰到可以规划时停止访谈 —— 不要过度访谈
- 共识模式下，在 5 轮 Planner/Architect/Critic 迭代后停止并呈现最佳版本。此处**不要**清除 ralplan 状态 —— 用户在后续步骤中仍可能选择 "Request changes"。状态只在用户最终选择（批准/驳回）时清除，或在非交互模式下输出计划时清除。
- 不带 `--interactive` 的共识模式输出标记为 `pending approval` 的最终计划并停止；带 `--interactive` 时，在任何实现开始之前要求用户明确批准。停止前**始终**调用 `state_clear(mode="ralplan", session_id=<current_session_id>)`。
- 如果用户说 "just do it" 或 "skip planning" 而未明确指定执行路径，把它视为结束规划的请求：把当前计划/规格/提案输出为 `pending approval`，并通过结构化批准界面请求明确的执行批准。在该批准存在之前，不要从规划模块调用 `Skill("oh-my-claudecode:ralph")`、修改文件、委派实现、提交、推送或开 PR。
- 当存在需要业务决策的不可调和权衡时，升级给用户
  </Escalation_And_Stop_Conditions>

<Final_Checklist>

- [ ] 计划有可测试的验收标准（90% 以上是具体的）
- [ ] 计划在适用处引用具体文件/行（80% 以上的论断）
- [ ] 所有风险都已识别出缓解措施
- [ ] 无缺少度量的含糊措辞（"快" → "p99 < 200ms"）
- [ ] 计划已保存到 `.omc/plans/`
- [ ] 共识模式下：RALPLAN-DR 摘要包含 3-5 条原则、前 3 项驱动因素，以及 ≥2 个可行选项（或明确的失效理由）
- [ ] 共识模式最终输出：包含 ADR 章节（Decision / Drivers / Alternatives considered / Why chosen / Consequences / Follow-ups）
- [ ] deliberate 共识模式下：包含 pre-mortem（3 个场景）+ 扩展测试计划（单元/集成/e2e/可观测性）
- [ ] 带 `--interactive` 的共识模式：任何执行前用户已明确批准；不带时：计划输出仅标记为 `pending approval`，不自动执行
- [ ] 共识模式下：ralplan 状态在每条退出路径上都被停用 —— 交接给执行用 `state_write(active=false)`，终止退出（驳回、错误、非交互停止）用 `state_clear`
      </Final_Checklist>

<Advanced>
## 设计选项呈现

在访谈期间呈现设计选择时，要分块呈现：

1. **概览**（2-3 句话）
2. **选项 A** 及其权衡
3. [等待用户反应]
4. **选项 B** 及其权衡
5. [等待用户反应]
6. **推荐**（仅在选项讨论过之后）

每个选项的格式：

```
### 选项 A：[名称]
**方案：** [1 句话]
**优点：** [要点列表]
**缺点：** [要点列表]

你对这个方案有什么看法？
```

## 问题分类

在提出任何访谈问题之前，先对其分类：

| 类型 | 示例 | 动作 |
| --------------- | ------------------------------------- | ------------------------------ |
| 代码库事实 | "存在哪些模式？"、"X 在哪里？" | 先探索，不要问用户 |
| 用户偏好 | "优先级？"、"时间线？" | 通过 AskUserQuestion 询问用户 |
| 范围决策 | "包含功能 Y 吗？" | 询问用户 |
| 需求 | "性能约束？" | 询问用户 |

## 评审质量标准

| 标准项 | 要求 |
| ------------ | -------------------------- |
| 清晰度 | 80% 以上的论断引用 file/line |
| 可测试性 | 90% 以上的标准是具体的 |
| 可验证性 | 所有文件引用都存在 |
| 具体性 | 无含糊措辞 |

## 弃用通知

独立的 `/planner`、`/ralplan` 和 `/review` 技能已合并进 `/plan`。所有工作流（访谈、直接、共识、审查）都通过 `/plan` 提供。
</Advanced>
