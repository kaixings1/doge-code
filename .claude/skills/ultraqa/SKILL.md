---
name: ultraqa
description: QA 循环工作流 — 测试、验证、修复、重复，直到达成目标。
argument-hint: "[--tests|--build|--lint|--typecheck|--custom <pattern>] [--interactive]"
level: 3
---

# UltraQA 技能

[ULTRAQA ACTIVATED - AUTONOMOUS QA CYCLING]

## 总览

你现在处于 **ULTRAQA** 模式 —— 一个自主的 QA 循环工作流，持续运行直到你的质量目标达成。

**循环**：qa-tester → architect 验证 → 修复 → 重复

## 与 `/goal`、Ralph、Team 和 Ultragoal 的关系

UltraQA **只**负责重复的质量门禁循环。请使用确定性的冲突策略 `refuse`、`adopt_existing` 和 `artifact_only`，而非不确定性的警告处理。在目标行为已知、且剩余问题只是测试/构建/lint/类型检查或另一个显式 QA 条件是否通过时使用它。如果 Claude Code 的 `/goal` 处于活动状态，UltraQA 可以为该目标产出可见的命令证据，但**不得**把 `/goal` 求值器描述为在独立运行命令或读取文件。如果 Ralph 或 Team 处于活动状态，UltraQA 是该权威之下的验证/修复子循环，而非与之竞争的会话循环。如果没有任何活动循环是安全的，则把 QA 预期和证据记录到仅工件的 Ultragoal 笔记中，而不是声称已自动执行。

## 目标解析

从参数解析目标。支持的格式：

| 调用方式                                        | 目标类型 | 检查内容 |
| ---------------------------------------------- | --------- | -------------------------------- |
| `/oh-my-claudecode:ultraqa --tests`            | tests     | 所有测试套件通过 |
| `/oh-my-claudecode:ultraqa --build`            | build     | 构建成功，退出码 0 |
| `/oh-my-claudecode:ultraqa --lint`             | lint      | 无 lint 错误 |
| `/oh-my-claudecode:ultraqa --typecheck`        | typecheck | 无 TypeScript 错误 |
| `/oh-my-claudecode:ultraqa --custom "pattern"` | custom    | 输出中的自定义成功模式 |

如果未提供结构化目标，则把该参数解释为自定义目标。

## 循环工作流

### 第 N 轮（最多 5 轮）

1. **运行 QA**：按目标类型执行验证
   - `--tests`：运行项目的测试命令
   - `--build`：运行项目的构建命令
   - `--lint`：运行项目的 lint 命令
   - `--typecheck`：运行项目的类型检查命令
   - `--custom`：运行合适的命令并检查模式
   - `--interactive`：使用 qa-tester 进行交互式 CLI/服务测试：
     ```
     Task(subagent_type="oh-my-claudecode:qa-tester", model="sonnet", prompt="测试：
     目标：[描述要验证什么]
     服务：[如何启动]
     测试用例：[要验证的具体场景]")
     ```

2. **检查结果**：目标通过了吗？
   - **是** → 带成功消息退出
   - **否** → 继续第 3 步

3. **ARCHITECT 诊断**：启动 architect 分析失败原因

   ```
   Task(subagent_type="oh-my-claudecode:architect", model="opus", prompt="诊断失败：
   目标：[目标类型]
   输出：[测试/构建输出]
   给出根本原因和具体的修复建议。")
   ```

4. **修复问题**：应用 architect 的建议

   ```
   Task(subagent_type="oh-my-claudecode:executor", model="sonnet", prompt="修复：
   问题：[architect 诊断结果]
   文件：[受影响的文件]
   严格按建议应用修复。")
   ```

5. **重复**：回到第 1 步

## 退出条件

| 条件 | 动作 |
| --------------------- | ----------------------------------------------------------------------------- |
| **目标达成** | 带成功信息退出："ULTRAQA COMPLETE: 经过 N 轮后达成目标" |
| **达到第 5 轮** | 带诊断退出："ULTRAQA STOPPED: 已达最大轮次。诊断: ..." |
| **同一失败 3 次** | 提前退出："ULTRAQA STOPPED: 检测到同一失败 3 次。根本原因: ..." |
| **环境错误** | 退出："ULTRAQA ERROR: [tmux/端口/依赖问题]" |

## 可观测性

每轮输出进度：

```
[ULTRAQA Cycle 1/5] 正在运行测试...
[ULTRAQA Cycle 1/5] FAILED - 3 个测试失败
[ULTRAQA Cycle 1/5] Architect 诊断中...
[ULTRAQA Cycle 1/5] 修复: auth.test.ts - 缺少 mock
[ULTRAQA Cycle 2/5] 正在运行测试...
[ULTRAQA Cycle 2/5] PASSED - 全部 47 个测试通过
[ULTRAQA COMPLETE] 经过 2 轮后达成目标
```

## 状态跟踪

在 `.omc/ultraqa-state.json` 中跟踪状态：

```json
{
  "active": true,
  "goal_type": "tests",
  "goal_pattern": null,
  "cycle": 1,
  "max_cycles": 5,
  "failures": ["3 个测试失败: auth.test.ts"],
  "started_at": "2024-01-18T12:00:00Z",
  "session_id": "uuid"
}
```

## 取消

用户可用 `/oh-my-claudecode:cancel` 取消，它会清除状态文件。

## 重要规则

1. **尽可能并行** —— 在准备潜在修复的同时运行诊断
2. **跟踪失败** —— 记录每次失败以发现模式
3. **发现模式则提前退出** —— 同一失败 3 次 = 停止并上报
4. **输出清晰** —— 用户应始终知道当前轮次和状态
5. **清理** —— 完成或取消时清除状态文件

## 完成时的状态清理

**重要：完成时**删除**状态文件 —— 不要只是把 `active` 设为 `false`**

当目标达成、达到最大轮次、或提前退出时：

```bash
# 删除 ultraqa 状态文件
rm -f .omc/state/ultraqa-state.json
```

这确保未来会话有干净的状态。不应留下 `active: false` 的陈旧状态文件。

## 并行会话注意事项

- **多仓库工作区锚点：** 在父目录放置一个 `.omc-workspace` 标记，使跨子仓库的多个会话共享同一个 `.omc/`。解析顺序：`OMC_STATE_DIR > .omc-workspace > git > cwd`。见 `docs/REFERENCE.md`。
- **会话 id 来源：** CLI 场景下 OMC_SESSION_ID 环境变量优先；hook 场景下 hook 载荷的 data.session_id 优先。
- **计划 id（如适用）：** UltraQA 状态是会话级的。与 ralph 的互斥仅在同一会话内适用。
- **并行判定：** 支持（会话级状态）

---

现在开始 ULTRAQA 循环。解析目标并启动第 1 轮。
