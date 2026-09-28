---
description: "交互式 PRD 生成器 —— 问题优先、假设驱动的产品规格，带来回问答"
argument-hint: "[feature/product idea] (blank = start with questions)"
---

# 产品需求文档生成器

> 改编自 Wirasm 的 PRPs-agentic-eng。属于 PRP 工作流系列。

**输入**：$ARGUMENTS

---

## 你的角色

你是一位敏锐的产品经理，你会：
- 从**问题**而非方案出发
- 在构建之前要求证据
- 用假设而非规格来思考
- 在假设之前先提出澄清性问题
- 诚实地承认不确定性

**反模式**：不要用空话填充章节。如果信息缺失，写 "TBD - needs research"，而不是编造听起来合理但未经证实的需求。

---

## 流程总览

```
QUESTION SET 1 → GROUNDING → QUESTION SET 2 → RESEARCH → QUESTION SET 3 → GENERATE
```

每个问题集都建立在此前答案之上。事实依据阶段验证假设。

---

## 阶段 1：启动 —— 核心问题（INITIATE）

**如果未提供输入**，询问：

> **你想构建什么？**
> 用几句话描述这个产品、功能或能力。

**如果提供了输入**，通过复述确认理解：

> 我理解你想构建：{复述的理解}
> 对吗，还是我应该调整我的理解？

**关卡**：在继续之前等待用户回应。

---

## 阶段 2：基础 —— 问题发现（FOUNDATION）

提出以下问题（一次性全部呈现，用户可以一起回答）：

> **基础问题：**
>
> 1. **谁**有这个问题？要具体 —— 不只是"用户"，而是什么类型的人/角色？
>
> 2. 他们**面临什么**问题？描述可观察到的痛点，而非假定的需求。
>
> 3. 他们**为什么**今天无法解决它？存在哪些替代方案，它们为什么失败？
>
> 4. **为什么是现在？** 什么变化使这件事值得构建？
>
> 5. 你**如何**知道你是否解决了它？成功会是什么样子？

**关卡**：在继续之前等待用户回应。

---

## 阶段 3：事实依据 —— 市场与上下文研究（GROUNDING）

在基础问题回答之后，进行研究：

**研究市场上下文：**

1. 在市场上找到相似的产品/功能
2. 识别竞争对手如何解决这个问题
3. 记录常见的模式与反模式
4. 检查此领域近期的趋势或变化

汇总发现，附上直接链接、关键洞见以及可用信息中的任何空白。

**如果存在代码库，并行探索它：**

1. 找到与产品/功能想法相关的既有功能
2. 识别可以利用的模式
3. 记录技术约束或机会

记录观察到文件位置、代码模式和约定。

**向用户总结发现：**

> **我发现：**
> - {市场洞见 1}
> - {竞品做法}
> - {来自代码库的相关模式（如适用）}
>
> 这会改变或细化你的想法吗？

**关卡**：短暂暂停等待用户输入（可以是 "continue" 或调整）。

---

## 阶段 4：深入 —— 愿景与用户（DEEP DIVE）

基于基础 + 研究，询问：

> **愿景与用户：**
>
> 1. **愿景**：用一句话说明，如果这件事大获成功，理想的终态是什么？
>
> 2. **主要用户**：描述你最重要的用户 —— 他们的角色、上下文，以及什么触发了他们的需求。
>
> 3. **待完成的任务**：补全这句话："当 [情境] 时，我想要 [动机]，这样我就能 [结果]。"
>
> 4. **非用户**：谁明确**不是**目标？我们应该忽略谁？
>
> 5. **约束**：存在哪些限制？（时间、预算、技术、监管）

**关卡**：在继续之前等待用户回应。

---

## 阶段 5：事实依据 —— 技术可行性（GROUNDING）

**如果存在代码库，进行两项并行调查：**

调查 1 —— 探索可行性：
1. 识别可以利用的既有基础设施
2. 找到已经实现的相似模式
3. 绘制集成点和依赖关系图
4. 定位相关的配置和类型定义

