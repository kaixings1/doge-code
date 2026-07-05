---
name: design-orchestration
description: "Design Orchestration — Design Orchestration 相关功能和最佳实践"
risk: unknown
source: community
date_added: '2026-02-27'
---

# 设计编排（元技能）

## 目的

确保**想法变为设计**、**设计被审查**，并且**只有经过验证的设计才能进入实现**。

此技能不会生成设计。
它**控制其他技能之间的流程**。

---

## Operating Model

This is a **routing and enforcement skill**, not a creative one.

It decides:
- which skill must run next
- whether escalation is required
- whether execution is permitted

---

## Controlled Skills

This meta-skill coordinates the following:

- `brainstorming` — design generation
- `multi-agent-brainstorming` — design validation
- downstream implementation or planning skills

---

## Entry Conditions

Invoke this skill when:
- a user proposes a new feature, system, or change
- a design decision carries meaningful risk
- correctness matters more than speed

---

## Routing Logic

### Step 1 — Brainstorming (Mandatory)

If no validated design exists:

- Invoke `brainstorming`
- Require:
  - Understanding Lock
  - Initial Design
  - Decision Log started

You may NOT proceed without these artifacts.

---

### Step 2 — Risk Assessment

After brainstorming completes, classify the design as:

- **Low risk**
- **Moderate risk**
- **High risk**

Use factors such as:
- user impact
- irreversibility
- operational cost
- complexity
- uncertainty
- novelty

---

### Step 3 — Conditional Escalation

- **Low risk**  
  → Proceed to implementation planning

- **Moderate risk**  
  → Recommend `multi-agent-brainstorming`

- **High risk**  
  → REQUIRE `multi-agent-brainstorming`

Skipping escalation when required is prohibited.

---

### Step 4 — Multi-Agent Review (If Invoked)

If `multi-agent-brainstorming` is run:

Require:
- completed Understanding Lock
- current Design
- Decision Log

不要 allow:
- new ideation
- scope expansion
- reopening problem definition

Only critique, revision, and decision resolution are allowed.

---

### Step 5 — Execution Readiness Check

Before allowing implementation:

Confirm:
- design is approved (single-agent or multi-agent)
- Decision Log is complete
- major assumptions are documented
- known risks are acknowledged

If any condition fails:
- block execution
- return to the appropriate skill

---

## Enforcement Rules

- 不要 allow implementation without a validated design
- 不要 allow skipping required review
- 不要 allow silent escalation or de-escalation
- 不要 merge design and implementation phases

---

## Exit Conditions

This meta-skill exits ONLY when:
- the next step is explicitly identified, AND
- all required prior steps are complete

Possible exits:
- “Proceed to implementation planning”
- “Run multi-agent-brainstorming”
- “Return to brainstorming for clarification”
- "If a reviewed design reports a final disposition of APPROVED, REVISE, or REJECT, you MUST route the workflow accordingly and state the chosen next step explicitly."
---

## Design Philosophy

This skill exists to:
- slow down the right decisions
- speed up the right execution
- prevent costly mistakes

Good systems fail early.
Bad systems fail in production.

This meta-skill exists to enforce the former.

## 使用场景
This skill is applicable to execute the workflow or actions described in the overview.

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
