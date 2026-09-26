---
name: omc-teams
description: 面向 Claude、Codex、Gemini、Antigravity、Grok 或 Cursor worker 的 CLI 团队运行时，在 tmux 面板中运行。
aliases: []
level: 4
---

# OMC Teams 技能

在 tmux 面板中生成 N 个 CLI 工作进程以并行执行任务。支持 `claude`、`codex`、`gemini`、`antigravity`、`grok` 和 `cursor` 代理类型。Cursor 工作进程仅限 executor 风格任务。

`/omc-teams` 是面向 CLI 优先运行时的遗留兼容性技能：请使用 `omc team ...` 命令（而非已弃用的 MCP 运行时工具）。

## 用法

```bash
/oh-my-claudecode:omc-teams N:claude "任务描述"
/oh-my-claudecode:omc-teams N:codex "任务描述"
/oh-my-claudecode:omc-teams N:gemini "任务描述"
/oh-my-claudecode:omc-teams N:antigravity "任务描述"
/oh-my-claudecode:omc-teams N:grok "任务描述"
/oh-my-claudecode:omc-teams N:cursor "实现任务描述"
```

### 参数

- **N** —— CLI 工作进程数量（1-10）
- **agent-type** —— `claude`（Claude CLI）、`codex`（OpenAI Codex CLI）、`gemini`（Google Gemini CLI；企业/API 密钥档）、`antigravity`（Antigravity CLI `agy`；Google 对 Gemini CLI 的继任者）、`grok`（xAI Grok CLI）或 `cursor`（Cursor agent CLI；仅限 executor 风格任务）
- **task** —— 分发给所有工作进程的任务描述

### 示例

```bash
/omc-teams 2:claude "实现带测试的认证模块"
/omc-teams 2:codex "审查认证模块的安全问题"
/omc-teams 3:gemini "为无障碍性重新设计 UI 组件"
/omc-teams 3:antigravity "为无障碍性重新设计 UI 组件"
/omc-teams 1:grok "为一种实现方案做原型验证"
/omc-teams 1:cursor "应用该实现计划"
```

## 要求