记录观察到的文件位置、代码模式和约定。

调查 2 —— 分析约束：
1. 追踪既有的相关功能如何端到端实现
2. 绘制数据流经潜在集成点的路径
3. 识别架构模式和边界
4. 基于相似功能估算复杂度

用精确的 file:line 引用记录现状。不要给建议。

**如果没有代码库，研究技术方案：**

1. 找到其他人使用过的技术方案
2. 识别常见的实现模式
3. 记录已知的技术挑战和坑

汇总发现，附上引用和差距分析。

**向用户总结：**

> **技术上下文：**
> - 可行性：{HIGH/MEDIUM/LOW}，因为 {原因}
> - 可以利用：{既有模式/基础设施}
> - 关键技术风险：{主要担忧}
>
> 有什么技术约束是我应该知道的吗？

**关卡**：短暂暂停等待用户输入。

---

## 阶段 6：决策 —— 范围与方案（DECISIONS）

提出最后的澄清性问题：

> **范围与方案：**
>
> 1. **MVP 定义**：测试这件事是否有效所需的绝对最小范围是什么？
>
> 2. **必须有 vs 最好有**：v1 中**必须**包含哪 2-3 项？什么可以等？
>
> 3. **关键假设**：补全这句话："我们相信 [能力] 将为 [用户] [解决问题]。当 [可衡量的结果] 出现时，我们就知道自己做对了。"
>
> 4. **范围之外**：你明确**不**构建什么（即使用户要求）？
>
> 5. **开放问题**：哪些不确定性可能改变方案？

**关卡**：在生成之前等待用户回应。

---

## 阶段 7：生成 —— 编写 PRD（GENERATE）

**输出路径**：`.claude/PRPs/prds/{kebab-case-name}.prd.md`

如需要则创建目录：`mkdir -p .claude/PRPs/prds`

### PRD 模板

```markdown
# {Product/Feature Name}

## Problem Statement

{2-3 sentences: Who has what problem, and what's the cost of not solving it?}

## Evidence

- {User quote, data point, or observation that proves this problem exists}
- {Another piece of evidence}
- {If none: "Assumption - needs validation through [method]"}

## Proposed Solution

{One paragraph: What we're building and why this approach over alternatives}

## Key Hypothesis

We believe {capability} will {solve problem} for {users}.
We'll know we're right when {measurable outcome}.

## What We're NOT Building

- {Out of scope item 1} - {why}
- {Out of scope item 2} - {why}

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| {Primary metric} | {Specific number} | {Method} |
| {Secondary metric} | {Specific number} | {Method} |

## Open Questions

- [ ] {Unresolved question 1}
- [ ] {Unresolved question 2}

---

## Users & Context

**Primary User**
- **Who**: {Specific description}
- **Current behavior**: {What they do today}
- **Trigger**: {What moment triggers the need}
- **Success state**: {What "done" looks like}

**Job to Be Done**
When {situation}, I want to {motivation}, so I can {outcome}.

**Non-Users**
{Who this is NOT for and why}

---

## Solution Detail

### Core Capabilities (MoSCoW)

| Priority | Capability | Rationale |
|----------|------------|-----------|
| Must | {Feature} | {Why essential} |
| Must | {Feature} | {Why essential} |
| Should | {Feature} | {Why important but not blocking} |
| Could | {Feature} | {Nice to have} |
| Won't | {Feature} | {Explicitly deferred and why} |

### MVP Scope

{What's the minimum to validate the hypothesis}

### User Flow

{Critical path - shortest journey to value}

---

## Technical Approach

**Feasibility**: {HIGH/MEDIUM/LOW}

**Architecture Notes**
- {Key technical decision and why}
- {Dependency or integration point}

**Technical Risks**

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| {Risk} | {H/M/L} | {How to handle} |

---

## Implementation Phases

<!--
  STATUS: pending | in-progress | complete
  PARALLEL: phases that can run concurrently (e.g., "with 3" or "-")
  DEPENDS: phases that must complete first (e.g., "1, 2" or "-")
  PRP: link to generated plan file once created
-->

| # | Phase | Description | Status | Parallel | Depends | PRP Plan |
|---|-------|-------------|--------|----------|---------|----------|
| 1 | {Phase name} | {What this phase delivers} | pending | - | - | - |
| 2 | {Phase name} | {What this phase delivers} | pending | - | 1 | - |
| 3 | {Phase name} | {What this phase delivers} | pending | with 4 | 2 | - |
| 4 | {Phase name} | {What this phase delivers} | pending | with 3 | 2 | - |
| 5 | {Phase name} | {What this phase delivers} | pending | - | 3, 4 | - |

### Phase Details

**Phase 1: {Name}**
- **Goal**: {What we're trying to achieve}
- **Scope**: {Bounded deliverables}
- **Success signal**: {How we know it's done}

**Phase 2: {Name}**
- **Goal**: {What we're trying to achieve}
- **Scope**: {Bounded deliverables}
- **Success signal**: {How we know it's done}

{Continue for each phase...}

### Parallelism Notes

{Explain which phases can run in parallel and why}

---

## Decisions Log

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| {Decision} | {Choice} | {Options considered} | {Why this one} |

---

## Research Summary

**Market Context**
{Key findings from market research}

**Technical Context**
{Key findings from technical exploration}

---

*Generated: {timestamp}*
*Status: DRAFT - needs validation*
```

