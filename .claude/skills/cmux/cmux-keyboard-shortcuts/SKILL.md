---
name: cmux-keyboard-shortcuts
description: "引导并应用 cmux 键盘快捷键自定义。当用户要求为 cmux 定制、重新绑定、解绑、重置、审计快捷键或创建快捷键模板时使用，包括 tmux 风格、Vim 风格、终端优先、浏览器优先、iTerm/Terminal 风格或代理分诊布局。"
---

# cmux-keyboard-shortcuts

把用户的工作流偏好变成 `~/.config/cmux/cmux.json` 中的 cmux 快捷键绑定：先引导，提出紧凑的模板，应用所选的改动，并确认配置能以被识别的键正常解析。

## 贡献者规则：新增一个快捷键

每一个新的 cmux 自有键盘快捷键都必须加入 `Sources/KeyboardShortcutSettings.swift`，在 Settings > Keyboard Shortcuts 中可见且可编辑，在 `~/.config/cmux/cmux.json` 中支持 `shortcuts.bindings.<actionId>`，并在 `web/app/[locale]/(landing)/docs/keyboard-shortcuts/page.tsx` 与配置文档中记录。四者缺一不可，不能只做一部分。

## 前置条件

- 尽可能在 cmux 检出目录或 worktree 根目录下工作。
- 每次读/写都使用 `skills/cmux-settings/scripts/cmux-settings`。它会读取 JSONC、以原子方式写入，并校验 JSON 以及被识别的设置键。
- Action ID：`skills/cmux-settings/references/shortcut-actions.md`。当前默认值：`web/data/cmux-shortcuts.ts` 或 `Sources/KeyboardShortcutSettings.swift`。

```bash
if [[ -z "${CMUX_SETTINGS:-}" ]]; then
  root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  for candidate in \
    "$root/skills/cmux-settings/scripts/cmux-settings" \
    "${CODEX_HOME:-$HOME/.codex}/skills/cmux-settings/scripts/cmux-settings" \
    "$HOME/.agents/skills/cmux-settings/scripts/cmux-settings"; do
    [[ -x "$candidate" ]] && CMUX_SETTINGS="$candidate" && break
  done
  [[ -n "${CMUX_SETTINGS:-}" ]] || {
    echo "cmux-settings helper not found; run from a cmux checkout or install cmux-settings" >&2
    exit 1
  }
fi
```

## 快捷键模型

- 设置路径：`shortcuts.bindings.<actionId>`。
- 单次按键：`"cmd+b"`。
- 组合键（chord）：`["ctrl+b","c"]`。第一次按键需要一个修饰键，除非该键是 Space。第二次按键可以是裸键。
- 解绑：显式解绑优先使用 `null`。`""`、`"none"`、`"clear"`、`"unbound"` 与 `"disabled"` 都是可接受的别名，但 `null` 是最清晰的 JSON 值，也与下面的模板一致。
- `selectSurfaceByNumber` 与 `selectWorkspaceByNumber` 必须使用 1 到 9 的数字。`cmd+1` 表示完整的 `cmd+1` 到 `cmd+9` 这一族。
- `showHideAllWindows` 是唯一的系统级快捷键。它不能是组合键、需要修饰键，并且如果被系统占用，macOS 可能会拒绝它。
- `globalSearch` 是应用级的，仅在 cmux 处于活动状态时触发。
- `showHideAllWindows` 还要求开启 Settings > Global Hotkey > Enable System-Wide Hotkey。在该功能关闭时，绑定仍可能在 `cmux.json` 中通过校验，因此要提醒用户先启用该设置，再宣称该快捷键可用。
- `unset` 只会删除 `cmux.json` 中的覆盖项。它不会清除通过 Settings UI/UserDefaults 保存的快捷键改动。如果用户想要真正的内置默认值，请告诉他们在清除由文件管理的覆盖项之后使用 Settings > Keyboard Shortcuts > Reset Default Shortcuts，然后在应用中核实。对于 `showHideAllWindows`，请使用 Settings > Global Hotkey 把快捷键恢复为 `ctrl+opt+cmd+.`，因为 Keyboard Shortcuts > Reset Default Shortcuts 会有意跳过这个全局热键。
- 保存 `cmux.json` 会实时重载。绝不要让用户重启 cmux。

