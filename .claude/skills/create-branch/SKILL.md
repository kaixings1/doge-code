---
name: create-branch
description: "Create Branch — Create Branch 相关功能和最佳实践"
参数-hint: '[optional description of the work]'
risk: critical
source: community
---

# 创建分支

创建具有正确类型前缀和描述性名称的 git 分支，遵循 Sentry 约定。

## 何时使用
- You need to create a new git branch that follows the repository's naming convention.
- You are starting a new piece of work from the default branch and need help classifying it as `feat`, `fix`, `docs`, or another branch type.
- You want the branch name proposed from either the task description or the current local diff.

## 步骤 1：获取用户名前缀

Run `gh api user --jq .login` to get the GitHub username.

If the command fails (e.g. not authenticated), ask the user for their preferred prefix.

## 步骤 2：确定分支描述

**If `$ARGUMENTS` is provided**, use it as the description of the work.

**If no arguments**, check for local changes:

```bash
git diff
git diff --cached
git status --short
```

- **Changes exist**: read the diff content to understand what the work is about and generate a description.
- **No changes**: ask the user what they are about to work on.

## 步骤 3：分类类型

Pick the type from this table based on the description:

| Type      | Use when                                                              |
| --------- | --------------------------------------------------------------------- |
| `feat`    | New user-facing functionality                                         |
| `fix`     | Broken behavior now works                                             |
| `ref`     | Same behavior, different structure                                    |
| `chore`   | Deps, config, version bumps, updating existing tooling — no new logic |
| `perf`    | Same behavior, faster                                                 |
| `style`   | CSS, formatting, visual-only                                          |
| `docs`    | Documentation only                                                    |
| `test`    | Tests only                                                            |
| `ci`      | CI/CD config                                                          |
| `build`   | Build system                                                          |
| `meta`    | Repo metadata changes                                                 |
| `license` | 许可证 changes                                                       |

When unsure: `feat` for new things (including new scripts, skills, or tools), `ref` for restructuring existing things, `chore` only when updating/maintaining something that already exists.

## 步骤 4：生成并提议

Build the branch name as `<username>/<type>/<short-description>`.

Rules for `<short-description>`:

- Kebab-case, lowercase
- 3 to 6 words, concise but clear
- Describe the change, not file names
- Only use ASCII letters, digits, and hyphens — no spaces, dots, colons, tildes, or other git-forbidden characters

Present it to the user and ask if they want to use it, modify it, or change the type.

### Examples

| Work description                           | Branch name                                 |
| ------------------------------------------ | ------------------------------------------- |
| Dropdown menu not closing on outside click | `priscila/fix/dropdown-not-closing-on-blur` |
| Adding search to conversations page        | `priscila/feat/add-search-to-conversations` |
| Restructuring drawer components            | `priscila/ref/simplify-drawer-components`   |
| Updating test fixtures                     | `priscila/chore/update-test-fixtures`       |
| Bumping @sentry/react to latest version    | `priscila/chore/bump-sentry-react`          |
| Adding a new agent skill                   | `priscila/feat/add-create-branch-skill`     |

## 步骤 5：创建分支

Once confirmed, detect the current and default branch:

```bash
git branch --show-current
git remote | grep -qx origin && echo origin || git remote | head -1
git symbolic-ref refs/remotes/<remote>/HEAD 2>/dev/null | sed 's|refs/remotes/<remote>/||' | tr -d '[:space:]'
```

If `symbolic-ref` fails, fall back to `git branch --list main master`: use the one that exists; if both or neither exist, ask the user.

If `git branch --show-current` is empty (detached HEAD), show the current commit (`git rev-parse --short HEAD`) and ask whether to branch from it or switch to the default branch first.

Otherwise, if the current branch is not the default branch, warn the user and ask whether to branch from the current branch or switch to the default branch first.

If the user wants to switch to the default branch, handle any uncommitted changes appropriately (offer to stash them if present), then run `git checkout <default-branch>`. On any failure, restore stashed changes if applicable and stop.

Before creating the branch, check that the name doesn't already exist locally or on the remote (`git show-ref`). If it does, ask the user to choose a different name.

Create the branch:

```bash
git checkout -b <branch-name>
```

Restore any stashed changes after the branch is created.

## 参考

- [Sentry Branch Naming](https://develop.sentry.dev/sdk/getting-started/standards/code-submission/#branch-naming)

## 限制
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
