---
name: setup-matt-pocock-skills
description: 为本仓库配置工程技能——设置其 issue 跟踪器、triage 标签词汇表以及领域文档布局。在首次使用其他工程技能之前运行一次。
disable-model-invocation: true
---

# Setup Matt Pocock's Skills

搭建工程技能所假设的每个仓库配置：

- **Issue 跟踪器** — issue 存放的位置（默认为 GitHub；开箱即用也支持本地 markdown）
- **Triage 标签** — 用于五个规范 triage 角色的字符串
- **领域文档** — `CONTEXT.md` 和 ADR 所在的位置，以及阅读它们的使用者规则

这是一个提示驱动的技能，不是确定性脚本。先探索，呈现你发现的，与用户确认，然后再写入。

## Process

### 1. Explore

查看当前仓库以了解其初始状态。读取任何已存在的内容，不要做假设：

- `git remote -v` 和 `.git/config` — 这是一个 GitHub 仓库吗？是哪一个？
- 仓库根目录的 `AGENTS.md` 和 `CLAUDE.md` — 两者中是否存在任何一个？其中是否已经有 `## Agent skills` 部分？
- 仓库根目录的 `CONTEXT.md` 和 `CONTEXT-MAP.md`
- `docs/adr/` 以及任何 `src/*/docs/adr/` 目录
- `docs/agents/` — 此技能先前的输出是否已经存在？
- `.scratch/` — 已经使用本地 markdown issue 跟踪器约定的迹象
- `triage` 技能是否已安装？（与本技能同级的 `triage` 技能文件夹，或者你的可用技能中的 `triage`。）这决定了 Section B 是否运行。
- Monorepo 信号 — 存在 `pnpm-workspace.yaml`、`package.json` 中的 `workspaces` 字段，或者 `packages/*` 中包含自己的 `src/`。这些仅在真正的大型多包仓库中出现；缺失则意味着单一上下文，这适用于几乎所有仓库。

### 2. Present findings and ask

总结已存在和缺失的内容。然后按顺序逐个处理各个部分 — 一个部分，一个回答，然后是下一个。

在每个部分开头给出推荐答案，以便用户可以一句话接受。仅在选项真正产生分支时给出一行说明；当探索已经解决了问题时，完全跳过该部分（当 `triage` 未安装时跳过 Section B，当没有 monorepo 时跳过 Section C）。

**Section A — Issue 跟踪器。**

> 说明："issue 跟踪器"是本仓库的 issue 存放位置。像 `to-tickets`、`triage`、`to-spec` 和 `qa` 这样的技能会从它读取并写入 — 它们需要知道是调用 `gh issue create`、在 `.scratch/` 下写一个 markdown 文件，还是遵循你描述的其他工作流。选择你实际用于跟踪本仓库工作的地方。

默认立场：这些技能是为 GitHub 设计的。如果有 `git remote` 指向 GitHub，则提议使用 GitHub。如果 `git remote` 指向 GitLab（`gitlab.com` 或自托管主机），则提议使用 GitLab。否则（或如果用户偏好其他），提供：

- **GitHub** — issue 存放在仓库的 GitHub Issues 中（使用 `gh` CLI）
- **GitLab** — issue 存放在仓库的 GitLab Issues 中（使用 [`glab`](https://gitlab.com/gitlab-org/cli) CLI）
- **本地 markdown** — issue 作为文件存放在本仓库的 `.scratch/<feature>/` 下（适合个人项目或没有远程仓库的项目）
- **其他**（Jira、Linear 等）— 请用户用一段话描述工作流；该技能会将其作为自由文本记录

将选择记录在 `docs/agents/issue-tracker.md` 中。GitHub 和 GitLab 模板带有"PR 作为请求入口"的标志，默认为**关闭** — 保持关闭，不要提及；想要在 triage 队列中纳入外部 PR 的用户可以稍后在文件中切换该标志。

**Section B — Triage 标签词汇表。** 如果 `triage` 技能未安装（探索已告诉你），完全跳过此部分 — 未安装的技能不需要标签。

如果已安装，只问一个问题：

> 你想保留默认的 triage 标签吗？（推荐：**是**）

默认值是五个规范角色，每个标签字符串与其名称相同：`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`。在回答**是**时，原样写入。只有当用户说不时 — 通常是因为他们的跟踪器已经使用了其他名称（例如用 `bug:triage` 代替 `needs-triage`）— 收集覆盖项，以便 `triage` 应用现有标签而不是创建重复项。

**Section C — 领域文档。** 默认为**单一上下文** — 仓库根目录下有一个 `CONTEXT.md` + `docs/adr/`。这适用于几乎所有仓库；无需询问直接写入。

仅在探索发现 monorepo 信号时才提供**多上下文** — 根目录的 `CONTEXT-MAP.md` 指向每个上下文的 `CONTEXT.md` 文件。然后确认他们想要哪种布局。

### 3. Confirm and edit

向用户展示草稿：

- 要添加到 `CLAUDE.md` / `AGENTS.md`（选择规则见步骤 4）中正在编辑的那个的 `## Agent skills` 块
- `docs/agents/issue-tracker.md`、`docs/agents/domain.md` 和 `docs/agents/triage-labels.md` 的内容（最后一项仅在 `triage` 已安装时）

让他们在写入前进行编辑。

### 4. Write

**选择要编辑的文件：**

- 如果 `CLAUDE.md` 存在，编辑它。
- 否则如果 `AGENTS.md` 存在，编辑它。
- 如果两者都不存在，询问用户创建哪一个 — 不要替他们选择。

当 `CLAUDE.md` 已经存在时，绝不要创建 `AGENTS.md`（反之亦然）— 始终编辑已经存在的那个。

如果所选文件中已经存在 `## Agent skills` 块，请原地更新其内容，而不是追加重复项。不要覆盖用户对周围部分的编辑。

该块：

```markdown
## Agent skills

### Issue tracker

[一行总结 issue 在哪里跟踪]。参见 `docs/agents/issue-tracker.md`。

### Triage labels

[一行总结标签词汇表]。参见 `docs/agents/triage-labels.md`。

### Domain docs

[一行总结布局 — "single-context" 或 "multi-context"]。参见 `docs/agents/domain.md`。
```

仅在 `triage` 已安装且 Section B 运行过时，包含 `### Triage labels` 子块并写入 `docs/agents/triage-labels.md`。当未安装时，两者都省略。

然后使用此技能文件夹中的种子模板作为起点写入文档文件：

- [issue-tracker-github.md](./issue-tracker-github.md) — GitHub issue 跟踪器
- [issue-tracker-gitlab.md](./issue-tracker-gitlab.md) — GitLab issue 跟踪器
- [issue-tracker-local.md](./issue-tracker-local.md) — 本地 markdown issue 跟踪器
- [triage-labels.md](./triage-labels.md) — 标签映射（仅在 `triage` 已安装时）
- [domain.md](./domain.md) — 领域文档使用者规则 + 布局

对于"其他"issue 跟踪器，根据用户的描述从头编写 `docs/agents/issue-tracker.md`。

### 5. Done

告诉用户设置已完成，以及哪些工程技能现在将从这些文件中读取。提醒他们以后可以直接编辑 `docs/agents/*.md` — 只有当他们想切换 issue 跟踪器或从头重新开始时，才需要重新运行此技能。