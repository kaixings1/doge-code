---
description: 清理所有标记为 [gone] 的 Git 本地分支（远程已删除但本地仍存在），包括关联的 worktree
---

## 你的任务

你需要执行以下 bash 命令来清理已从远程仓库删除的过期本地分支。

## 要执行的命令

1. **首先，列出分支以识别标记为 [gone] 的分支**
   执行此命令：
   ```bash
   git branch -v
   ```
   
   注意：带有 '+' 前缀的分支有关联的 worktree，删除前必须先移除其 worktree。

2. **接下来，识别需要为 [gone] 分支移除的 worktree**
   执行此命令：
   ```bash
   git worktree list
   ```

3. **最后，移除 worktree 并删除 [gone] 分支（同时处理常规分支和 worktree 分支）**
   执行此命令：
   ```bash
   # 处理所有 [gone] 分支，去除 '+' 前缀（如果存在）
   git branch -v | grep '\[gone\]' | sed 's/^[+* ]//' | awk '{print $1}' | while read branch; do
     echo "正在处理分支：$branch"
     # 查找并移除 worktree（如果存在）
     worktree=$(git worktree list | grep "\\[$branch\\]" | awk '{print $1}')
     if [ ! -z "$worktree" ] && [ "$worktree" != "$(git rev-parse --show-toplevel)" ]; then
       echo "  正在移除 worktree：$worktree"
       git worktree remove --force "$worktree"
     fi
     # 删除分支
     echo "  正在删除分支：$branch"
     git branch -D "$branch"
   done
   ```

## 预期行为

执行这些命令后，你将：

- 看到所有本地分支及其状态的列表
- 识别并移除与 [gone] 分支关联的 worktree
- 删除所有标记为 [gone] 的分支
- 提供关于哪些 worktree 和分支被移除的反馈

如果没有分支标记为 [gone]，则报告无需清理。

