---
name: ab-test-setup
description: "设置 A/B 测试的结构化指南，包含假设、指标和执行就绪性的强制检查门。"
risk: unknown
source: community
date_added: "2026-02-27"
---

# A/B 测试设置

## 1️⃣ 目的与范围

确保在编写任何代码之前，每个 A/B 测试都是**有效、严谨且安全**的。

- 防止”偷看”结果
- 确保统计功效
- 阻止无效假设

---

## 2️⃣ 前提条件

您必须拥有：

- 明确的用户问题
- 访问分析数据源
- 大致估计的流量规模

### 假设质量检查清单

有效的假设包括：

- 观察或证据
- 单一、具体的变更
- 方向性预期
- 定义明确的受众
- 可衡量的成功标准

---

## 3️⃣ 假设锁定（硬性门槛）

在设计变体或指标之前，您必须：

- 呈现**最终假设**
- 指定：
  - 目标受众
  - 主要指标
  - 预期效果方向
  - 最小可检测效应 (MDE)

明确询问：

> “这是本次测试我们要承诺的最终假设吗？”

**在确认之前不要继续。**

---

## 4️⃣ 假设与有效性检查（强制）

明确列出以下假设：

- 流量稳定性
- 用户独立性
- 指标可靠性
- 随机化质量
- 外部因素（季节性、营销活动、发布）

如果假设薄弱或被违反：

- 警告用户
- 建议推迟或重新设计测试

---

## 5️⃣ 测试类型选择

选择最简单的有效测试：

- **A/B 测试** – 单一变更，两个变体
- **A/B/n 测试** – 多个变体，需要更高流量
- **多变量测试 (MVT)** – 交互效应，需要非常高流量
- **拆分 URL 测试** – 主要结构变更

除非有明确理由，否则默认使用 **A/B 测试**。

---

## 6️⃣ 指标定义

#### 主要指标（强制）

- 用于评估成功的单一指标
- 直接与假设相关联
- 在启动前预先定义并固定

#### 次要指标

- 提供上下文信息
- 解释结果发生的_原因_
- 不得覆盖主要指标

#### 护栏指标

- 不得退化的指标
- 用于防止有害的”胜利”
- 如果显著为负，则触发测试停止

---

## 7️⃣ 样本量与持续时间

预先定义：

- 基准率
- MDE
- 显著性水平（通常为 95%）
- 统计功效（通常为 80%）

估计：

- 每个变体所需的样本量
- 预期的测试持续时间

**没有现实的样本量估计，不要继续。**

---

### 跟踪验证（第 8 道门槛前必需）

在进入下面的执行就绪门槛之前，运行此检查清单，使"跟踪已验证"具有具体含义：

1. **事件触发：** 在暂存环境或调试页面上触发主要和次要指标依赖的每个事件（注册、加入购物车、自定义事件），并在 30 秒内确认它到达您的分析目的地。
2. **变体归因：** 验证变体分配 ID 是否附加到每个触发的事件——不仅仅是入口事件。使用您分析的原始事件视图比较每个变体的 5+ 个事件样本。
3. **去重：** 确认用户重新加载页面不会导致重复计数的事件。如果您的技术栈使用客户端去重，变体 ID 必须是去重键的一部分。
4. **样本随机化：** 从分配表中提取前 100 条分配记录；变体分配应在配置分配的 ±5% 范围内。
5. **护栏指标流水线：** 在 §6️⃣ 中定义的每个护栏指标必须在测试启动时拥有正常工作的仪表板或警报。

如果以上任何一项失败，请在进入第 8 道门槛之前停止并解决。

---

## 8️⃣ 执行就绪门槛（硬性停止）

**仅当所有条件都为真时**，您才可以继续实施：

- 假设已锁定
- 主要指标已固定
- 样本量已计算
- 测试持续时间已定义
- 护栏已设置
- 跟踪已验证

如果缺少任何项目，请停止并解决。

---

## Running the Test

### During the Test

**DO:**

- Monitor technical health
- Document external factors

**DO NOT:**

- Stop early due to “good-looking” results
- Change variants mid-test
- Add new traffic sources
- Redefine success criteria

---

## Analyzing Results

### Analysis Discipline

When interpreting results:

- Do NOT generalize beyond the tested population
- Do NOT claim causality beyond the tested change
- Do NOT override guardrail failures
- Separate statistical significance from business judgment

### Interpretation Outcomes

| Result               | Action                                 |
| -------------------- | -------------------------------------- |
| Significant positive | Consider rollout                       |
| Significant negative | Reject variant, document learning      |
| Inconclusive         | Consider more traffic or bolder change |
| Guardrail failure    | Do not ship, even if primary wins      |

---

## Documentation & Learning

### Test Record (Mandatory)

Document:

- Hypothesis
- Variants
- Metrics
- Sample size vs achieved
- Results
- Decision
- Learnings
- Follow-up ideas

Store records in a shared, searchable location to avoid repeated failures.

---

## Refusal Conditions (Safety)

Refuse to proceed if:

- Baseline rate is unknown and cannot be estimated
- Traffic is insufficient to detect the MDE
- Primary metric is undefined
- Multiple variables are changed without proper design
- Hypothesis cannot be clearly stated

Explain why and recommend next steps.

---

## Key Principles (Non-Negotiable)

- One hypothesis per test
- One primary metric
- Commit before launch
- No peeking
- Learning over winning
- Statistical rigor first

---

## Final Reminder

A/B testing is not about proving ideas right.
It is about **learning the truth with confidence**.

If you feel tempted to rush, simplify, or “just try it” —
that is the signal to **slow down and re-check the design**.

## When to Use
This skill is applicable to execute the workflow or actions described in the overview.

## Limitations
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.
