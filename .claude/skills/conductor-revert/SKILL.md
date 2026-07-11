---
name: 按逻辑工作单元（轨道、阶段或任务）进行 Git 感知的撤销
description: "按逻辑工作单元（轨道、阶段或任务）进行 Git 感知的撤销"
risk: critical
source: community
date_added: "2026-02-27"
---

# 撤销轨道

通过逻辑工作单元撤销更改，具有完整的 git 感知。支持撤销整个轨道、特定阶段或单个任务。

## 使用此技能的场景

- 处理撤销轨道任务或工作流时
- 需要撤销轨道的指导、最佳实践或检查清单时

## 不要使用此技能的场景

- 任务与撤销轨道无关时
- 需要此范围之外的领域或工具时

## 说明

- 明确目标、约束和所需输入。
- 应用相关最佳实践并验证结果。
- 提供可操作的步骤和验证方法。
- 如需详细示例，请打开 `resources/implementation-playbook.md`。

## 预检检查

1. 验证 Conductor 是否已初始化：
   - 检查 `conductor/tracks.md` 是否存在
   - 如果缺失：显示错误并建议先运行 `/conductor:设置`

2. 验证 git 仓库：
   - 运行 `git status` 确认是 git 仓库
   - 检查未提交的更改
   - 如果存在未提交的更改：

     ```
     警告：检测到未提交的更改

     有更改的文件：
     {文件列表}

     选项：
     1. 暂存更改并继续
     2. 先提交更改
     3. 取消回滚
     ```

3. 验证 git 状态足够干净以进行回滚：
   - 没有进行中的合并
   - 没有进行中的变基
   - 如果发现问题：停止并说明解决步骤

## 目标选择

### 如果提供了参数：

解析参数格式：

**完整轨道：** `{trackId}`

- 示例：`auth_20250115`
- 回滚整个轨道的所有提交

**特定阶段：** `{trackId}:phase{N}`

- 示例：`auth_20250115:phase2`
- 回滚阶段 N 及之后所有阶段的提交

**特定任务：** `{trackId}:task{X.Y}`

- 示例：`auth_20250115:task2.3`
- 仅回滚任务 X.Y 的提交

### 如果无参数：

显示引导式选择菜单：

```
您想要回滚什么？

当前进行中：
1. [~] dashboard_20250112 中的任务 2.3（最近）

最近完成：
2. [x] dashboard_20250112 中的任务 2.2（1 小时前）
3. [x] dashboard_20250112 中的阶段 1（3 小时前）
4. [x] 完整轨道：auth_20250115（昨天）

选项：
5. 输入特定引用（track:phase 或 track:task）
6. 取消

选择选项：
```

## 提交发现

### 任务回滚

1. 搜索 git 日志查找任务特定提交：

   ```bash
   git log --oneline --grep="{trackId}" --grep="Task {X.Y}" --all-match
   ```

2. 同时查找 plan.md 更新提交：

   ```bash
   git log --oneline --grep="mark task {X.Y} complete" --grep="{trackId}" --all-match
   ```

3. 收集所有匹配的提交 SHA

### 阶段回滚

1. 通过读取 plan.md 确定阶段的任范围
2. 搜索该阶段的所有任务提交
3. 查找阶段验证提交（如果存在）
4. 查找阶段任务的所有 plan.md 更新提交
5. 按时间顺序收集所有匹配的提交 SHA

### 完整轨道回滚

1. 查找提及该轨道的所有提交
2. 查找轨道创建提交
3. 按时间顺序收集所有匹配的提交 SHA

## Execution Plan Display

Before any revert operations, display full plan:

```
================================================================================
                           REVERT EXECUTION PLAN
================================================================================

Target: {description of what's being reverted}

Commits to revert (in reverse chronological order):
  1. abc1234 - feat: add chart rendering (dashboard_20250112)
  2. def5678 - chore: mark task 2.3 complete (dashboard_20250112)
  3. ghi9012 - feat: add data hooks (dashboard_20250112)
  4. jkl3456 - chore: mark task 2.2 complete (dashboard_20250112)

Files that will be affected:
  - src/components/Dashboard.tsx (modified)
  - src/hooks/useData.ts (will be deleted - was created in these commits)
  - conductor/tracks/dashboard_20250112/plan.md (modified)

Plan updates:
  - Task 2.2: [x] -> [ ]
  - Task 2.3: [~] -> [ ]

================================================================================
                              !! WARNING !!
================================================================================

This 操作 will:
- Create {N} revert commits
- Modify {M} files
- Reset {P} tasks to pending status

This CANNOT be easily undone without manual intervention.

================================================================================

Type 'YES' to proceed, or anything else to cancel:
```