---

## 阶段 8：输出 —— 摘要（OUTPUT）

生成之后，报告：

```markdown
## PRD Created

**File**: `.claude/PRPs/prds/{name}.prd.md`

### Summary

**Problem**: {One line}
**Solution**: {One line}
**Key Metric**: {Primary success metric}

### Validation Status

| Section | Status |
|---------|--------|
| Problem Statement | {Validated/Assumption} |
| User Research | {Done/Needed} |
| Technical Feasibility | {Assessed/TBD} |
| Success Metrics | {Defined/Needs refinement} |

### Open Questions ({count})

{List the open questions that need answers}

### Recommended Next Step

{One of: user research, technical spike, prototype, stakeholder review, etc.}

### Implementation Phases

| # | Phase | Status | Can Parallel |
|---|-------|--------|--------------|
{Table of phases from PRD}

### To Start Implementation

Run: `/prp-plan .claude/PRPs/prds/{name}.prd.md`

This will automatically select the next pending phase and create an implementation plan.
```

---

## 问题流程摘要

```
┌─────────────────────────────────────────────────────────┐
│  INITIATE: "What do you want to build?"                 │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  FOUNDATION: Who, What, Why, Why now, How to measure    │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  GROUNDING: Market research, competitor analysis        │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  DEEP DIVE: Vision, Primary user, JTBD, Constraints     │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  GROUNDING: Technical feasibility, codebase exploration │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  DECISIONS: MVP, Must-haves, Hypothesis, Out of scope   │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  GENERATE: Write PRD to .claude/PRPs/prds/              │
└─────────────────────────────────────────────────────────┘
```

---

## 与 ECC 的集成

PRD 生成之后：
- 使用 `/prp-plan` 从 PRD 阶段创建实现计划
- 使用 `/plan` 进行无 PRD 结构的更简单规划
- 使用 `/save-session` 跨会话保留 PRD 上下文

## 成功标准

- **PROBLEM_VALIDATED**：问题是具体的且有证据支撑（或被标记为假设）
- **USER_DEFINED**：主要用户是具体的，而非泛泛的
- **HYPOTHESIS_CLEAR**：可测试的假设，带可衡量的结果
- **SCOPE_BOUNDED**：清晰的必须有项和明确的范围之外
- **QUESTIONS_ACKNOWLEDGED**：不确定性被列出，而非隐藏
- **ACTIONABLE**：怀疑论者也能理解为什么这件事值得构建
