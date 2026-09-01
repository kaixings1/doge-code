---
description: "以规划感知的节奏运行 Claude Code 的循环。默认周期检查计划状态、运行 check-complete、在停滞时推动 progress.md 更新。"
disable-model-invocation: true
allowed-tools: "Read Bash"
model: sonnet
---

在 Claude Code 的 `/loop` 原语之上运行规划感知的节奏。

## Fallback Strategy

如果 `/loop` 不可用或返回空内容，使用内置循环逻辑直接执行规划检查。

步骤：

1. 解析参数：
   - 第一个匹配 `^\d+[smhd]$` 的参数是间隔时间（默认 `10m`）。
   - 剩余参数是可选的提示文本。
2. 按照 `/plan-attest` 的方式解析当前计划。
3. 组合循环提示：
   - 如果用户传入了提示文本：直接使用。
   - 否则：使用默认的计划检查提示：
     ```
     读取 task_plan.md 和 progress.md。运行 scripts/check-complete.sh 查看剩余阶段。
     如果自上次循环检查以来没有添加 progress.md 条目，写一个总结当前状态的条目。
     如果某个阶段完成，更新 task_plan.md 中的 Status：行。
     如果还有工作，继续下一个阶段。
     ```
4. 尝试调用 `/loop <间隔> <提示>`。
5. 如果 `/loop` 返回空或失败，使用内置循环：
   - 读取 task_plan.md 和 progress.md
   - 运行 check-complete 检查
   - 更新 progress.md
   - 等待间隔时间后重新检查
6. 向用户确认：打印间隔时间、当前计划 ID，并提醒单独的 `/loop` 调用（不带参数）运行 Claude Code 的内置维护提示 — `/plan-loop` 的区别在于始终以规划文件为基础。

如果 `task_plan.md` 不存在，拒绝并指示用户先运行 `/plan`。

## Built-in Loop Fallback

当 `/loop` 不可用时，直接执行以下循环：

```
while (plan not complete):
  1. Read task_plan.md — 解析阶段和状态
  2. Read progress.md — 了解最近进展
  3. Run check-complete — 识别未完成阶段
  4. If no progress since last check:
     - Write progress summary entry
  5. If a phase is complete:
     - Update task_plan.md Status line
  6. If work remains:
     - Continue to next phase
  7. Wait <interval> before next iteration
```

## Why Exists

`/loop` 按计划运行提示，没有任何计划状态契约。`/plan-loop` 注入了一个规划感知的默认提示，因此重复检查始终先重新读取规划文件，运行完成检查，并写入进度条目。用户无需编写自定义循环提示即可获得"保姆式计划"体验。

## Notes

- `/plan-loop` 与 `/loop` 组合使用；它不替代 `/loop`。`/loop 5m "anything"` 仍然有效。
- 对于"保姆式直到计划完成"语义：将 `/plan-loop 10m`（节奏）与 `/plan-goal`（终止条件）组合使用。循环每 10 分钟运行一次；当计划完成时，目标条件停止循环。
- 默认检查提示特意保持简短，以便保持在压缩安全长度内。
- 如果 `/loop` 持续返回空，系统会自动切换到内置循环模式，不影响计划追踪。
