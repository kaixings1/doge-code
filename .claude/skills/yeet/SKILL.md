---
name: Yeet PR 发布器
description: "通过确认范围、有意图地提交、推送分支并通过此插件的 GitHub 应用打开草稿 PR 来发布本地更改到 GitHub，仅在连接器覆盖不足时使用 `gh` 作为后备。"
---

# GitHub 发布更改

## 概述

仅当用户明确希望从本地检出执行完整发布流程时使用此技能：根据需要设置分支、预演、提交、推送和打开拉取请求。

此工作流是混合式的：

- 使用本地 `git` 进行分支创建、暂存、提交和推送。
- 在分支推送到远程后，优先使用此插件的 GitHub 应用创建拉取请求。
- 当连接器路径无法清晰推断仓库或头分支时，使用 `gh` 作为当前分支 PR 发现、身份验证检查或 PR 创建的后备。

## 前提条件

- 需要 GitHub CLI `gh`。检查 `gh --version`。如果缺失，请要求用户安装 `gh` 并停止。
- 需要已认证的 `gh` 会话。运行 `gh auth status`。如果未认证，请要求用户运行 `gh auth login`（并重新运行 `gh auth status`）后再继续。
- 需要一个本地 git 仓库，并清楚了解哪些更改属于 PR。

## 命名约定

- 分支：从 main/master/default 开始时使用 `codex/{description}`。
- 提交：`{description}`（简洁）。
- PR 标题：`[codex] {description}` 总结完整的差异。

## 工作流

1. 确认预期范围。
   - 运行 `git status -sb` 并在暂存前检查差异。
   - 如果工作树包含无关更改，不要默认使用 `git add -A`。询问用户哪些文件属于 PR。
2. 确定分支策略。
   - 如果在 `main`、`master` 或其他默认分支上，创建 `codex/{description}`。
   - 否则保留在当前分支上。
3. 仅暂存预期的更改。
   - 当工作树混有时优先使用显式文件路径。
   - 仅在用户确认整个工作树都属于范围内时使用 `git add -A`。
4. 使用确认的描述简洁提交。
5. 运行最相关的可用检查（如果尚未运行）。
   - 如果由于缺少依赖或工具导致检查失败，安装所需内容并重新运行一次。
6. 推送并跟踪：`git push -u origin $(git branch --show-current)`。
7. 打开草稿 PR。
   - 在推送成功后，优先使用此插件的 GitHub 应用创建 PR。
   - 从远程派生 `repository_full_name`，例如通过规范化 `git remote get-url origin` 或使用 `gh repo view --json nameWithOwner`。
   - 从 `git branch --show-current` 派生 `head_branch`。
   - 从用户请求中派生 `base_branch`（如果指定）；否则使用远程默认分支，例如通过 `gh repo view --json defaultBranchRef`。
   - 如果分支是从 fork 推送的，或 PR 目标与刚推送的远程不同，优先使用 `gh pr create` 后备，因为连接器 PR 创建流程期望一个仓库目标，可能无法清晰编码跨仓库头语义。
   - 如果基于连接器的 PR 创建无法清晰推断仓库或分支，回退到 `gh pr create --draft --fill --head $(git branch --show-current)`。
   - 使用 CLI 后备时将 PR 正文写入带有真实换行符的临时文件，以便 Markdown 正确渲染。
8. 总结结果，包括分支名称、提交、PR 目标、验证以及用户仍需确认的任何内容。

## 写入安全

- 绝不静默暂存无关的用户更改。
- 当工作树混有时，绝不在未确认范围的情况下推送。
- 默认使用草稿 PR，除非用户明确要求一个准备审查的 PR。
- 如果仓库似乎未连接到可访问的 GitHub 远程，请停止并在做假设之前解释阻塞原因。

## PR 正文预期

PR 描述应使用真实的 Markdown 散文并涵盖：

- 更改了什么
- 为什么更改
- 用户或开发者的影响
- 当 PR 是修复时的根本原因
- 用于验证的检查
