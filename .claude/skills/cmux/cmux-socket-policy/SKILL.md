---
name: cmux-socket-policy
description: "cmux CLI/socket 相关工作的 socket 命令线程策略与焦点策略。在新增或修改 socket 命令、CLI 命令、遥测命令、focus/select/open/close/send-key 行为，或可能抢占应用焦点的自动化时使用。"
---

# cmux Socket 策略

## 线程策略

- 对于 `report_*`、`ports_kick`、状态/进度更新或日志元数据更新等高频 socket 遥测命令，不要使用 `DispatchQueue.main.sync`。
- 对于遥测热路径，在主线程之外解析并校验参数。
- 先在主线程之外去重与合并。
- 仅在需要时用 `DispatchQueue.main.async` 调度最小的 UI/模型变更。
- 直接操作 AppKit/Ghostty UI 状态的命令允许在主 actor 上运行。
- 如果新增 socket 命令，默认采用主线程之外的处理方式；若必须在主线程执行，需在代码注释中写明明确理由。

## 焦点策略

- socket/CLI 命令不得抢占 macOS 应用焦点。
- 除非命令具有明确的焦点意图，否则不要激活应用或提升窗口。
- 只有显式带有焦点意图的命令才可以改变应用内的焦点/选中项。
- 显式的焦点意图命令包括 `window.focus`、`workspace.select/next/previous/last`、`surface.focus`、`pane.focus/last`、浏览器焦点命令以及 v1 的焦点等价命令。
- 所有非焦点命令都应在仍应用数据/模型变更的同时，保留用户当前的焦点上下文。

## 详细参考

- 在新增命令、修改命令执行上下文，或判断是否允许改变焦点时，请阅读 [references/threading-and-focus.md](references/threading-and-focus.md)。
