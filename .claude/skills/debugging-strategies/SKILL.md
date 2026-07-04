---
name: debugging-strategies
description: "将调试从令人沮丧的猜测转变为系统化的问题解决，使用经过验证的策略、强大的工具和方法论方法。"
risk: safe
source: community
date_added: "2026-02-27"
---

# 调试策略

将调试从令人沮丧的猜测转变为系统化的问题解决，使用经过验证的策略、强大的工具和方法论方法。

## 使用此技能的场景

- 追踪难以捉摸的错误
- 调查性能问题
- 调试生产事故
- 分析崩溃转储或堆栈跟踪
- 调试分布式系统

## 不要使用此技能的场景

- 没有可复现的问题或可观察到的症状
- 任务纯粹是功能开发
- 无法访问日志、追踪或运行时信号

## 说明

- 复现问题并捕获日志、追踪和环境详情。
- 形成假设并设计受控实验。
- Narrow scope with binary search and targeted instrumentation.
- Document findings and verify the fix.
- If detailed playbooks are required, open `resources/implementation-playbook.md`.

## Resources

- `resources/implementation-playbook.md` for detailed debugging patterns and checklists.

## 局限性
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.
