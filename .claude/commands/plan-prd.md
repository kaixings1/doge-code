---
description: "生成一份精简、问题优先的 PRD，并交给 /plan 做实现规划。"
argument-hint: "[product/feature idea] (blank = start with questions)"
---

# PRD 命令

产出一份**产品需求文档**（PRD）—— SDLC 的需求阶段工件。它捕获取得成功必须为真的*是什么*以及*为什么*，并在*怎么做*之前止步。实现分解委派给 `/plan`。

**输入**：`$ARGUMENTS`

## 此命令的范围

| 此命令做 | 此命令**不**做 |
|---|---|
| 界定问题和用户 | 设计架构 |
| 捕获成功标准和范围 | 挑选文件或编写模式 |
| 列出开放问题和风险 | 枚举实现任务 |
| 写 `.claude/prds/{name}.prd.md` | 产出实现计划 —— 那是 `/plan` 的职责 |

如果你发现自己正在写实现细节，停下来并删掉它。那属于 `/plan`。

**反注水规则**：当信息缺失时，写 `TBD — needs validation via {method}`。绝不编造听起来合理但未经证实的需求。

## 工作流

四个阶段。每个阶段是一个单独的关卡 —— 提问、等待用户、然后继续。没有嵌套循环，没有并行的调研仪式。

### 阶段 1 —— 界定（FRAME）

如果 `$ARGUMENTS` 为空，询问：

> 你想构建什么？一两句话即可。

如果已提供，用一句话复述并询问：

> 我理解的是：*{复述}*。对吗，还是需要我调整？

然后用一组问题询问界定问题：

> 1. **谁**有这个问题？（具体的角色或人群）
> 2. **可观察到的痛点是什么？**（描述行为，而非假定的需求）
> 3. 他们**为什么**无法用现有的东西解决它？
> 4. **为什么是现在？** —— 什么变化使这件事值得做？

等待用户。没有答案（或明确的"跳过"）就不要继续。

### 阶段 2 —— 事实依据（GROUND）

索要证据。这是最短也最承重的阶段：

> 你有什么证据表明这个问题真实存在且值得解决？（用户原话、支持工单、指标、观察到的行为、失败的变通方案 —— 任何具体的东西）

如果用户没有，把 PRD 的证据章节记为 `Assumption — needs validation via {user research | analytics | prototype}`。这让 PRD 保持诚实。

### 阶段 3 —— 决策（DECIDE）

用一组问题确定范围与假设：

> 1. **假设** —— 补全：*我们相信 **{能力}** 将为 **{用户}** **{解决问题}**。当 **{可衡量的结果}** 出现时，我们就知道自己做对了。*
> 2. **MVP** —— 测试该假设所需的最小范围？
> 3. **范围之外** —— 你明确**不**构建什么（即使用户要求）？
> 4. **开放问题** —— 可能改变方案的未确定性？

等待回复。

### 阶段 4 —— 生成并交接（GENERATE & HAND OFF）

如需要则创建目录，写 PRD，并报告。

```bash
mkdir -p .claude/prds
```

**输出路径**：`.claude/prds/{kebab-case-name}.prd.md`

#### PRD 模板

```markdown
# {Product / Feature Name}

## Problem
{2–3 sentences: who has what problem, and what's the cost of leaving it unsolved?}

## Evidence
- {User quote, data point, or observation}
- {OR: "Assumption — needs validation via {method}"}

## Users
- **Primary**: {role, context, what triggers the need}
- **Not for**: {who this explicitly excludes}

## Hypothesis
We believe **{capability}** will **{solve problem}** for **{users}**.
We'll know we're right when **{measurable outcome}**.

## Success Metrics
| Metric | Target | How measured |
|---|---|---|
| {primary} | {number} | {method} |

## Scope
**MVP** — {the minimum to test the hypothesis}

**Out of scope**
- {item} — {why deferred}

## Delivery Milestones
<!-- Business outcomes, not engineering tasks. /plan turns each into a plan. -->
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | {name} | {user-visible change} | pending | — |
| 2 | {name} | {user-visible change} | pending | — |

## Open Questions
- [ ] {question that could change scope or approach}

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|

---
*Status: DRAFT — requirements only. Implementation planning pending via /plan.*
```

#### 向用户报告

```
PRD created: .claude/prds/{name}.prd.md

Problem:    {one line}
Hypothesis: {one line}
MVP:        {one line}

Validation status:
  Problem  {validated | assumption}
  Users    {concrete | generic — refine}
  Metrics  {defined | TBD}

Open questions: {count}

Next step: /plan .claude/prds/{name}.prd.md
  → /plan will pick the next pending milestone and produce an implementation plan.
```

## 集成

- `/plan <prd-path>` —— 消费该 PRD 并为下一个待办里程碑产出实现计划。
- `tdd-workflow` 技能 —— 以测试先行方式实现计划。
- `/pr` —— 打开引用该 PRD 和计划的 PR。

## 成功标准

- **PROBLEM_CLEAR**：问题是具体的且有证据支撑（或被标记为假设）。
- **USER_CONCRETE**：主要用户是一个具体角色，而非"用户"。
- **HYPOTHESIS_TESTABLE**：包含可衡量的结果。
- **SCOPE_BOUNDED**：明确的 MVP 和明确的范围之外。
- **NO_IMPLEMENTATION_DETAIL**：不出现文件路径、库或任务分解 —— 如果出现了，把它们移到 `/plan` 步骤。
