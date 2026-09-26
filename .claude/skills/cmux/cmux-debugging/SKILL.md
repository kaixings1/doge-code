---
name: cmux-debugging
description: "cmux 的调试日志、调试菜单、运行时坑点、对输入延迟敏感的路径、SwiftUI 列表快照边界、OS 版本复现，以及本地可视化迭代。在添加调试探针、诊断 UI/运行时问题、改动终端渲染、标签/侧边栏列表视图、拖放 UTTypes，或使用调试菜单时用。"
---

# cmux 调试

## 调试事件日志

把调试事件插桩（按键、鼠标、焦点、分屏、标签页）写进统一的 DEBUG 构建日志。这并不要求给每条新代码路径都加日志；大多数探针属于内部试用调试循环，合并前会被移除。

```bash
tail -f "$(cat /tmp/cmux-last-debug-log-path 2>/dev/null || echo /tmp/cmux-debug.log)"
```

- 未打 tag 的 Debug app 记录到 `/tmp/cmux-debug.log`；已打 tag 的（`./scripts/reload.sh --tag <tag>`）记录到 `/tmp/cmux-debug-<tag>.log`。
- `reload.sh` 会把当前日志路径写入 `/tmp/cmux-last-debug-log-path`，把所选的开发 CLI 路径写入 `/tmp/cmux-last-cli-path`，并让 `/tmp/cmux-cli` 和 `$HOME/.local/bin/cmux-dev` 指向该 CLI。
- 实现位置：`Packages/macOS/CMUXDebugLog/Sources/CMUXDebugLog/DebugEventLog.swift`。App 垫片：`Sources/App/DebugLogging.swift`。两者都包在 `#if DEBUG` 中，因此每个调用点都必须用 `#if DEBUG` / `#endif` 包裹。
- `cmuxDebugLog("message")` 会打上时间戳并实时追加。它背后是一个 500 条的环形缓冲区；`CMUXDebugLog.DebugEventLog.shared.dump()` 会把整个缓冲区写入文件。
- 按键事件记录在 `AppDelegate.swift` 中（monitor、`performKeyEquivalent`）；鼠标/UI 事件内联在视图里（`ContentView`、`BrowserPanelView`）。
- 稳定的事件前缀：`focus.panel`、`focus.bonsplit`、`focus.firstResponder`、`focus.moveFocus`、`tab.select`、`tab.close`、`tab.dragStart`、`tab.drop`、`pane.focus`、`pane.drop`、`divider.dragStart`。

## 调试菜单

DEBUG 构建会在 macOS 菜单栏中多出一个 **调试** 菜单。用户说“debug menu”或“debug window”时指的就是它，而不是 `defaults write`。

**调试 > 调试窗口** 中放着用于调节布局、颜色和行为的各种面板，按字母顺序排列，不带分隔线。要新增一个：创建一个带 `shared` 单例的 `NSWindowController` 子类，在 `Sources/cmuxApp.swift` 的“调试窗口”菜单中注册它，并用一个使用 `@AppStorage` 绑定的 SwiftUI 视图来支撑它，以实现实时变更。

## 运行时坑点

- 自定义拖放 UTTypes 必须在 `Resources/Info.plist` 的 `UTExportedTypeDeclarations` 下声明。
- 不要添加 app 级 display link 或手动的 `ghostty_surface_draw` 循环；依靠 Ghostty 的唤醒/渲染器来避免输入延迟。
- `Sources/TerminalWindowPortal.swift` 中的 `WindowTerminalHostView.hitTest()` 会在包括键盘在内的每个事件上运行。不要在 `isPointerEvent` 守卫之外做任何工作。
- `Sources/ContentView.swift` 中的 `TabItemView` 使用 `Equatable` 加 `.equatable()`，以便在输入时跳过 body 重新求值。若不更新 `==` 并在调用点保留 `.equatable()`，就不要新增对 environment/store/binding 的读取。
- `Sources/GhosttyTerminalView.swift` 中的 `TerminalSurface.forceRefresh()` 会在每次按键时运行。不得有内存分配、文件 I/O 或格式化。
- `SurfaceSearchOverlay` 必须从 `Sources/GhosttyTerminalView.swift` 中的 `GhosttySurfaceScrollView` 挂载，而不是从 SwiftUI 面板容器挂载。
- 位于 `LazyVStack` / `LazyHStack` / `List` / `ForEach` 边界之下的视图只会收到不可变快照加闭包，绝不收到可观察 store。
- 从 SwiftUI `body` 中调用的函数不得修改状态或安排 store 写入。
- Foundation、SwiftUI、AttributeGraph 和 WebKit 的语义在不同 macOS 大版本之间会变化。在断定用户报告的复现问题不成立之前，先到报告问题者所用的 macOS 上测试。

## 详细参考

- [references/debug-event-log.md](references/debug-event-log.md)：何时添加探针以及如何命名它们。
- [references/runtime-pitfalls.md](references/runtime-pitfalls.md)：在改动终端渲染、命中测试、标签行、列表虚拟化、搜索浮层层级或对 OS 版本敏感的代码之前先读它。
