---
name: loop-autogpt
description: "AutoGPT 循环引擎 — 目标驱动 + 自主规划 + 工具调用链"
argument-hint: "<goal> [--max-steps N] [--budget-tokens N] [--continuous]"
model: sonnet
color: orange
---

# Loop AutoGPT — 自主目标驱动循环

> **Guard**: 如果 `$ARGUMENTS` 为空或仅包含选项而没有 `<goal>`，立即输出以下内容并停止：
> ```
> 用法: /loop-autogpt <goal> [--max-steps N] [--budget-tokens N] [--continuous]
>
> <goal> 是必填参数。示例:
>   /loop-autogpt "创建一个完整的 Todo List CLI 应用"
>   /loop-autogpt "分析项目依赖，找出可优化的包" --max-steps 10
> ```
> 输出后立即停止，不要进入 Phase 1。

AutoGPT 循环引擎模拟 AutoGPT 的自主目标驱动模式。AI 接收一个高层目标，自主分解为步骤，规划执行顺序，调用工具，验证结果，循环直到目标达成。

## Core Concept

```
Goal → Plan → Execute → Observe → Reflect → (loop back if needed)
```

## Usage

`/loop-autogpt <goal> [options]`

### Arguments

- `<goal>` — 高层目标描述（必填）
  - 示例: "创建一个完整的 Todo List CLI 应用"
  - 示例: "分析项目依赖，找出可优化的包"
  - 示例: "为项目设置完整的 CI/CD 流水线"

### Options

- `--max-steps N` — 最大执行步数（默认 15）
- `--budget-tokens N` — Token 预算（默认 150000）
- `--continuous` — 持续模式，达到 max-steps 后继续
- `--plan-only` — 只生成计划，不执行

## Workflow

### Phase 1: Goal Decomposition

将高层目标分解为可执行步骤：

```
Goal: "创建 Todo List CLI"

Step 1: 设计数据模型和存储格式
Step 2: 实现 CLI 入口和命令解析
Step 3: 实现 add/list/complete/delete 命令
Step 4: 添加数据持久化
Step 5: 添加测试
Step 6: 编写 README
```

### Phase 2: Planning

对步骤进行排序和依赖分析：
- 识别步骤之间的依赖关系
- 确定执行顺序
- 标记可以并行的步骤

### Phase 3: Execution Loop

```
for step in steps:
  1. 执行当前步骤
  2. 观察结果（运行测试 / 检查文件 / 编译验证）
  3. 反思：是否达成子目标？
     - 是 → 进入下一步
     - 否 → 调整计划，重新执行
  4. 检查停止条件：
     - 达到 max-steps → 停止
     - 预算耗尽 → 停止
     - 目标达成 → 停止
```

### Phase 4: Final Review

执行完成后：
1. 验证最终结果是否满足原始目标
2. 运行完整测试套件
3. 生成执行报告

## Stop Conditions

- ✅ 目标完全达成且验证通过
- ✅ 达到 `--max-steps` 上限
- ✅ Token 预算耗尽
- ✅ 连续 5 步无进展（检测到死循环）
- ✅ 用户中断

## Examples

```bash
# 基础用法：创建应用
/loop-autogpt "创建一个完整的 Todo List CLI 应用"

# 限制步数
/loop-autogpt "重构 src/utils/" --max-steps 10

# 只生成计划
/loop-autogpt "设置 CI/CD" --plan-only

# 持续模式
/loop-autogpt "持续优化性能" --continuous --budget-tokens 200000
```

## Differences from /loop

| Feature | /loop | /loop-autogpt |
|---------|-------|---------------|
| Goal decomposition | 手动 | 自动 |
| Planning | ❌ | ✅ 自主规划执行顺序 |
| Tool calling chain | 单步 | 多步链式调用 |
| Budget control | ❌ | ✅ token + step 双重限制 |
| Continuous mode | ❌ | ✅ 后台持续优化 |

## Integration with Loop V2

AutoGPT 循环会记录到 Loop V2 监控系统：
- 每步执行作为独立的 checkpoint
- 规划阶段和执行阶段分开统计
- 预算消耗实时追踪
