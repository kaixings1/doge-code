---
name: herdr
description: "控制 Herdr — 一个面向编码代理的终端复用器。仅当用户明确提到 Herdr，或要求使用 Herdr 检查/控制 pane、tab、workspace、命令或另一个代理时才使用。"
---

# Herdr

Herdr 把终端组织为 workspace、tab 和 pane，识别在 pane 中运行的编码代理，并通过 `herdr` CLI 暴露当前会话。

在发出任何控制命令之前，先验证本代理是否运行在 Herdr 管理的 pane 中：

```bash
test "${HERDR_ENV:-}" = 1
```

如果检查失败，说明你并未运行在 Herdr 内部并停止。不要从 Herdr 外部检查或控制获得焦点的 Herdr 会话。

检查通过后，`PATH` 中的 `herdr` 二进制会与当前会话通信。用它检查邻近的工作、创建终端布局、启动代理和命令、读取输出，以及等待状态变化。

## 了解当前的 CLI

已安装的二进制是命令语法的权威来源。从下面开始：

```bash
herdr --help
```

然后通过不带子命令地运行该命令组，打印出相关命令组：

```bash
herdr agent
herdr pane
herdr workspace
herdr tab
herdr worktree
herdr terminal
herdr notification
herdr integration
herdr session
```

**不要**为做发现而运行裸 `herdr`；它会启动或附着 TUI。**不要**通过省略参数来试探一个会改动的嵌套命令。`herdr workspace create` 这类命令带默认值即有效，并且会真正执行。

大多数控制命令返回 JSON。从这些响应中读取标识符和状态，而不是去预测它们。

## 理解布局、pane 与代理

选择匹配该任务的基本单元：

- workspace、tab 和 pane 的拓扑组织终端位置。
- pane 命令控制原始终端、shell、测试、服务器、输入和输出。
- agent 命令控制当前占据某个 pane 的、已被识别的编码代理。

无论是否包含代理，pane 都存在。`agent start` 需要一个已存在的可用 shell pane，且绝不创建、拆分或移动布局。普通进程使用 pane 命令。当 Herdr 必须校验代理身份或解读 `idle`、`working`、`blocked`、`done`、`unknown` 生命周期状态时，使用 agent 命令。

agent 命令接受唯一的存活代理名称，或当前托管该代理的 pane ID。它们不接受 terminal ID 或裸的代理种类标签。名称必须匹配 `[a-z][a-z0-9_-]{0,31}`，且在存活代理中唯一。名称跟随当前 pane 占用者，并在该代理退出、被释放或被替换时清除。

`idle` 表示代理已准备好接收输入，且其 tab 已在获得焦点的 Herdr UI 中被看到过。`done` 是未见过的后台工作完成后同样的底层 idle 状态。聚焦该 tab，或用 focus 命令指向该 pane 或代理，会把它标记为已看到。CLI 读取**不会**把它标记为已看到。`blocked` 表示 Herdr 识别出了审批或提问 UI。`unknown` 表示存在代理但 Herdr 无法自信地分类它；这并不证明已完成。

## 使用 ID 与调用方上下文

公共 ID 是不透明的稳定句柄：

- workspace：`w1`
- tab：`w1:t1`
- pane：`w1:p1`

已关闭的 tab 和 pane ID 不会被复用。移动到另一个 workspace 的 pane 会获得新的、带 workspace 限定的 pane ID。`pane move` 之后，继续使用 `.result.move_result.pane.pane_id` 或存活的代理名称。旧值以 `.result.move_result.previous_pane_id` 报告；只有被移动进程所继承的调用方上下文仍会解析该旧 ID，因此不要把它当作通用的代理目标。

Herdr 把调用方的上下文注入每个受管 pane：

```bash
printf '%s\n' "$HERDR_WORKSPACE_ID" "$HERDR_TAB_ID" "$HERDR_PANE_ID"
```

当 pane 命令应指向调用方 pane 时，优先使用 `--current`。省略目标可能会使用 UI 获得焦点的 pane，而它可能属于用户或另一个客户端。

用以下命令发现实时状态：

```bash
herdr workspace list
herdr tab list --workspace "$HERDR_WORKSPACE_ID"
herdr pane current --current
herdr pane list --workspace "$HERDR_WORKSPACE_ID"
herdr agent list
```

创建操作的响应会暴露接下来要用的 ID。`workspace create` 返回 `.result.workspace`、`.result.tab` 和 `.result.root_pane`。`tab create` 返回 `.result.tab` 和 `.result.root_pane`。`pane split` 以 `.result.pane` 返回新 pane。

## 启动并协调一个代理

默认在当前 tab 中创建一个使用当前工作目录的兄弟 pane。除非用户明确要求该拓扑或位置，否则不要创建 workspace、tab、worktree 或使用不同的 cwd。

遵循用户要求的方向。否则检查调用方 pane：

```bash
herdr pane layout --pane "$HERDR_PANE_ID"
```

宽的 pane 向右拆分，窄或高的 pane 向下拆分。避免重复同方向拆分，那会造出窄到无法使用的列或短到无法使用的行。把用户焦点保持在调用方 pane 中，并显式保留调用方的工作目录：

