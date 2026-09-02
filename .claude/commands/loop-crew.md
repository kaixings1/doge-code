---
name: loop-crew
description: "Crew 循环引擎 — 多 Agent 角色分配与协作，模拟 CrewAI 模式"
argument-hint: "<task> [--roles role1,role2,...] [--max-iterations N]"
model: sonnet
color: orange
---

# Loop Crew — 多 Agent 协作循环

> **Guard**: 如果 `$ARGUMENTS` 为空或仅包含选项而没有 `<task>`，立即输出以下内容并停止，不要执行任何工作流：
> ```
> 用法: /loop-crew <task> [--roles role1,role2,...] [--max-iterations N]
>
> <task> 是必填参数。示例:
>   /loop-crew "分析 src/commands/ 的安全性并生成报告"
>   /loop-crew "重构 utils 目录" --roles coder,reviewer,tester
> ```
> 输出后立即停止，不要进入 Phase 1。

Crew 循环引擎模拟 CrewAI 的多角色协作模式。将任务分解为多个角色，每个角色由独立的 Agent 执行，最终汇总结果。

## Core Concept

```
Task → Role Assignment → Parallel Execution → Result Aggregation → Final Output
```

## Usage

`/loop-crew <task> [options]`

### Arguments

- `<task>` — 要执行的任务描述（必填）
  - 示例: "分析 src/commands/ 的安全性并生成报告"
  - 示例: "重构整个 utils 目录"
  - 示例: "为项目生成完整的 API 文档"

### Options

- `--roles role1,role2,...` — 指定角色（默认自动推断）
- `--max-iterations N` — 最大迭代次数（默认 5）
- `--verbose` — 显示每个角色的详细输出

## Roles

### Built-in Roles

| Role | Description | Tools | Model |
|------|-------------|-------|-------|
| `researcher` | 信息收集和分析 | Read, Grep, Glob, WebSearch | sonnet |
| `coder` | 代码实现和重构 | Read, Edit, Write, Bash | sonnet |
| `reviewer` | 代码审查和质量检查 | Read, Grep, Bash | opus |
| `tester` | 测试编写和验证 | Read, Write, Bash | sonnet |
| `architect` | 系统设计和技术决策 | Read, Grep, Glob | opus |
| `writer` | 文档编写和内容生成 | Read, Write | sonnet |

### Auto Role Inference

如果不指定 `--roles`，系统会根据任务内容自动推断需要的角色：
- 任务包含 "分析" / "研究" → 添加 `researcher`
- 任务包含 "实现" / "重构" / "修复" → 添加 `coder`
- 任务包含 "审查" / "检查" → 添加 `reviewer`
- 任务包含 "测试" / "验证" → 添加 `tester`
- 任务包含 "设计" / "架构" → 添加 `architect`
- 任务包含 "文档" / "说明" → 添加 `writer`

## Workflow

### Phase 1: Role Assignment

根据任务和角色列表，为每个角色生成具体的子任务：

```
Task: "分析 src/commands/ 的安全性"
Roles: researcher, reviewer

→ researcher: 收集 src/commands/ 下的所有文件，识别潜在的安全问题
→ reviewer: 审查代码中的安全漏洞（注入、XSS、敏感数据泄露等）
```

### Phase 2: Parallel Execution

所有角色并行执行（通过 Agent 工具）：

```typescript
// 为每个角色启动独立的 Agent
for (const role of roles) {
  Agent({
    description: `${role} 执行任务`,
    subagent_type: getSubagentType(role),
    prompt: generateRolePrompt(role, task, context)
  })
}

// 等待所有 Agent 完成
// 合并结果
```

### Phase 3: Result Aggregation

汇总所有角色的输出：
1. 合并所有发现和建议
2. 去重（相同问题只保留一次）
3. 按优先级排序
4. 生成最终报告

### Phase 4: Iteration（可选）

如果任务需要多轮迭代：
1. 将上一轮结果作为上下文
2. 角色们基于反馈继续工作
3. 直到达成共识或达到最大迭代次数

## Examples

```bash
# 基础用法：自动推断角色
/loop-crew "分析 src/commands/ 的安全性并生成报告"

# 指定角色
/loop-crew "重构 utils 目录" --roles coder,reviewer,tester

# 详细模式
/loop-crew "生成 API 文档" --roles researcher,writer --verbose

# 多轮迭代
/loop-crew "复杂重构任务" --max-iterations 3
```

## Differences from /loop

| Feature | /loop | /loop-crew |
|---------|-------|------------|
| Execution model | 单 Agent 循环 | 多 Agent 并行 |
| Role specialization | ❌ | ✅ 每个角色有专门工具集 |
| Result aggregation | ❌ | ✅ 自动合并多角色输出 |
| Convergence detection | ❌ | ✅ 多轮迭代直到共识 |
| Parallelism | ❌ | ✅ 角色并行执行 |

## Integration with Loop V2

Crew 循环会记录到 Loop V2 监控系统：
- 每个角色作为独立的 subtask 追踪
- 角色执行时间单独统计
- 最终聚合结果作为 loop 结果

### 实际实现连接
- 角色执行通过 `Agent()` 工具并行启动
- 状态记录到 `~/.doge/loops/checkpoints/`
- 监控面板：`/loop-dashboard`（`src/services/loop-dashboard/`）
