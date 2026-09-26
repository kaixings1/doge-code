---
name: project-session-manager
description: 以 worktree 优先的开发环境管理器，面向 issue、PR 和功能开发，可选配 tmux 会话。
aliases: [psm]
level: 2
---

# 项目会话管理器（PSM）技能

`psm` 是本规范技能入口的兼容性别名。

> **快速上手（worktree 优先）：** 当你想在加入任何 tmux/会话编排之前，先获得一个隔离的 issue/PR/功能 worktree 时，从 `omc teleport` 开始：
> ```bash
> omc teleport #123          # 为 issue/PR 创建 worktree
> omc teleport my-feature    # 为功能开发创建 worktree
> omc teleport list          # 列出 worktree
> ```
> 详情见下面的 [Teleport 命令](#teleport-command)。

使用 git worktree 和 tmux 会话配合 Claude Code 自动化隔离的开发环境。支持跨多个任务、项目和仓库的并行工作。

规范的斜杠命令：`/oh-my-claudecode:project-session-manager`（别名：`/oh-my-claudecode:psm`）。

## 命令

| 命令 | 描述 | 示例 |
|---------|-------------|---------|
| `review <ref>` | PR 审查会话 | `/psm review omc#123` |
| `fix <ref>` | Issue 修复会话 | `/psm fix omc#42` |
| `feature <proj> <name>` | 功能开发 | `/psm feature omc add-webhooks` |
| `list [project]` | 列出活动会话 | `/psm list` |
| `attach <session>` | 附着到会话 | `/psm attach omc:pr-123` |
| `kill <session>` | 终止会话 | `/psm kill omc:pr-123` |
| `cleanup` | 清理已合并/已关闭项 | `/psm cleanup` |
| `status` | 当前会话信息 | `/psm status` |

## 项目引用

支持的格式：
- **别名**：`omc#123`（需要 `~/.psm/projects.json`）
- **完整式**：`owner/repo#123`
- **URL**：`https://github.com/owner/repo/pull/123`
- **当前式**：`#123`（使用当前目录所在仓库）

## 配置

### 项目别名（`~/.psm/projects.json`）

```json
{
  "aliases": {
    "omc": {
      "repo": "Yeachan-Heo/oh-my-claudecode",
      "local": "~/Workspace/oh-my-claudecode",
      "default_base": "main"
    }
  },
  "defaults": {
    "worktree_root": "~/.psm/worktrees",
    "cleanup_after_days": 14
  }
}
```

## 提供方

PSM 支持多种 issue 跟踪提供方：

| 提供方 | 所需 CLI | 引用格式 | 可用命令 |
|----------|--------------|-------------------|----------|
| GitHub（默认） | `gh` | `owner/repo#123`、`alias#123`、GitHub URL | review、fix、feature |
| Jira | `jira` | `PROJ-123`（若已配置 PROJ）、`alias#123` | fix、feature |

### Jira 配置

要使用 Jira，添加一个带 `jira_project` 和 `provider: "jira"` 的别名：

```json
{
  "aliases": {
    "mywork": {
      "jira_project": "MYPROJ",
      "repo": "mycompany/my-project",
      "local": "~/Workspace/my-project",
      "default_base": "develop",
      "provider": "jira"
    }
  }
}
```

**重要：** 克隆 git 仓库仍需要 `repo` 字段。Jira 跟踪 issue，但你在 git 仓库中工作。

对非 GitHub 仓库，改用 `clone_url`：
```json
{
  "aliases": {
    "private": {
      "jira_project": "PRIV",
      "clone_url": "git@gitlab.internal:team/repo.git",
      "local": "~/Workspace/repo",
      "provider": "jira"
    }
  }
}
```

### Jira 引用识别

只有当 `PROJ` 在你的别名中被显式配置为 `jira_project` 时，PSM 才把 `PROJ-123` 格式识别为 Jira。这可避免 `FIX-123` 之类的分支名造成误判。

### Jira 示例

```bash
# 修复一个 Jira issue（必须先配置 MYPROJ）
psm fix MYPROJ-123

# 使用别名修复（推荐）
psm fix mywork#123

# 功能开发（与 GitHub 用法相同）
psm feature mywork add-webhooks

# 注意：Jira 不支持 'psm review'（没有 PR 概念）
# Jira issue 请使用 'psm fix'
```

### Jira CLI 安装

安装 Jira CLI：
```bash
# macOS
brew install ankitpokhrel/jira-cli/jira-cli

# Linux
# 参见：https://github.com/ankitpokhrel/jira-cli#installation

# 配置（交互式）
jira init
```

Jira CLI 的认证由它自己处理，与 PSM 相互独立。

## 目录结构

```
~/.psm/
├── projects.json       # 项目别名
├── sessions.json       # 活动会话注册表
└── worktrees/          # worktree 存储
    └── <project>/
        └── <type>-<id>/
```

## 会话命名

**公开会话 ID**（冒号形式，例如 `omc:pr-123`）是面向人类的标识符，存储在 `sessions.json` 中，并用于 `psm attach`/`psm kill`。tmux 为它的 `session:window.pane` 目标语法保留了 `:` 和 `.`，并会静默重写它们，因此**实际的 tmux 会话名**使用一种 tmux 安全形式，把这些字符换成 `_`（issue #3528）。PSM 在每个 tmux 边界处把公开 ID 转换为 tmux 安全名；可直接用 tmux 安全名附着。

| 类型 | 公开 ID（`psm attach`/`kill`） | tmux 会话（`tmux attach -t`） | worktree 目录 |
|------|---------------------------------|---------------------------------|--------------|
| PR 审查 | `omc:pr-123` | `psm_omc_pr-123` | `~/.psm/worktrees/omc/pr-123` |
| Issue 修复 | `omc:issue-42` | `psm_omc_issue-42` | `~/.psm/worktrees/omc/issue-42` |
| 功能开发 | `omc:feat-auth` | `psm_omc_feat-auth` | `~/.psm/worktrees/omc/feat-auth` |

---

## 实现协议

当用户调用 PSM 命令时，遵循此协议：

### 解析参数

解析 `{{ARGUMENTS}}` 以确定：
1. **子命令**：review、fix、feature、list、attach、kill、cleanup、status
2. **引用**：project#number、URL 或会话 ID
3. **选项**：--branch、--base、--no-claude、--no-tmux 等

### 子命令：`review <ref>`

**用途**：创建 PR 审查会话

**步骤**：

1. **解析引用**：
   ```bash
   # 读取项目别名
   cat ~/.psm/projects.json 2>/dev/null || echo '{"aliases":{}}'

   # 解析引用格式：alias#num、owner/repo#num 或 URL
   # 提取：project_alias、repo（owner/repo）、pr_number、local_path
   ```

2. **获取 PR 信息**：
   ```bash
   gh pr view <pr_number> --repo <repo> --json number,title,author,headRefName,baseRefName,body,files,url
   ```

3. **确保本地仓库存在**：
   ```bash
   # 若本地路径不存在则克隆
   if [[ ! -d "$local_path" ]]; then
     git clone "https://github.com/$repo.git" "$local_path"
   fi
   ```

4. **创建 worktree**：
   ```bash
   worktree_path="$HOME/.psm/worktrees/$project_alias/pr-$pr_number"

   # 拉取 PR 分支
   cd "$local_path"
   git fetch origin "pull/$pr_number/head:pr-$pr_number-review"

   # 创建 worktree
   git worktree add "$worktree_path" "pr-$pr_number-review"
   ```

5. **创建会话元数据**：
   ```bash
   cat > "$worktree_path/.psm-session.json" << EOF
   {
     "id": "$project_alias:pr-$pr_number",
     "type": "review",
     "project": "$project_alias",
     "ref": "pr-$pr_number",
     "branch": "<head_branch>",
     "base": "<base_branch>",
     "created_at": "$(date -Iseconds)",
     "tmux_session": "psm_${project_alias}_pr-$pr_number",
     "worktree_path": "$worktree_path",
     "source_repo": "$local_path",
     "github": {
       "pr_number": $pr_number,
       "pr_title": "<title>",
       "pr_author": "<author>",
       "pr_url": "<url>"
     },
     "state": "active"
   }
   EOF
   ```

6. **更新会话注册表**：
   ```bash
   # 添加到 ~/.psm/sessions.json
   ```

7. **创建 tmux 会话**（tmux 安全名；`:`/`.` 会被转换为 `_`）：
   ```bash
   tmux new-session -d -s "psm_${project_alias}_pr-$pr_number" -c "$worktree_path"
   ```

8. **启动 Claude Code**（除非使用 --no-claude）：
   ```bash
   # --dangerously-skip-permissions 可避免出现 “Do you trust this directory?” 提示，
   # 也可避免反复的工具审批提示卡住会话（issue #2508）。
   tmux send-keys -t "psm_${project_alias}_pr-$pr_number" "claude --dangerously-skip-permissions" Enter

   # claude 启动完成后（PSM_CLAUDE_STARTUP_DELAY，默认 5s）下发任务。
   # 使用 -l（字面量），以免特殊字符被 tmux 错误解释。
   sleep "${PSM_CLAUDE_STARTUP_DELAY:-5}"
   tmux send-keys -t "psm_${project_alias}_pr-$pr_number" -l \
     "审查 PR #$pr_number：\"$pr_title\"，作者 @$pr_author（$head_branch → $base_branch）。URL：$pr_url。" Enter
   ```

9. **输出会话信息**：
   ```
   会话已就绪！

     ID: omc:pr-123
     Worktree: ~/.psm/worktrees/omc/pr-123
     Tmux: psm_omc_pr-123

   附着方式：tmux attach -t psm_omc_pr-123   （或：psm attach omc:pr-123）
   ```

### 子命令：`fix <ref>`

**用途**：创建 issue 修复会话

**步骤**：

1. **解析引用**（与 review 相同）

2. **获取 issue 信息**：
   ```bash
   gh issue view <issue_number> --repo <repo> --json number,title,body,labels,url
   ```

3. **创建功能分支**：
   ```bash
   cd "$local_path"
   git fetch origin main
   branch_name="fix/$issue_number-$(echo "$title" | tr ' ' '-' | tr '[:upper:]' '[:lower:]' | head -c 30)"
   git checkout -b "$branch_name" origin/main
   ```

4. **创建 worktree**：
   ```bash
   worktree_path="$HOME/.psm/worktrees/$project_alias/issue-$issue_number"
   git worktree add "$worktree_path" "$branch_name"
   ```

5. **创建会话元数据**（与 review 类似，type="fix"）

6. **更新注册表、创建 tmux、启动 claude**：
   与 review 相同，但把 issue 上下文作为初始任务提示传入：
   ```bash
   tmux send-keys -t "psm_${project_alias}_issue-$issue_number" "claude --dangerously-skip-permissions" Enter
   # claude 启动完成后下发任务（见 PSM_CLAUDE_STARTUP_DELAY）：
   tmux send-keys -t "psm_${project_alias}_issue-$issue_number" -l \
     "修复 issue #$issue_number：\"$issue_title\"。URL：$issue_url。分支：$branch_name。" Enter
   ```

### 子命令：`feature <project> <name>`

**用途**：启动功能开发

**步骤**：

1. **解析项目**（来自别名或路径）

2. **创建功能分支**：
   ```bash
   cd "$local_path"
   git fetch origin main
   branch_name="feature/$feature_name"
   git checkout -b "$branch_name" origin/main
   ```

3. **创建 worktree**：
   ```bash
   worktree_path="$HOME/.psm/worktrees/$project_alias/feat-$feature_name"
   git worktree add "$worktree_path" "$branch_name"
   ```

4. **创建会话、tmux、启动 claude**，并把功能上下文作为初始提示：
   ```bash
   tmux send-keys -t "psm_${project_alias}_feat-$feature_name" "claude --dangerously-skip-permissions" Enter
   tmux send-keys -t "psm_${project_alias}_feat-$feature_name" -l \
     "为项目 $project 实现功能 \"$feature_name\"。分支：$branch_name。" Enter
   ```

### 子命令：`list [project]`

**用途**：列出活动会话

**步骤**：

1. **读取会话注册表**：
   ```bash
   cat ~/.psm/sessions.json 2>/dev/null || echo '{"sessions":{}}'
   ```

2. **检查 tmux 会话**：
   ```bash
   tmux list-sessions -F "#{session_name}" 2>/dev/null | grep "^psm_"
   ```

3. **检查 worktree**：
   ```bash
   ls -la ~/.psm/worktrees/*/ 2>/dev/null
   ```

4. **格式化输出**：
   ```
   活动中的 PSM 会话：

   ID                 | 类型    | 状态     | Worktree
   -------------------|---------|----------|---------------------------
   omc:pr-123        | review  | active   | ~/.psm/worktrees/omc/pr-123
   omc:issue-42      | fix     | detached | ~/.psm/worktrees/omc/issue-42
   ```

### 子命令：`attach <session>`

**用途**：附着到既有会话

**步骤**：

1. **解析会话 ID**：`project:type-number`

2. **验证会话存在**：
   ```bash
   tmux has-session -t "psm_${session_id//[.:]/_}" 2>/dev/null   # 把公开 id 转换为 tmux 安全名
   ```

3. **附着**：
   ```bash
   tmux attach -t "psm_${session_id//[.:]/_}"
   ```

### 子命令：`kill <session>`

**用途**：终止会话并清理

**步骤**：

1. **终止 tmux 会话**：
   ```bash
   tmux kill-session -t "psm_${session_id//[.:]/_}" 2>/dev/null
   ```

2. **移除 worktree**：
   ```bash
   worktree_path=$(jq -r ".sessions[\"$session_id\"].worktree" ~/.psm/sessions.json)
   source_repo=$(jq -r ".sessions[\"$session_id\"].source_repo" ~/.psm/sessions.json)

   cd "$source_repo"
   git worktree remove "$worktree_path" --force
   ```

3. **更新注册表**：
   ```bash
   # 从 sessions.json 中移除
   ```

### 子命令：`cleanup`

**用途**：清理已合并的 PR 和已关闭的 issue

**步骤**：

1. **读取所有会话**

2. **对每个 PR 会话，检查是否已合并**：
   ```bash
   gh pr view <pr_number> --repo <repo> --json merged,state
   ```

3. **对每个 issue 会话，检查是否已关闭**：
   ```bash
   gh issue view <issue_number> --repo <repo> --json closed,state
   ```

4. **清理已合并/已关闭的会话**：
   - 终止 tmux 会话
   - 移除 worktree
   - 更新注册表

5. **报告**：
   ```
   清理完成：
     已移除：omc:pr-123（已合并）
     已移除：omc:issue-42（已关闭）
     已保留：omc:feat-auth（活动）
   ```

### 子命令：`status`

**用途**：显示当前会话信息

**步骤**：

1. **从 tmux 或 cwd 检测当前会话**：
   ```bash
   tmux display-message -p "#{session_name}" 2>/dev/null
   # 或检查 cwd 是否位于某个 worktree 内
   ```

2. **读取会话元数据**：
   ```bash
   cat .psm-session.json 2>/dev/null
   ```

3. **显示状态**：
   ```
   当前会话：omc:pr-123
   类型：review
   PR：#123 - 添加 webhook 支持
   分支：feature/webhooks
   创建于：2 小时前
   ```

---

## 错误处理

| 错误 | 解决方式 |
|-------|------------|
| worktree 已存在 | 提供选项：附着、重建或中止 |
| 未找到 PR | 核对 URL/编号，检查权限 |
| 没有 tmux | 发出警告并跳过会话创建 |
| 没有 gh CLI | 报错并给出安装说明 |

## Teleport 命令

`omc teleport` 命令提供了完整 PSM 会话之外的轻量替代方案。它创建 git worktree 而不做 tmux 会话管理 —— 非常适合快速的隔离式开发。

### 用法

```bash
# 为 issue 或 PR 创建 worktree
omc teleport #123
omc teleport owner/repo#123
omc teleport https://github.com/owner/repo/issues/42

# 为功能开发创建 worktree
omc teleport my-feature

# 列出已有的 worktree
omc teleport list

# 移除 worktree
omc teleport remove issue/my-repo-123
omc teleport remove --force feat/my-repo-my-feature
```

### 选项

| 标志 | 描述 | 默认值 |
|------|-------------|---------|
| `--worktree` | 创建 worktree（默认，为兼容性保留） | `true` |
| `--path <path>` | 自定义 worktree 根目录 | `~/Workspace/omc-worktrees/` |
| `--base <branch>` | 创建所基于的基础分支 | `main` |
| `--json` | 以 JSON 输出 | `false` |

### worktree 布局

```
~/Workspace/omc-worktrees/
├── issue/
│   └── my-repo-123/        # issue 的 worktree
├── pr/
│   └── my-repo-456/        # PR 审查的 worktree
└── feat/
    └── my-repo-my-feature/ # 功能开发的 worktree
```

### PSM 与 Teleport 对比

| 功能 | PSM | Teleport |
|---------|-----|----------|
| git worktree | 是 | 是 |
| tmux 会话 | 是 | 否 |
| 启动 Claude Code | 是 | 否 |
| 会话注册表 | 是 | 否 |
| 自动清理 | 是 | 否 |
| 项目别名 | 是 | 否（使用当前仓库） |

需要完整的托管会话时用 **PSM**。需要快速创建 worktree 时用 **teleport**。

---

## 依赖要求

必需：
- `git` —— 版本控制（需支持 worktree，v2.5+）
- `jq` —— JSON 解析
- `tmux` —— 会话管理（可选，但推荐）

可选（按提供方）：
- `gh` —— GitHub CLI（用于 GitHub 工作流）
- `jira` —— Jira CLI（用于 Jira 工作流）

## 初始化

首次运行时，创建默认配置：

```bash
mkdir -p ~/.psm/worktrees ~/.psm/logs

# 若不存在则创建默认的 projects.json
if [[ ! -f ~/.psm/projects.json ]]; then
  cat > ~/.psm/projects.json << 'EOF'
{
  "aliases": {
    "omc": {
      "repo": "Yeachan-Heo/oh-my-claudecode",
      "local": "~/Workspace/oh-my-claudecode",
      "default_base": "main"
    }
  },
  "defaults": {
    "worktree_root": "~/.psm/worktrees",
    "cleanup_after_days": 14,
    "auto_cleanup_merged": true
  }
}
EOF
fi

# 若不存在则创建 sessions.json
if [[ ! -f ~/.psm/sessions.json ]]; then
  echo '{"version":1,"sessions":{},"stats":{"total_created":0,"total_cleaned":0}}' > ~/.psm/sessions.json
fi
```