```bash
herdr pane split --current --direction right --cwd "$PWD" --no-focus
```

适当时把 `right` 换成 `down`。从 `.result.pane.pane_id` 读取新 pane ID。

一个可用的 shell pane 必须处于其交互式提示符，shell 本身在前台，且没有前台命令、编辑器或代理在运行。用一个有意义的唯一名称在该 pane 中启动受支持的代理：

```bash
herdr agent start reviewer --kind codex --pane <returned-pane-id>
```

使用用户要求的 kind。运行 `herdr agent` 检查已安装的 kind 列表和选项。原生代理参数只在 `--` 之后传递：

```bash
herdr agent start reviewer --kind codex --pane <returned-pane-id> -- <agent-args...>
```

`agent start` 只在 Herdr 在同一 pane 中检测到预期的代理并认为它已准备好交互输入后才返回。它默认有 30 秒启动超时。

通过 agent 接口提交工作：

```bash
herdr agent prompt reviewer "审查当前 diff，只报告可执行的发现。" --wait --timeout 120000
```

`agent prompt` 原子化地提交文本和编码的回车，同时遵循 pane 的实时 bracketed-paste 模式。对于常规的代理工作，`--wait` 就够了：它等待第一个稳定下来的 `idle`、`done` 或 `blocked` 状态。不要用 `--until` 重复这些默认值。

从非工作状态下发出的提示必须在五秒内产生一个被观察到的生命周期变化。否则 Herdr 会返回 `agent_prompt_stalled`，而不是无限期等待。该等待跟踪的是生命周期状态，而非单个轮次；如果代理已在工作中，当前轮次的完成也可能使其满足。

只对状态专属的工作流使用 `--until`，例如等待已在运行的代理请求输入：

```bash
herdr agent wait reviewer --until blocked --timeout 120000
```

不带 `--until` 时，独立的 `agent wait` 使用与 `agent prompt --wait` 相同的稳定状态默认值。

对交互式代理 UI 控件使用逻辑按键：

```bash
herdr agent send-keys reviewer esc
herdr agent send-keys reviewer ctrl+c
```

Herdr 在写入任何字节之前校验所有按键。通过已解析的代理读取结果：

```bash
herdr agent get reviewer
herdr agent read reviewer --source recent-unwrapped --lines 120
```

如果等待失败或返回 `blocked`，在决定发送什么输入之前检查 `agent get` 和 `agent read`。仅当刻意要控制原始终端时才使用 pane 接口。

## 在另一个 pane 中运行普通命令

用同样的几何规则创建兄弟 pane，保留调用方的工作目录，并保持用户焦点不变：

```bash
herdr pane split --current --direction right --cwd "$PWD" --no-focus
```

从 `.result.pane.pane_id` 读取新 pane ID，然后运行并检查该命令：

```bash
herdr pane run <returned-pane-id> "just test"
herdr pane wait-output <returned-pane-id> --match "test result" --timeout 120000
herdr pane read <returned-pane-id> --source recent-unwrapped --lines 120
```

`pane run` 原子化地发送命令文本和回车。`pane wait-output` 会立即搜索所选快照，因此已存在的输出也能匹配。用 `--match <text>` 匹配字面子串，或用 `--regex <pattern>` 匹配 Rust 正则表达式。省略 `--timeout` 则允许无限期等待。

使用匹配该任务的读取来源：

- `visible`：当前渲染的视口。
- `recent`：最近的渲染输出，包含软换行。
- `recent-unwrapped`：软换行已合并的最近输出；日志和转录优先用它。
- `detection`：用于代理检测的纯文本底缓冲区快照。

当颜色和终端样式属于证据时使用 `--format ansi`。否则使用 text。

`--lines` 向 Herdr 请求从该 pane 可用屏幕和主机回滚缓冲区中取更多行。如果增大它仍不能显示出更多已完成的响应，该 pane 很可能正在终端的备用屏幕（alternate screen）上运行代理。离开备用屏幕的行不会进入 Herdr 的主机回滚缓冲区，因此更大的行数也无法恢复它们。

在那次失败的读取之后，要求代理把完整响应以 Markdown 写入一个临时目录，并只回复文件路径，然后直接读取该文件。仅将此作为回退方案；不要在初始提示中就要求文件输出。

## 安全与协调规则

- 后台工作使用 `--no-focus`，除非用户要求切换上下文。
- 使用 `--current`、显式的 pane ID，或唯一的代理名称。不要依赖另一个客户端获得焦点的 pane。
- 从 JSON 响应中解析 ID。不要从侧边栏顺序或示例中推导它们。
- 不要关闭不是你创建的 workspace、tab、pane 或会话，除非用户明确要求。
- 绝不从活动会话中运行 `herdr server stop`，除非用户明确打算停止服务器及其 pane 进程。
- 绝不杀死 Herdr 主进程。需要隔离服务器的实验请使用具名测试会话。
- CLI 服务器错误以 JSON 输出到 stderr，退出状态为 1。CLI 语法错误以退出状态 2 退出。
