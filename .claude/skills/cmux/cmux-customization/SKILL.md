---
name: cmux-customization
description: "为最终用户定制 cmux。在修改 cmux.json 的 actions、自定义命令、工作区布局、加号按钮行为、surface 标签栏按钮、命令面板条目、Dock 控件、侧边栏与应用设置、快捷键、通知、浏览器路由、示例库预设，或由 Ghostty 支撑的终端偏好时使用。"
---

# cmux 定制

保持用户配置原样不动，优先使用有 schema 支撑的编辑方式，并在报告完成之前先做校验。

## 选择正确的界面

| 想改什么 | 改哪里 |
|---|---|
| 应用偏好（外观、侧边栏、通知、浏览器路由、自动化、快捷键、新工作区放置方式） | 通过 `cmux-settings` 辅助工具改 `~/.config/cmux/cmux.json` |
| 自定义动作、工作区布局/命令、标签栏按钮、加号按钮行为、命令面板条目、通知钩子 | 全局改 `~/.config/cmux/cmux.json`，或项目内改 `.cmux/cmux.json` |
| Dock 控件（右侧边栏终端：日志、测试监视器、git TUI、开发服务器、队列、`cmux feed tui --opentui`） | `.cmux/dock.json` 或 `~/.config/cmux/dock.json`；可用时看 `cmux docs dock` |
| 终端渲染与终端按键绑定（字体、主题、光标样式、选中即复制、shell 集成） | Ghostty 配置，通常是 `~/.config/ghostty/config` |
| 工作区名称、描述、颜色、已读状态、侧边栏元数据 | cmux CLI，参见 [../cmux-workspace/SKILL.md](../cmux-workspace/SKILL.md) |
| Feed 事件来源 | `cmux hooks setup` |

项目本地的 `.cmux/cmux.json` 和 `.cmux/dock.json` 让 worktree、SSH、评审、开发、CI 和文档等模式随仓库一起走；项目级动作与命令会覆盖同 ID 或同名的全局条目。全局应用偏好不该放在那里。

如果某个请求可以用 Ghostty 配置解决，就说明这一点并使用 Ghostty 配置，而不要凭空发明 cmux UI 设置。

`cmux.json` 中的关键界面：`actions`（可复用，能出现在 Cmd+Shift+P、surface 标签栏、快捷键以及加号按钮右键菜单中）、`ui.newWorkspace.action`（替换加号按钮的点击行为）和 `ui.newWorkspace.contextMenu`（右键菜单；`ui.newWorkspace.rightClick` 是可接受的别名，但新示例一律用 `contextMenu`）、`ui.surfaceTabBar.buttons`（替换默认标签栏按钮；只有在内置按钮应当保持可见时才把它们加进去，例如 `cmux.newTerminal`、`cmux.newBrowser`、`cmux.splitRight`、`cmux.splitDown`），以及 `commands`（带分屏布局的工作区定义）。

## 工作流

1. 检查现有配置。

   ```bash
   test -f ~/.config/cmux/cmux.json && sed -n '1,220p' ~/.config/cmux/cmux.json
   test -f .cmux/cmux.json && sed -n '1,220p' .cmux/cmux.json
   ```

2. 选择全局还是项目本地范围。仓库专属命令默认放项目本地，应用偏好默认放全局。只有当这个选择会实质性改变行为时才询问用户。
3. 目标文件已存在时先备份（仅针对适用的路径，文件不存在就不备份）。

   ```bash
   stamp="$(date +%Y%m%d-%H%M%S)"
   test -f ~/.config/cmux/cmux.json && cp -p ~/.config/cmux/cmux.json ~/.config/cmux/cmux.json."$stamp".bak
   test -f .cmux/cmux.json && cp -p .cmux/cmux.json .cmux/cmux.json."$stamp".bak
   ```

4. 对于应用设置和 cmux 自有的快捷键，使用设置辅助工具（若用户是用 `skills.sh` 安装的，则在 `~/.codex/skills/...` 下）。

   ```bash
   ~/.agents/skills/cmux-settings/scripts/cmux-settings list-supported
   ~/.agents/skills/cmux-settings/scripts/cmux-settings set browser.openTerminalLinksInCmuxBrowser true
   ~/.agents/skills/cmux-settings/scripts/cmux-settings validate
   ```

5. 对于动作、UI 接线、工作区布局、通知钩子和 Dock 控件，用手工编辑 JSONC，并保留无关的段落（`vault`、`rightSidebar`、`commands`、`actions`、`ui`、`notifications`）。
6. 执行 `cmux reload-config`。
7. 确认所配置的入口确实存在：回读快捷键绑定，或确认动作 ID 以及它应该出现在哪里。

## 示例：命令面板动作

除非 `palette` 为 false，否则它会出现在 Cmd+Shift+P 中。

```json
{
  "actions": {
    "codex-new-tab": {
      "type": "agent",
      "agent": "codex",
      "title": "Codex",
      "subtitle": "在此工作区中启动 Codex",
      "target": "newTabInCurrentPane",
      "palette": true
    }
  }
}
```

关于 worktree agent、全栈开发布局、SSH 开发机、PR 评审工作区、文档工作区、标签栏按钮和 CI 监视 Dock 控件，请阅读 [references/examples.md](references/examples.md)。当用户索要示例、预设、模板、起步配置或某种已知工作流形态时，加载它。

## 校验

- 应用设置：`cmux-settings validate`。
- 保持 JSONC 有效，不要有重复键。
- 在报告完成之前，用 JSON 解析器解析 `.cmux/dock.json` 或 `~/.config/cmux/dock.json`。
- CLI 可用时执行 `cmux reload-config`。
- 确认用户实际看到的结果：动作标题、快捷键、加号按钮行为、右键菜单条目或标签栏位置。

## 规则

- 除非整个顶层配置段落都归你负责，否则不要覆盖它。
- 不要把密钥存进动作、命令或 prompt 里。请使用环境变量或用户自己的密钥管理器。
- 不要在生成的命令里使用 sleep 或计时变通手段。
- 不要为 Ghostty 已经负责的行为再添加 cmux 设置。
- 标签要短到能放进菜单、按钮和命令面板。