**CRITICAL: Require explicit 'YES' confirmation. Do not proceed on 'y', 'yes', or enter.**

## Revert Execution

Execute reverts in reverse chronological order (newest first):

```
Executing revert plan...

[1/4] Reverting abc1234...
      git revert --no-edit abc1234
      ✓ Success

[2/4] Reverting def5678...
      git revert --no-edit def5678
      ✓ Success

[3/4] Reverting ghi9012...
      git revert --no-edit ghi9012
      ✓ Success

[4/4] Reverting jkl3456...
      git revert --no-edit jkl3456
      ✓ Success
```

### On Merge Conflict

If any revert produces a merge conflict:

```
================================================================================
                           MERGE CONFLICT DETECTED
================================================================================

Conflict occurred while reverting: {sha} - {message}

Conflicted files:
  - src/components/Dashboard.tsx

Options:
1. Show conflict details
2. Abort revert sequence (keeps completed reverts)
3. Open manual resolution guide

IMPORTANT: Reverts 1-{N} have been completed. You may need to manually
resolve this conflict before continuing or fully undo the revert sequence.

Select option:
```

**HALT immediately on any conflict. Do not attempt automatic resolution.**

## Plan.md Updates

After successful git reverts, update plan.md:

1. Read current plan.md
2. For each reverted task, change marker:
   - `[x]` -> `[ ]`
   - `[~]` -> `[ ]`
3. Write updated plan.md
4. Update metadata.json:
   - Decrement `tasks.completed`
   - Update `status` if needed
   - Update `updated` timestamp

**不要 commit plan.md changes** - they are part of the revert 操作

## Track 状态 Updates

### If reverting entire track:

- In tracks.md: Change `[x]` or `[~]` to `[ ]`
- 考虑 offering to delete the track directory entirely

### If reverting to incomplete state:

- In tracks.md: Ensure marked as `[~]` if partially complete, `[ ]` if fully reverted

## 验证

After revert completion:

```
================================================================================
                           REVERT COMPLETE
================================================================================

Summary:
  - Reverted {N} commits
  - Reset {P} tasks to pending
  - {M} files affected

Git log now shows:
  {recent commit history}

Plan.md status:
  - Task 2.2: [ ] Pending
  - Task 2.3: [ ] Pending

================================================================================

Verify the revert was successful:
  1. Run tests: {test command}
  2. Check application: {relevant check}

If issues are found, you may need to:
  - Fix conflicts manually
  - Re-implement the reverted tasks
  - Use 'git revert HEAD~{N}..HEAD' to undo the reverts

================================================================================
```

## 安全规则

1. **绝不使用 `git reset --hard`** - 只使用 `git revert`
2. **绝不使用 `git push --force`** - 只使用安全的推送操作
3. **绝不自动解决冲突** - 始终暂停等待人工干预
4. **始终显示完整计划** - 用户必须确切看到将要发生什么
5. **要求明确的 'YES'** - 不是 'y'，不是回车，只能是 'YES'
6. **任何错误都停止** - 不要尝试越过失败继续
7. **保留历史** - 优先使用 revert 提交而非重写历史

## 边界情况

### 轨道从未提交

```
未找到轨道关联的提交：{trackId}

轨道存在但没有关联的提交。这可能意味着：
- 实现从未开始
- 提交使用了不同格式

选项：
1. 仅删除轨道目录
2. 取消
```

### 提交已被回滚

```
某些提交似乎已被回滚：
  - abc1234 已被 xyz9876 回滚

选项：
1. 跳过已回滚的提交
2. 取消并调查
```

### 远程已推送

```
警告：某些提交已推送到远程

远程上的提交：
  - abc1234 (origin/main)
  - def5678 (origin/main)

回滚将创建新的 revert 提交，需要推送。
这是安全的方法（不需要强制推送）。

继续回滚？（YES/否）：
```

## 撤销回滚

如果用户需要撤销回滚本身：

```
要撤销此回滚操作：

  git revert HEAD~{N}..HEAD

这将创建恢复已回滚更改的新提交。

或者，如果尚未推送：
  git reset --soft HEAD~{N}
  git checkout -- .

（谨慎使用 - 这会丢弃回滚提交）
```

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
