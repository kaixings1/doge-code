---
description: 以严格的验证循环执行实现计划
argument-hint: <path/to/plan.md>
---

> 改编自 Wirasm 的 PRPs-agentic-eng。属于 PRP 工作流系列。

# PRP 实现

持续验证地逐步执行计划文件。每次变更都立即验证 —— 绝不累积损坏状态。

**核心理念**：验证循环能提早捕获错误。每次变更后运行检查。立即修复问题。

**黄金法则**：如果某项验证失败，先修复它再继续。绝不累积损坏状态。

---

## 阶段 0 —— 检测（DETECT）

### 包管理器检测

| 存在的文件 | 包管理器 | 运行器 |
|---|---|---|
| `bun.lockb` | bun | `bun run` |
| `pnpm-lock.yaml` | pnpm | `pnpm run` |
| `yarn.lock` | yarn | `yarn` |
| `package-lock.json` | npm | `npm run` |
| `pyproject.toml` 或 `requirements.txt` | uv / pip | `uv run` 或 `python -m` |
| `Cargo.toml` | cargo | `cargo` |
| `go.mod` | go | `go` |

### 验证脚本

检查 `package.json`（或等价文件）中可用的 scripts：

```bash
# For Node.js projects
cat package.json | grep -A 20 '"scripts"'
```

记录可用于以下用途的命令：type-check、lint、test、build。

---

## 阶段 1 —— 加载（LOAD）

读取计划文件：

```bash
cat "$ARGUMENTS"
```

从计划中提取这些章节：
- **Summary** —— 正在构建什么
- **Patterns to Mirror** —— 要遵循的代码约定
- **Files to Change** —— 要创建或修改什么
- **Step-by-Step Tasks** —— 实现序列
- **Validation Commands** —— 如何验证正确性
- **Acceptance Criteria** —— 完成的定义

如果文件不存在或不是有效的计划：
```
Error: Plan file not found or invalid.
Run /prp-plan <feature-description> to create a plan first.
```

**检查点**：计划已加载。所有章节已识别。任务已提取。

---

## 阶段 2 —— 准备（PREPARE）

### Git 状态

```bash
git branch --show-current
git status --porcelain
```

### 分支决策

| 当前状态 | 动作 |
|---|---|
| 在功能分支上 | 使用当前分支 |
| 在 main 上，工作区干净 | 创建功能分支：`git checkout -b feat/{plan-name}` |
| 在 main 上，工作区脏 | **停止** —— 先让用户 stash 或提交 |
| 在此功能的 git worktree 中 | 使用该 worktree |

### 同步远端

```bash
git pull --rebase origin $(git branch --show-current) 2>/dev/null || true
```

**检查点**：在正确的分支上。工作区就绪。远端已同步。

---

## 阶段 3 —— 执行（EXECUTE）

按顺序处理计划中的每个任务。

### 逐任务循环

对于 **Step-by-Step Tasks** 中的每个任务：

1. **阅读 MIRROR 参考** —— 打开任务 MIRROR 字段所引用的模式文件。在写代码之前理解该约定。

2. **实现** —— 严格遵循该模式写代码。应用 GOTCHA 警告。使用指定的 IMPORTS。

3. **立即验证** —— 在**每次**文件变更之后：
   ```bash
   # Run type-check (adjust command per project)
   [type-check command from Phase 0]
   ```
   如果 type-check 失败 → 在进入下一个文件之前修复错误。

4. **跟踪进度** —— 记录：`[done] Task N: [task name] — complete`

### 处理偏差

如果实现必须偏离计划：
- 记录**什么**被改变了
- 记录**为什么**被改变
- 用修正后的方案继续
- 这些偏差将被记录在报告中

**检查点**：所有任务已执行。偏差已记录。

---

## 阶段 4 —— 验证（VALIDATE）

运行计划中的所有验证级别。在继续之前修复每个级别的问题。

### 级别 1：静态分析

```bash
# Type checking — zero errors required
[project type-check command]

# Linting — fix automatically where possible
[project lint command]
[project lint-fix command]
```

如果自动修复后仍有 lint 错误，手动修复。

### 级别 2：单元测试

为每个新函数编写测试（如计划中的 Testing Strategy 所指定）。

```bash
[project test command for affected area]
```

- 每个函数至少需要一个测试
- 覆盖计划中列出的边界情况
- 如果测试失败 → 修复实现（而非测试，除非测试本身是错的）

### 级别 3：构建检查

```bash
[project build command]
```

构建必须以零错误成功。

### 级别 4：集成测试（如果适用）

