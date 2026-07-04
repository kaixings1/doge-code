---
name: acceptance-orchestrator
description: 当编码任务需要从 issue 接收到实现、审查、部署和验收验证的全流程端到端自动化时使用，最小化人工干预。
risk: safe
source: community
date_added: "2026-03-12"
---

# 验收编排器

## 概述

将编码工作编排为一个状态机，只有在验收标准通过证据验证或任务被明确升级时才结束。

核心规则：**不要优化"代码已更改"；要优化"DoD 已证明"。**

## 何时使用
- 任务已有 issue 或明确的验收标准，应端到端运行，最小化人工重新干预。
- 需要在实现、审查、部署和最终验证之间进行结构化交接。
- 需要明确的停止条件和升级机制，而不是静默的部分完成。

## 必需子技能

- `create-issue-gate`
- `closed-loop-delivery`
- `verification-before-completion`

可选支持技能：
- `deploy-dev`
- `pr-watch`
- `pr-review-autopilot`
- `git-ship`

## 输入

必需输入：
- issue id 或 issue 内容
- issue 状态
- 验收标准（DoD）
- 目标环境（默认 `dev`）

固定默认值：
- 最大迭代轮数 = `2`
- PR 审查轮询 = `3m -> 6m -> 10m`

## 状态机

- `intake`（接收）
- `issue-gated`（issue 门控）
- `executing`（执行中）
- `review-loop`（审查循环）
- `deploy-verify`（部署验证）
- `accepted`（已验收）
- `escalated`（已升级）

## 工作流

1. **接收**
   - 读取 issue 并提取任务目标 + DoD。

2. **Issue 门控**
   - 使用 `create-issue-gate` 逻辑。
   - 如果 issue 不是 `ready` 或执行门未 `allowed`，立即停止。
   - issue 仍为 `draft` 时不要实施任何内容。

3. **执行**
   - 移交给 `closed-loop-delivery` 进行实施和本地验证。

4. **审查循环**
   - 如果 PR 反馈相关，分批轮询窗口：
     - 等待 `3m`
     - 然后 `6m`
     - 然后 `10m`
   - `10m` 轮次后，停止等待并一起处理所有可见评论。

5. **部署和运行时验证**
   - 如果 DoD 依赖运行时行为，默认仅部署到 `dev`。
   - 使用真实日志/API/Lambda 行为验证，不要假设。

6. **完成门控**
   - 在任何完成声明之前，要求 `verification-before-completion`。
   - 没有新证据不要声称成功。

## 停止条件

只有在每个验收标准都有匹配证据时才转移到 `accepted`。

在以下情况下转移到 `escalated`：
- DoD 在 `2` 轮完整循环后仍失败
- 缺少机密/权限/外部依赖阻碍进度
- 任务需要生产操作或破坏性操作审批
- 审查指令冲突且无法同时满足

## 人工门控

始终停止以获取人工确认：
- 超出约定范围的 prod/stage 部署
- 破坏性的 git/数据操作
- 计费或安全态势变更
- 缺少用户提供的验收标准

## 输出约定

报告状态时，始终包含：
- `Status`：intake / executing / accepted / escalated
- `Acceptance Criteria`：通过/失败检查清单
- `Evidence`：命令、日志、API 结果或运行时证明
- `Open Risks`：任何仍不确定的事项
- `Need Human Input`：最小的下一步决策（如果被阻塞）

除非状态是 `accepted`，否则不要报告"完成"。

## 局限性
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.