- 从普通终端运行时，**tmux 二进制**必须已安装且可被发现（`command -v tmux`）；经典 tmux 会话会复用当前 tmux 界面。
- **cmux 界面可选**，用于原生的就地分屏（设置了 `CMUX_SURFACE_ID` 而没有 `$TMUX`）。普通终端仍使用分离式 tmux 回退方案。
- **claude** CLI：按[官方设置说明](https://code.claude.com/docs/en/setup) 安装并认证 Claude Code；对普通用户安装而言，旧的 Anthropic npm 包安装路径已弃用。
- **codex** CLI：`npm install -g @openai/codex`
- **gemini** CLI：`npm install -g @google/gemini-cli`（企业/API 密钥档）
- **antigravity** CLI：按[官方说明](https://antigravity.google) 安装（提供 `agy` 二进制）—— 用 `agy --version` 验证；Google 对 Gemini CLI 的继任者
- **grok** CLI：安装并认证你环境中所使用的 Grok CLI
- **cursor** CLI：安装并认证 `cursor-agent`；如果不可用，报告该环境要求，而不是静默回退到仅 Claude 的执行

## 工作流

### 阶段 0：验证前置条件

在断言 tmux 缺失之前，先检查活动的多路复用器。如果 `$TMUX` 为空且 `CMUX_SURFACE_ID` 也为空，则显式检查 tmux：

```bash
command -v tmux >/dev/null 2>&1
```

- 如果普通终端下的 tmux 检查失败，报告 **tmux 未安装**并停止。
- 如果设置了 `$TMUX`，`omc team` 可直接复用当前的 tmux 窗口/面板。
- 如果 `$TMUX` 为空但设置了 `CMUX_SURFACE_ID`，报告用户正运行在 **cmux** 内部。**不要**说 tmux 缺失或他们"不在 tmux 内"；`omc team` 会为工作进程创建**原生 cmux 分屏**。
- 如果 `$TMUX` 和 `CMUX_SURFACE_ID` 都未设置，报告用户处于**普通终端**中。`omc team` 仍可启动一个**分离式 tmux 会话**，但如果他们明确想要就地面板/窗口拓扑，应先从经典 tmux 会话开始。
- 如果你需要确认活动的 tmux 会话，使用：

```bash
tmux display-message -p '#S'
```

### 阶段 1：解析并校验输入

提取：

- `N` —— 工作进程数量（1–10）
- `agent-type` —— `claude|codex|gemini|grok|cursor`
- `task` —— 任务描述

在分解或运行任何东西**之前**做校验：

- 提前拒绝不受支持的代理类型。`/omc-teams` **只**支持 **`claude`**、**`codex`**、**`gemini`**、**`antigravity`**、**`grok`** 和 **`cursor`**。
- 仅把 Cursor 工作进程视为 executor 风格。接受 `N:cursor` 和 `N:cursor:executor`；把 reviewer、critic、security-reviewer、裁决或最终批准类工作驳回或改派给原生 Claude/OMC 审查代理。
- 如果用户要求 `expert` 之类不受支持的类型，说明 `/omc-teams` 只启动外部 CLI 工作进程。
- 对原生 Claude Code 团队代理/角色，改为引导他们使用 **`/oh-my-claudecode:team`**。

### 阶段 2：分解任务

把工作拆成 N 个相互独立的子任务（按文件或关注点划分）以避免写入冲突。

### 阶段 2.5：为多仓库计划解析工作区根目录

`omc team` 以**一个**共享工作目录启动所有工作进程。对单仓库任务，当前仓库通常就是正确的。对多仓库任务，尤其是当一个计划位于某个仓库、而实现涉及同级仓库时，在启动前先解析工作目录：

- 如果任务引用了某个仓库下的计划工件（例如
  `tool/.omc/plans/task-1200-gwd-gifs.md`）以及同级仓库中的目标路径
  （例如 `api/` 和 `admin/`），选择包含所有参与仓库的共享工作区根目录（例如父级 `inter/` 目录）。
- 在任务文本中使用**绝对的计划路径**，这样在 `--cwd` 改变启动目录后工作进程仍能找到该计划。
- 在任务文本和子任务中包含显式的仓库路径或仓库名。
- 当目标仓库是同级时，**不要**把启动时的工作目录只锚定在包含 `.omc/plans/...` 的那个仓库上；那会让 `codex`、`claude`、`gemini`、`antigravity`、`grok` 和 `cursor` 工作进程滞留在该计划仓库中，而非实现工作区。
- 如果无法识别安全的共享工作区根目录，则**不要**启动 `/omc-teams`。报告这一单一工作目录约束，并请用户提供、或从证据中推断出预期的工作区根目录。

### 阶段 3：启动 CLI 团队运行时

激活模式状态（推荐）：

```text
state_write(mode="team", current_phase="team-exec", active=true)
```

通过 CLI 启动工作进程：

```bash
omc team <N>:<claude|codex|gemini|antigravity|grok|cursor> "<task>"
```

对于阶段 2.5 中解析出的多仓库场景，从共享工作区根目录启动，沿用既有的 `--cwd` 约定，并保持计划引用为绝对路径：

```bash
omc team <N>:<claude|codex|gemini|antigravity|grok|cursor> "<task with absolute plan path and explicit repo paths>" --cwd <workspace-root>
```

团队名默认从任务文本生成一个短标识（例如 `review-auth-flow`）。

启动之后，验证命令**确实已执行**，而不是假定回车已触发。检查面板输出，并确认该命令或工作进程引导文本出现在面板历史中：

```bash
tmux list-panes -a -F '#{session_name}:#{window_index}.#{pane_index} #{pane_id} #{pane_current_command}'
tmux capture-pane -pt <pane-id> -S -20
```

除非面板输出显示该命令已被提交，否则不要宣称团队已成功启动。

### 阶段 4：监控 + 生命周期 API

```bash
omc team status <team-name>
omc team api list-tasks --input '{"team_name":"<team-name>"}' --json
```

使用 `omc team api ...` 进行任务认领、任务状态流转、邮箱投递和工作进程状态更新。

### 阶段 5：关闭（仅在需要时）

```bash
omc team shutdown <team-name>
omc team shutdown <team-name> --force
```

用 shutdown 处理有意的取消或陈旧状态清理。优先使用非强制的 shutdown。

### 阶段 6：报告 + 状态关闭

报告任务结果，包含完成/失败摘要以及任何剩余风险。

```text
state_write(mode="team", current_phase="complete", active=false)
```

## 已弃用运行时说明

以下遗留 MCP 运行时工具在执行方面已弃用：

- `omc_run_team_start`
- `omc_run_team_status`
- `omc_run_team_wait`
- `omc_run_team_cleanup`

如果遇到，切换到 `omc team ...` CLI 命令。

## 错误参考

| 错误 | 原因 | 修复 |
| ---------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------- |
| `not inside tmux` | 从非 tmux 界面请求了就地面板拓扑 | 启动 tmux 后重跑，或让 `omc team` 使用其分离会话回退方案 |
| `cmux surface detected` | 在 cmux 内运行而没有 `$TMUX` | 使用正常的 `omc team ...` 流程；OMC 会创建原生 cmux 工作进程分屏 |
| `Unsupported agent type` | 请求的代理不是 claude/codex/gemini/antigravity/grok/cursor | 使用 `claude`、`codex`、`gemini`、`antigravity`、`grok` 或 `cursor`；对原生 Claude Code 代理使用 `/oh-my-claudecode:team` |
| `codex: command not found` | Codex CLI 未安装 | `npm install -g @openai/codex` |
| `gemini: command not found` | Gemini CLI 未安装 | `npm install -g @google/gemini-cli`（企业/API 密钥档） |
| `agy: command not found` | Antigravity CLI 未安装 | 按[官方说明](https://antigravity.google) 安装 |
| `Team <name> is not running` | 运行时状态陈旧或缺失 | 先 `omc team status <team-name>`，若陈旧则 `omc team shutdown <team-name> --force` |
| `status: failed` | 工作进程退出时工作未完成 | 检查运行时输出，收窄范围，重新运行 |

## 与 `/team` 的关系

| 方面 | `/team` | `/omc-teams` |
| ------------ | ------------------------------------------------------------- | ---------------------------------------------------- |
| 工作进程类型 | Claude Code 隐式代理团队队友 | tmux 中的 claude / codex / gemini / antigravity CLI 进程 |
| 调用方式 | 以不同的 `name` 值生成 Agent/Task；Claude Code 2.1.178+ 中无 TeamCreate/TeamDelete | `omc team [N:agent]` + `status` + `shutdown` + `api` |
| 协调机制 | 原生隐式团队消息传递与分阶段流水线 | tmux 工作进程运行时 + CLI API 状态文件 |
| 何时使用 | 你想要 Claude 原生的会话内代理编排 | 你想要外部 CLI 工作进程执行 |
