---
name: cmux-settings
description: "在 ~/.config/cmux/cmux.json 中查看与编辑 cmux 设置。当用户想要更改 cmux 偏好（外观、侧边栏、通知、自动化、浏览器、快捷键）、按 JSON 路径设置某个值、校验该文件、用编辑器打开它，或查询 cmux 识别哪些键时使用。触发于 '/cmux-settings'、'修改 cmux 设置'、'在 cmux 中设置 <something>'、'cmux 配置'、'cmux.json' 或 '重新绑定 cmux 快捷键'。"
---

# cmux-settings

cmux 从 `~/.config/cmux/cmux.json`（JSONC）读取用户设置。文件监听器会在保存时应用更改，无需重启。旧版的 `~/.config/cmux/settings.json` 仅作为 `cmux.json` 中缺失键的回退被读取。

Schema：`https://raw.githubusercontent.com/manaflow-ai/cmux/main/web/data/cmux.schema.json`。权威的路径清单是 `Sources/CmuxSettingsJSONPathSupport.swift`；已安装的技能在 `references/all-keys.md` 中带有一份生成的副本。设置分区为 `app`、`terminal`、`notifications`、`sidebar`、`sidebarAppearance`、`workspaceColors`、`automation`、`browser`、`shortcuts`。非设置类分区（`actions`、`ui`、`commands`、`vault`、`rightSidebar`）共用同一个文件。

## 辅助脚本

每次读/写都使用随附的辅助脚本。它会剥离 JSONC 注释、以原子方式写入，并按 schema 校验键。

```bash
skills/cmux-settings/scripts/cmux-settings <subcommand>            # 来自 cmux 检出目录
~/.codex/skills/cmux-settings/scripts/cmux-settings <subcommand>   # 已安装的 Codex 技能
```

本文档的其余部分假定它已作为 `cmux-settings` 位于 `$PATH` 中；若在检出目录中，可执行 `export PATH="$PWD/skills/cmux-settings/scripts:$PATH"`。

| 命令 | 作用 |
|---|---|
| `cmux-settings path` | 打印配置路径。 |
| `cmux-settings dump` | 打印原始文件（保留注释）。 |
| `cmux-settings dump --no-comments` | 打印解析后的 JSON。 |
| `cmux-settings get <a.b.c>` | 打印点号 JSON 路径处的值。 |
| `cmux-settings set <a.b.c> <value>` | 设置值。`<value>` 会按 JSON 解析（`true`、`42`、`"text"`、`[…]`、`{…}`）；未加引号的普通单词会以字符串存储。 |
| `cmux-settings unset <a.b.c>` | 删除该键，回退到应用内默认值。 |
| `cmux-settings list-supported` | 列出应用识别的一切设置 JSON 路径。 |
| `cmux-settings validate` | 解析该文件并标记未知的设置键。 |
| `cmux-settings open` | 在 `$EDITOR`、VS Code、Cursor 或 TextEdit 中打开 `cmux.json`。 |

`--file <path>` 可覆盖目标文件，对 `--file ~/.config/cmux/settings.json` 很有用。

## 工作流程

1. 当用户用大白话提到某个设置时，先查该键：
   ```bash
   cmux-settings list-supported | rg -i 'sidebar.*terminal|terminal.*sidebar'
   ```
2. 设置它。JSON 字面量必须是合法的 JSON。
   ```bash
   cmux-settings set sidebarAppearance.matchTerminalBackground true
   cmux-settings set app.appearance dark
   cmux-settings set shortcuts.bindings.newTab '["ctrl+b","c"]'
   cmux-settings set browser.hostsToOpenInEmbeddedBrowser '["localhost","*.internal.example"]'
   ```
3. 读回并执行 `cmux-settings validate`。
4. 告知用户它已自动重载，并且 `cmux-settings unset <key>` 可将其还原。

## 快速参考

- 外观：`app.appearance`（`"system" | "light" | "dark"`）、`app.appIcon`、`app.menuBarOnly`、`app.minimalMode`。
- 侧边栏色调：`sidebarAppearance.matchTerminalBackground`、`.tintColor`、`.tintOpacity`（0..1）。
- 侧边栏详情：`sidebar.hideAllDetails`、`.showBranchDirectory`、`.showPullRequests`、`.showPorts`、`.showLog`。
- 通知：`notifications.dockBadge`、`.sound`（枚举包含 `"none"`、`"custom_file"`）、`.customSoundFilePath`、`.hooks`（数组）。
- 浏览器：`browser.defaultSearchEngine`、`.theme`、`.openTerminalLinksInCmuxBrowser`、`.hostsToOpenInEmbeddedBrowser`。
- 自动化：`automation.socketControlMode`（`off | cmuxOnly | automation | password | allowAll`）、`.portBase`、`.portRange`。
- 快捷键：`shortcuts.bindings.<actionId>` = `"cmd+b"`、`["ctrl+b","c"]`、`null`，或 `""` 表示解绑。action ID 见 [references/shortcut-actions.md](references/shortcut-actions.md)。

设置的完整清单、默认值与说明：`cmux-settings list-supported` 或 [references/all-keys.md](references/all-keys.md)。

## 规则

- 只编辑 `cmux.json`。除非用户明确要求，否则绝不要动 `settings.json`；它是旧版配置，仅当某个键在 `cmux.json` 中缺失时才被读取。
- 绝不要让用户重启 cmux。文件监听器会在保存时重载。
- 批量编辑之后始终执行 `cmux-settings validate`。出现未知键意味着用户粘贴了应用不消费的键。
- 不要盲目覆盖 `actions`、`ui`、`commands`、`vault` 或 `rightSidebar`；它们与该文件共用一份数据，并保存着手工调校的非设置类配置。
- 快捷键 action ID 必须与 schema 枚举一致。绑定之前先查清楚。
- 颜色为 `#RRGGBB`；不透明度为 `0..1`。
- 先把应用层面的说法（"Settings > Notifications > Dock badge"）映射为 JSON 路径；`web/app/[locale]/(landing)/docs/configuration/page.tsx` 与 schema 1:1 对应。