## 工作流程

1. 对请求分类：
   - **一次性重新绑定/解绑：** 把说法映射到一个 action ID，应用、校验，并报告原绑定与新绑定。
   - **审计：** 检查绑定、校验，在不写入的前提下汇总覆盖项与已解绑的快捷键。
   - **重置：** 区分由文件管理的覆盖项与真正的内置默认值（见上面的 `unset` 规则）。
   - **广泛自定义：** 提出下面 3-5 个模板，让用户选择。
   - **具名风格**（tmux、Vim、iTerm、浏览器、代理分诊）：挑最接近的模板，展示会被改动的动作与可能冲突的地方，并且在批量应用前先询问，除非用户已经点名了该模板。
2. 检查现有配置：

   ```bash
   "$CMUX_SETTINGS" path
   "$CMUX_SETTINGS" get shortcuts.bindings 2>/dev/null || printf '{}\n'
   "$CMUX_SETTINGS" validate
   ```

3. 为每个将要改动的动作快照其原值。原本不存在的路径用 `unset` 还原；已有自定义值的路径用 `set <same-json-value>` 还原。

   ```bash
   "$CMUX_SETTINGS" get shortcuts.bindings.focusLeft 2>/dev/null || printf '<absent>\n'
   ```

4. 只应用选定的动作路径，然后执行 `"$CMUX_SETTINGS" validate`。

   ```bash
   "$CMUX_SETTINGS" set shortcuts.bindings.newSurface '["ctrl+b","c"]'
   "$CMUX_SETTINGS" set shortcuts.bindings.focusLeft cmd+opt+h
   "$CMUX_SETTINGS" set shortcuts.bindings.sendFeedback null
   ```

5. 读回每个被改动的动作：`"$CMUX_SETTINGS" get shortcuts.bindings.newSurface`。
6. 最后给出模板名称、被改动的动作，以及来自快照的精确还原命令。

## 预设模板

逐个动作地应用，绝不要覆盖整个 `shortcuts.bindings` 对象。

### Tmux 前缀

一个终端风格的命名空间；`ctrl+b` 会开启一个 cmux 组合键，而不是发送给 shell。

```bash
"$CMUX_SETTINGS" set shortcuts.bindings.newSurface '["ctrl+b","c"]'
"$CMUX_SETTINGS" set shortcuts.bindings.closeTab '["ctrl+b","x"]'
"$CMUX_SETTINGS" set shortcuts.bindings.nextSurface '["ctrl+b","n"]'
"$CMUX_SETTINGS" set shortcuts.bindings.prevSurface '["ctrl+b","p"]'
"$CMUX_SETTINGS" set shortcuts.bindings.selectSurfaceByNumber '["ctrl+b","1"]'
"$CMUX_SETTINGS" set shortcuts.bindings.splitRight '["ctrl+b","v"]'
"$CMUX_SETTINGS" set shortcuts.bindings.splitDown '["ctrl+b","s"]'
"$CMUX_SETTINGS" set shortcuts.bindings.focusLeft '["ctrl+b","h"]'
"$CMUX_SETTINGS" set shortcuts.bindings.focusDown '["ctrl+b","j"]'
"$CMUX_SETTINGS" set shortcuts.bindings.focusUp '["ctrl+b","k"]'
"$CMUX_SETTINGS" set shortcuts.bindings.focusRight '["ctrl+b","l"]'
"$CMUX_SETTINGS" set shortcuts.bindings.toggleSplitZoom '["ctrl+b","z"]'
"$CMUX_SETTINGS" set shortcuts.bindings.toggleTerminalCopyMode '["ctrl+b","["]'
"$CMUX_SETTINGS" set shortcuts.bindings.equalizeSplits '["ctrl+b","="]'
```

### 恢复 macOS Terminal/iTerm 风格

这些动作已经与 cmux 的内置默认值一致，所以应清除文件中的覆盖项，而不是写入默认值。

```bash
for a in newSurface closeTab nextSurface prevSurface selectSurfaceByNumber \
         splitRight splitDown toggleSplitZoom toggleTerminalCopyMode renameTab; do
  "$CMUX_SETTINGS" unset "shortcuts.bindings.$a"
done
```

### Vim 面板导航

