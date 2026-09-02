---
name: loop-openhands
description: "OpenHands 策略循环引擎 — 代码修改 + 测试 + 提交闭环"
argument-hint: "<task> [--repo PATH] [--max-iterations N] [--test-cmd CMD]"
model: sonnet
color: orange
---

# Loop OpenHands — 代码修改与提交闭环

> **Guard**: 如果 `$ARGUMENTS` 为空或仅包含选项而没有 `<task>`，立即输出以下内容并停止：
> ```
> 用法: /loop-openhands <task> [--repo PATH] [--max-iterations N] [--test-cmd CMD]
>
> <task> 是必填参数。示例:
>   /loop-openhands "修复登录页面的 CSS 响应式问题"
>   /loop-openhands "添加用户注册 API 端点" --max-iterations 5
> ```
> 输出后立即停止，不要进入 Phase 1。

OpenHands 循环引擎模拟 OpenHands（原 OpenDevin）的自主软件工程模式。在指定代码库中理解任务、修改代码、运行测试、提交变更，形成完整闭环。

## Core Concept

```
Task → Understand → Modify → Test → Commit → (loop if needed)
```

## Usage

`/loop-openhands <task> [options]`

### Arguments

- `<task>` — 要完成的任务描述（必填）
  - 示例: "修复登录页面的 CSS 响应式问题"
  - 示例: "添加用户注册 API 端点"
  - 示例: "升级 dependencies 到最新版本"

### Options

- `--repo PATH` — 目标仓库路径（默认当前目录）
- `--max-iterations N` — 最大迭代次数（默认 10）
- `--test-cmd CMD` — 测试命令（默认自动检测）
- `--commit-prefix PREFIX` — commit 消息前缀（默认 "feat"）
- `--no-commit` — 只修改代码，不提交

## Workflow

### Phase 1: Task Understanding

理解任务需求：

```
1. 解析任务描述
2. 在代码库中搜索相关代码
3. 理解现有实现
4. 确定需要修改的范围
5. 制定实现计划
```

搜索策略：
- 关键词搜索（Grep/Glob）
- 读取相关文件
- 理解代码结构和依赖关系

### Phase 2: Code Modification

修改代码：

```
1. 根据计划修改代码
2. 遵循项目代码风格
3. 保持最小化改动
4. 确保修改的正确性
```

修改原则：
- 只修改必要的文件
- 保持代码风格一致
- 不引入不必要的依赖
- 添加必要的注释

### Phase 3: Testing

运行测试验证：

```
1. 确定测试命令
   - 检测 package.json scripts.test
   - 检测 Makefile test target
   - 检测 pytest 配置
2. 运行测试
3. 分析测试结果
4. 如果测试失败：
   - 分析失败原因
   - 修复问题（回到 Phase 2）
```

测试检测优先级：
```
1. package.json "test" script
2. Makefile "test" target
3. pytest configuration (pytest.ini, pyproject.toml)
4. bun test / npm test / cargo test / go test
```

### Phase 4: Commit

提交变更：

```
1. git status — 查看变更
2. git diff — 审查变更
3. git add — 暂存文件
4. git commit — 提交（使用任务描述作为消息）
5. （可选）git push
```

Commit 消息格式：
```
{prefix}: {任务描述}

- 修改的文件 1
- 修改的文件 2

Co-Authored-By: kaixings <30445355@qq.com>
```

前缀映射：
- `--commit-prefix feat` → `feat:`
- `--commit-prefix fix` → `fix:`
- `--commit-prefix chore` → `chore:`
- 默认 → `feat:`

### Phase 5: Iteration Check

检查是否需要继续迭代：

```
如果任务完全完成：
  → 退出循环
否则（有更多工作要做）：
  → 继续下一轮迭代
```

停止条件：
- ✅ 任务完全完成且测试通过
- ✅ 达到 `--max-iterations` 上限
- ✅ 测试连续失败 3 次（卡住）
- ✅ 用户中断

## Iteration Logic

```
iteration = 0
max_iterations = 10
completed = false

while (iteration < max_iterations && !completed):
  iteration++

  # Phase 1: 理解任务
  search_relevant_code(task)
  understand_current_implementation()

  # Phase 2: 修改代码
  modify_code(plan)

  # Phase 3: 测试
  test_result = run_tests()
  if not test_result.passed:
    analyze_failure(test_result)
    continue  # 修复后重试

  # Phase 4: 提交
  if not --no-commit:
    commit_changes(task)

  # Phase 5: 检查完成
  if is_task_complete(task):
    completed = true
```

## Examples

```bash
# 基础用法：在仓库中修复问题
/loop-openhands "修复登录页面的 CSS 响应式问题"

# 指定仓库路径
/loop-openhands "添加用户注册 API" --repo ./backend

# 限制迭代次数
/loop-openhands "升级 dependencies" --max-iterations 5

# 自定义测试命令
/loop-openhands "重构 utils" --test-cmd "bun run test:unit"

# 只修改不提交
/loop-openhands "实验性重构" --no-commit

# 使用 fix 前缀
/loop-openhands "修复内存泄漏" --commit-prefix fix
```

## Differences from /loop

| Feature | /loop | /loop-openhands |
|---------|-------|-----------------|
| Code modification | ❌ | ✅ 直接修改代码 |
| Testing | ❌ | ✅ 自动运行测试 |
| Commit | ❌ | ✅ 自动提交 |
| Repo awareness | ❌ | ✅ 理解代码库结构 |
| Iteration on failure | ❌ | ✅ 测试失败后自动重试 |

## Integration with Loop V2

OpenHands 循环会记录到 Loop V2 监控系统：
- 每次迭代作为 checkpoint
- 测试结果作为验证标记
- Commit hash 记录在状态中
- 失败迭代进入死信队列

## Tools Used

- **Grep/Glob** — 代码搜索
- **Read** — 读取代码和上下文
- **Edit/Write** — 修改代码
- **Bash** — 运行测试和 git 命令

## Best Practices

1. **理解先于修改**：确保理解代码再动手
2. **最小化改动**：只改必要的行
3. **测试驱动**：每次修改后运行测试
4. **频繁提交**：每个成功的修改都提交
5. **保持原子性**：每个 commit 是一个完整的功能/修复

## Limitations

- 不处理大型架构变更（需要人工规划）
- 不处理需要多方协调的任务
- 测试必须可自动化运行
- 需要 git 仓库