```bash
# Start server, run tests, stop server
[project dev server command] &
SERVER_PID=$!

# Wait for server to be ready (adjust port as needed)
SERVER_READY=0
for i in $(seq 1 30); do
  if curl -sf http://localhost:PORT/health >/dev/null 2>&1; then
    SERVER_READY=1
    break
  fi
  sleep 1
done

if [ "$SERVER_READY" -ne 1 ]; then
  kill "$SERVER_PID" 2>/dev/null || true
  echo "ERROR: Server failed to start within 30s" >&2
  exit 1
fi

[integration test command]
TEST_EXIT=$?

kill "$SERVER_PID" 2>/dev/null || true
wait "$SERVER_PID" 2>/dev/null || true

exit "$TEST_EXIT"
```

### 级别 5：边界情况测试

走查计划 Testing Strategy 清单中的边界情况。

**检查点**：所有 5 个验证级别通过。零错误。

---

## 阶段 5 —— 报告（REPORT）

### 创建实现报告

```bash
mkdir -p .claude/PRPs/reports
```

Write report to `.claude/PRPs/reports/{plan-name}-report.md`:

```markdown
# Implementation Report: [Feature Name]

## Summary
[What was implemented]

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | [from plan] | [actual] |
| Confidence | [from plan] | [actual] |
| Files Changed | [from plan] | [actual count] |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | [task name] | [done] Complete | |
| 2 | [task name] | [done] Complete | Deviated — [reason] |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | [done] Pass | |
| Unit Tests | [done] Pass | N tests written |
| Build | [done] Pass | |
| Integration | [done] Pass | or N/A |
| Edge Cases | [done] Pass | |

## Files Changed

| File | Action | Lines |
|---|---|---|
| `path/to/file` | CREATED | +N |
| `path/to/file` | UPDATED | +N / -M |

## Deviations from Plan
[List any deviations with WHAT and WHY, or "None"]

## Issues Encountered
[List any problems and how they were resolved, or "None"]

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `path/to/test` | N tests | [area covered] |

## Next Steps
- [ ] Code review via `/code-review`
- [ ] Create PR via `/prp-pr`
```

### 更新 PRD（如适用）

如果此实现是针对某个 PRD 阶段的：
1. 把阶段状态从 `in-progress` 更新为 `complete`
2. 添加报告路径作为引用

### 归档计划

```bash
mkdir -p .claude/PRPs/plans/completed
mv "$ARGUMENTS" .claude/PRPs/plans/completed/
```

**检查点**：报告已创建。PRD 已更新。计划已归档。

---

## 阶段 6 —— 输出（OUTPUT）

向用户报告：

```
## Implementation Complete

- **Plan**: [plan file path] → archived to completed/
- **Branch**: [current branch name]
- **Status**: [done] All tasks complete

### Validation Summary

| Check | Status |
|---|---|
| Type Check | [done] |
| Lint | [done] |
| Tests | [done] (N written) |
| Build | [done] |
| Integration | [done] or N/A |

### Files Changed
- [N] files created, [M] files updated

### Deviations
[Summary or "None — implemented exactly as planned"]

### Artifacts
- Report: `.claude/PRPs/reports/{name}-report.md`
- Archived Plan: `.claude/PRPs/plans/completed/{name}.plan.md`

### PRD Progress (if applicable)
| Phase | Status |
|---|---|
| Phase 1 | [done] Complete |
| Phase 2 | [next] |
| ... | ... |

> Next step: Run `/prp-pr` to create a pull request, or `/code-review` to review changes first.
```

---

## 处理失败

### 类型检查失败
1. 仔细阅读错误消息
2. 在源文件中修复类型错误
3. 重新运行 type-check
4. 只有通过后才继续

### 测试失败
1. 判断 bug 在实现中还是在测试中
2. 修复根本原因（通常是实现）
3. 重新运行测试
4. 只有通过后才继续

### Lint 失败
1. 先运行自动修复
2. 如果仍有错误，手动修复
3. 重新运行 lint
4. 只有通过后才继续

### 构建失败
1. 通常是类型或导入问题 —— 检查错误消息
2. 修复有问题的文件
3. 重新运行构建
4. 只有成功后才继续

### 集成测试失败
1. 检查服务器是否正确启动
2. 验证端点/路由存在
3. 检查请求格式是否符合预期
4. 修复并重新运行

---

## 成功标准

- **TASKS_COMPLETE**：计划中的所有任务已执行
- **TYPES_PASS**：零类型错误
- **LINT_PASS**：零 lint 错误
- **TESTS_PASS**：所有测试通过，新测试已编写
- **BUILD_PASS**：构建成功
- **REPORT_CREATED**：实现报告已保存
- **PLAN_ARCHIVED**：计划已移至 `completed/`

---

## 下一步

- 运行 `/code-review` 在提交前审查变更
- 运行 `/prp-commit` 以描述性消息提交
- 运行 `/prp-pr` 创建拉取请求
- 如果 PRD 还有更多阶段，运行 `/prp-plan <next-phase>`
