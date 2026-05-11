---
allowed-tools: Bash(git checkout --branch:*), Bash(git add:*), Bash(git status:*), Bash(git push:*), Bash(git commit:*), Bash(gh pr create:*)
description: 提交、推送并打开拉取请求
---

## 前提条件

- 当前 git 状态：!`git status`
- 当前 git diff（暂存和未暂存更改）：！`git diff HEAD`
- 当前分支：！`git branch --show-current`

## 任务

基于above的更改：
1. 如果在 main 分支上，创建一个新的分支
2. 创建一个提交，包含appropriate的提交信息
3. 将分支推送到 origin
4. 使用 `gh pr create` 创建拉取请求
5. 你有能力在单个响应中调用多个工具。你必须在单个消息中完成所有这些操作。不要使用任何其他工具或做任何其他事情。不要发送任何其他文本或消息。
