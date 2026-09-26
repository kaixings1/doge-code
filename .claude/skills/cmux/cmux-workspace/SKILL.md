---
name: cmux-workspace
description: 在当前 cmux 工作区与终端内工作。用于 cmux 工作区、当前工作区、调用方界面、面板、界面、socket 定向以及不干扰用户的 cmux 自动化。
---

# cmux 工作区

把工作范围限定在调用该代理的 cmux 工作区内。

- **Window**：一个 macOS cmux 窗口。
- **Workspace**：侧边栏中的一个条目。UI 称之为 tab；CLI 与 socket API 称之为 workspace。
- **Pane**：工作区内的一个分屏区域。
- **Surface**：面板内的标签页，可以是终端或浏览器。
- **Panel**：界面内的内容类型。优先使用 CLI 的 surface 命令，而非 panel 内部机制。

## 默认规则

除非用户明确要求另一个工作区、另一个窗口或全局状态，否则把操作限定在当前调用方工作区。不要假定视觉上获得焦点的工作区就是正确目标：代理可能在一个工作区运行，而用户正在看另一个。

```bash
printf 'workspace=%s\nsurface=%s\nsocket=%s\n' \
  "${CMUX_WORKSPACE_ID:-}" "${CMUX_SURFACE_ID:-}" "${CMUX_SOCKET_PATH:-}"
cmux identify --json
```

CMUX_WORKSPACE_ID 是默认的工作区锚点，CMUX_SURFACE_ID 是默认的调用方终端锚点。若它们缺失，回退到 cmux identify --json，并明确说明你正在使用当前获得焦点的上下文。

## 非打扰式自动化

把布局与焦点视为两件独立的事。select-workspace、focus-pane、focus-panel 以及会改变焦点的 tab-action 动词都是影响用户的动作，就像点击一样。绝不要投机地调用它们，即使在调用方自己的工作区内，因为用户可能在看别处。

一次性以增量的方式构建布局，使用能直接创建出已填充正确界面的面板的命令：

```bash
cmux new-pane --workspace "${CMUX_WORKSPACE_ID}" --type browser --direction right --url "http://127.0.0.1:8765"
cmux new-pane --workspace "${CMUX_WORKSPACE_ID}" --type terminal --direction down
```

避免使用先创建、再移动、再聚焦的链条。凡动词支持 --focus false 的地方都传该参数（move-surface --focus false 可保住用户的注意力；更多命令可能会逐步增加该标志，见 https://github.com/manaflow-ai/cmux/issues/1418 与 https://github.com/manaflow-ai/cmux/issues/2820）。如果某条布局命令拒绝一个合法的 surface: 或 pane: 引用，报告该 bug 并停止，而不要靠聚焦来绕过它。

## 右侧辅助面板

对于辅助输出（预览应用、TUI、日志、一次性 shell、浏览器检查），复用调用方终端右侧的一个辅助面板。先用 cmux identify --json、cmux list-panes 与 cmux list-pane-surfaces 检查，然后：

- 辅助面板已存在：向其中添加一个界面。
  ```bash
  cmux new-surface --workspace "${CMUX_WORKSPACE_ID:-}" --pane pane:<helper> --type terminal --focus false
  ```
- 没有辅助面板：恰好创建一个。
  ```bash
  cmux new-pane --workspace "${CMUX_WORKSPACE_ID:-}" --type terminal --direction right --focus false
  ```
- 来自同一次自动化的多个明显的陈旧辅助面板，且用户要求整理：保留一个并清理重复项。绝不要关闭你无法确信属于陈旧辅助输出的面板。

通过显式的界面引用向新建或复用的界面发送命令。反复出现的打开它请求会在既有的右侧辅助面板中创建标签页，而不是产生更多分屏。

## 调用方终端

调用该代理的界面是相对操作最安全的锚点。

```bash
cmux send "npm test\n"                                    # 调用方工作区中已获得焦点的终端
cmux send --surface "${CMUX_SURFACE_ID:-}" "git status\n"  # 精确的调用方界面
cmux send-key --surface "${CMUX_SURFACE_ID:-}" enter
```

除非用户指明了该目标，否则不要向另一个工作区发送按键、关闭界面或改变焦点。

## 移动界面

```bash
cmux move-surface --surface "${CMUX_SURFACE_ID}" --before surface:3   # 也可用 --after、--index
cmux move-surface --surface surface:240 --pane pane:172 --focus false
cmux drag-surface-to-split --surface surface:240 down
```

已知的易用性问题：drag-surface-to-split 经由 V1 路由，并通过 UI 焦点解析工作区，因此当调用方工作区不是视觉上获得焦点的那个时，它会以 ERROR: Surface not found 失败（https://github.com/manaflow-ai/cmux/issues/1901，相关 https://github.com/manaflow-ai/cmux/issues/3189）。在该问题修复之前，请以增量方式构建布局。绝不要调用 focus-pane 或 focus-panel 来从失败的移动中恢复；报告失败并停止。

## 侧边栏状态

把状态、进度与日志挂到当前工作区，使侧边栏反映本任务。

```bash
cmux set-status build "running" --workspace "${CMUX_WORKSPACE_ID:-}" --color "#ff9500"
cmux set-progress 0.4 --label "Building" --workspace "${CMUX_WORKSPACE_ID:-}"
cmux log --workspace "${CMUX_WORKSPACE_ID:-}" --level info -- "Started build"
cmux sidebar-state --workspace "${CMUX_WORKSPACE_ID:-}" --json
```

## 贡献者重载

对于 cmux 源码检出中的 cmux 应用/运行时改动，请从活动 worktree 使用带标签的重载。它会创建隔离的应用名、bundle ID、调试 socket 与 DerivedData 路径。绝不要构建或启动未打标签的 cmux DEV。

```bash
./scripts/reload.sh --tag <short-tag>
CMUX_SOCKET_PATH=/tmp/cmux-debug-<short-tag>.sock cmux identify --json
```

## Socket 访问

优先使用 cmux 提供的 socket 路径，早于任何默认值：SOCK="${CMUX_SOCKET_PATH:-/tmp/cmux.sock}"。socket 访问可能被关闭、可能仅限 cmux 派生的进程，也可能对所有本地进程开放。如果某条命令无法连接，在修改设置之前先检查 cmux capabilities --json 与 cmux ping。

## 规则

- 默认在调用方工作区工作；即使已设置环境变量，变更类操作也优先使用显式的 --workspace 与 --surface 标志，使自动化可被审计。
- 除非用户明确要求，否则绝不调用 focus-pane、focus-panel、select-workspace 或会改变焦点的 tab-action 动词。
- 在 move-surface 以及任何支持该标志的创建类动词上传递 --focus false。
- 用 new-pane --type ... --url ... 以增量方式构建布局，而非先创建、再移动、再聚焦。
- 如果某条 CLI 命令拒绝一个合法的界面或面板引用，报告它。不要靠聚焦来绕过。
- 除非用户指明该目标，否则不要关闭、聚焦、移动或向另一个工作区发送输入。
- 在对话与示例中使用短引用；UUID 仅用于日志、持久化或调试。

## 参考

- [references/commands.md](references/commands.md)：完整的工作区、面板、界面、通知与工具命令清单。
- [../cmux-browser/SKILL.md](../cmux-browser/SKILL.md)：遵循同一当前工作区规则的浏览器界面。
