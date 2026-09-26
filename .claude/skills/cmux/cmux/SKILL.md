---
name: cmux
description: 用户对 cmux 拓扑与路由的控制（窗口、工作区、面板/界面、焦点、移动、重排、识别、触发闪烁）。当自动化需要在多面板 cmux 布局中做确定性的放置与导航时使用。
---

# cmux 核心控制

非浏览器场景下的 cmux 拓扑与路由。

- **Window**：顶层的 macOS cmux 窗口。
- **Workspace**：窗口内类似标签页的分组。
- **Pane**：工作区中的分屏容器。
- **Surface**：面板内的标签页（终端或浏览器面板）。

## 快速上手

```bash
cmux identify --json                              # 当前调用方上下文
cmux list-windows / list-workspaces / list-panes
cmux list-pane-surfaces --pane pane:1
cmux new-workspace
cmux new-split right --panel pane:1
cmux move-surface --surface surface:7 --pane pane:2 --focus true
cmux split-off --surface surface:7 right
cmux reorder-surface --surface surface:7 --before surface:3

# 工作区上下文菜单动作（颜色、描述、重命名、置顶……）
cmux workspace-action --action set-color --color Blue
cmux workspace-action --action set-description --description "Ship checklist"

# 吸引注意的提示
cmux trigger-flash --surface surface:7
```

## 句柄模型

默认输出短引用（`window:N`、`workspace:N`、`pane:N`、`surface:N`）。输入接受 UUID；仅在需要时用 `--id-format uuids|both` 请求 UUID 输出。

## 设置

cmux 自有的设置位于 `~/.config/cmux/cmux.json`。`cmux docs settings` 会打印文档 URL、schema URL、GitHub 原始资源、cmux.json 路径与重载命令。`cmux settings`、`cmux settings cmux-json` 和 `cmux settings shortcuts` 会打开界面。

`cmux reload-config` 会同时重载 `cmux.json` 与 `~/.config/ghostty/config`，就地刷新终端而无需重启应用。

终端渲染（字体、光标样式、主题、回滚缓冲、`background-opacity`、`background-blur`）属于 Ghostty 配置，而非 cmux 设置。其它一切（应用行为、侧边栏、通知、浏览器行为、自动化、工作区配色、cmux 自有快捷键）都是 cmux 设置。编辑之前，把任何现存的 `cmux.json` 复制为旁边带时间戳的 `.bak`。旧版的 `~/.config/cmux/settings.json` 与 `~/Library/Application Support/com.cmuxterm.app/settings.json` 仅作为缺失键的回退被读取。

## 深入参考

| 参考 | 何时使用 |
|-----------|-------------|
| [references/handles-and-identify.md](references/handles-and-identify.md) | 句柄语法、自我识别、调用方定向 |
| [references/windows-workspaces.md](references/windows-workspaces.md) | 窗口/工作区生命周期、重排/移动，以及上下文菜单动作（颜色、描述、重命名） |
| [references/panes-surfaces.md](references/panes-surfaces.md) | 分屏、界面、移动/重排、焦点路由 |
| [references/trigger-flash-and-health.md](references/trigger-flash-and-health.md) | 闪烁提示与界面健康检查 |
| [../cmux-workspace/SKILL.md](../cmux-workspace/SKILL.md) | 当前调用方工作区规则与非打扰式自动化 |
| [../cmux-settings/SKILL.md](../cmux-settings/SKILL.md) | 安全的 cmux.json 设置编辑与校验 |
| [../cmux-browser/SKILL.md](../cmux-browser/SKILL.md) | 基于 surface 的 webview 上的浏览器自动化 |
| [../cmux-markdown/SKILL.md](../cmux-markdown/SKILL.md) | 带实时文件监听的 Markdown 预览面板 |