无需前缀、不使用方向键的面板移动。

```bash
"$CMUX_SETTINGS" set shortcuts.bindings.focusLeft cmd+opt+h
"$CMUX_SETTINGS" set shortcuts.bindings.focusDown cmd+opt+j
"$CMUX_SETTINGS" set shortcuts.bindings.focusUp cmd+opt+k
"$CMUX_SETTINGS" set shortcuts.bindings.focusRight cmd+opt+l
"$CMUX_SETTINGS" set shortcuts.bindings.splitRight cmd+opt+v
"$CMUX_SETTINGS" set shortcuts.bindings.splitDown cmd+opt+s
"$CMUX_SETTINGS" set shortcuts.bindings.toggleSplitZoom cmd+opt+z
"$CMUX_SETTINGS" set shortcuts.bindings.equalizeSplits cmd+opt+=
```

### 代理分诊

用一组键处理未读。`toggleUnread` 保持在 `cmd+opt+u`，这样它就能与 Vim 面板导航组合使用，而不会与 `cmd+opt+j` 冲突。

```bash
"$CMUX_SETTINGS" set shortcuts.bindings.showNotifications cmd+u
"$CMUX_SETTINGS" set shortcuts.bindings.jumpToUnread cmd+j
"$CMUX_SETTINGS" set shortcuts.bindings.markOldestUnreadAndJumpNext cmd+shift+j
"$CMUX_SETTINGS" set shortcuts.bindings.toggleUnread cmd+opt+u
"$CMUX_SETTINGS" set shortcuts.bindings.triggerFlash cmd+shift+h
"$CMUX_SETTINGS" set shortcuts.bindings.focusRightSidebar cmd+shift+e
```

### 工作区与界面通道

让工作区与界面分别落在不同的数字通道与方括号通道上。

```bash
"$CMUX_SETTINGS" set shortcuts.bindings.selectWorkspaceByNumber cmd+1
"$CMUX_SETTINGS" set shortcuts.bindings.selectSurfaceByNumber cmd+opt+1
"$CMUX_SETTINGS" set shortcuts.bindings.nextSidebarTab 'cmd+opt+]'
"$CMUX_SETTINGS" set shortcuts.bindings.prevSidebarTab 'cmd+opt+['
"$CMUX_SETTINGS" set shortcuts.bindings.nextSurface 'cmd+shift+]'
"$CMUX_SETTINGS" set shortcuts.bindings.prevSurface 'cmd+shift+['
```

### 恢复浏览器默认值

把内嵌浏览器行为恢复为 macOS 浏览器常用的快捷键。`unset` 能让未来的 cmux 默认值继续生效。

```bash
for a in openBrowser focusBrowserAddressBar browserBack browserForward browserReload \
         browserZoomIn browserZoomOut browserZoomReset toggleBrowserDeveloperTools \
         showBrowserJavaScriptConsole find findNext findPrevious; do
  "$CMUX_SETTINGS" unset "shortcuts.bindings.$a"
done
```

### 终端优先清理

更少的应用级快捷键。优先只解绑用户点名的动作；这只是一个起步方案。

```bash
for a in renameTab renameWorkspace editWorkspaceDescription triggerFlash sendFeedback; do
  "$CMUX_SETTINGS" set "shortcuts.bindings.$a" null
done
```

## 规则

- 除非用户明确要求，否则不要编辑 `~/.config/cmux/settings.json`；它是旧版的回退配置。
- 除非用户想要整体替换，否则不要覆盖整个 `shortcuts.bindings`。
- 不要杜撰 action ID。请对照 schema 或 `shortcut-actions.md` 校验。
- 除非用户点名了某个模板，否则不要在未先展示改动动作的情况下应用一个宽泛的模板。
- 不要承诺 `cmux-settings validate` 能检测冲突。它只校验 JSON 与受支持的键，不校验快捷键语法、macOS 保留占用或焦点上下文冲突。
- 在把 `cmd+[` 或 `cmd+]` 分配给应用级动作之前，要提醒它们会与浏览器的后退/前进冲突，除非同时修改或解绑相应的浏览器动作。
- `unset` 只会清除某个动作由文件管理的覆盖项。除非 Settings UI/UserDefaults 中的值也被重置，否则不要把它称作内置默认值重置。
