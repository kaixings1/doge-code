---
name: 调试相关功能和最佳实践
description: "Debug — 调试相关功能和最佳实践"
---

# 调试

当用户想要帮助诊断当前的 OMC/Claude-Code 会话问题、工作流故障或令人困惑的运行时行为时使用此技能。

## 目标
快速找到真正的故障信号并解释下一步纠正步骤。

## 工作流
1. 仔细阅读用户的问题描述。
2. 首先检查最相关的本地证据：
   - 跟踪工具
   - 状态工具
   - 记事本/项目记忆（相关时）
   - 失败的测试或命令
3. 尽可能缩小范围复现问题。
4. Distinguish symptoms from root cause.
5. Recommend the smallest next fix or verification step.

## 规则
- 优先 real evidence over guesses.
- Use the trace/state surfaces when the issue involves orchestration, hooks, or agent flow.
- If the issue is actually a product/runtime bug rather than app code, say so plainly.
- Do not prescribe broad rewrites before isolating the failure.

## 输出
- Observed failure
- Root-cause hypothesis
- Evidence for that hypothesis
- Smallest next action

