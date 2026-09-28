---
description: 跟踪 Claude Code 设置报告变化，发现需要更新的内容
argument-hint: [number of versions to check, default 10]
---

# 工作流更新日志 — 设置报告

你是 claude-code-best-practice 项目的协调者。你的任务是并行启动两个研究 agent，等待它们的结果，合并发现，并产出一份关于 **Settings Reference** 报告（`best-practice/claude-settings.md`）漂移情况的统一报告。

**要检查的版本数：** `$ARGUMENTS`（若为空或非数字则默认 10）

这是一个**先读取后报告**的工作流。启动 agent、合并结果、产出报告。只有在用户批准后才采取行动。

---

## 阶段 0：并行启动两个 Agent

**立即**用 Task 工具**在同一条消息中**派生两个 agent（并行启动）：

### Agent 1: workflow-claude-settings-agent

使用 `subagent_type: "workflow-claude-settings-agent"` 派生。给它以下提示词：

> 研究 claude-code-best-practice 项目的设置报告漂移情况。检查最近 $ARGUMENTS 个版本（默认 10）。
>
> Fetch these 3 external sources:
> 1. Settings Documentation: https://code.claude.com/docs/en/settings
> 2. CLI Reference: https://code.claude.com/docs/en/cli-reference
> 3. Changelog: https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md
>
> 然后读取本地报告文件（`best-practice/claude-settings.md`）和 CLAUDE.md 文件。分析官方文档关于设置键、权限语法、hook 事件、MCP 配置、沙箱选项、插件设置、模型别名、显示设置和环境变量的说明，与我们报告中所记录的差异。返回一份结构化的发现报告，涵盖缺失的设置、变更的类型/默认值、新增设置、已废弃设置、权限语法变化、hook 事件变化、MCP 设置变化、沙箱设置变化、环境变量完整性、示例准确性、设置层级准确性以及来源有效性。

### Agent 2: claude-code-guide

使用 `subagent_type: "claude-code-guide"` 派生。给它以下提示词：

> 研究最新的 Claude Code 设置系统。我需要你找出：
> 1. The complete list of all currently supported settings.json keys with their types, defaults, and descriptions
> 2. Any new settings keys introduced in recent Claude Code versions
> 3. Changes to existing settings behavior (e.g. new permission modes, new hook events, new sandbox options)
> 4. Changes to the settings hierarchy (new priority levels, new file locations)
> 5. Changes to permission syntax (new tool patterns, new wildcard behavior)
> 6. New hook events or changes to hook configuration structure
> 7. Changes to MCP server configuration (new matching fields, new settings)
> 8. Changes to sandbox settings (new network options, new commands)
> 9. Changes to plugin configuration (new fields, new marketplace options)
> 10. Changes to environment variables (new vars, deprecated vars, changed behavior)
> 11. Changes to model aliases or model configuration
> 12. Changes to display/UX settings (status line, spinners, progress bars)
> 13. Any deprecations or removals of settings keys
>
> 要详尽 —— 搜索网页、抓取文档，并为你找到的一切提供具体的版本号与细节。

两个 agent 独立运行，并会返回各自的发现。

---

## 阶段 0.5：读取验证清单

**在 agent 运行期间**，读取 `changelog/best-practice/claude-settings/verification-checklist.md`。该文件包含累积的验证规则 —— 每条规则指明要检查什么、以何种深度、对照哪个来源。每条规则**必须**在阶段 2 中执行。该清单是本项目的漂移检测回归测试套件。

---

## 阶段 1：读取既往更新日志条目

**在合并发现之前**，读取文件 `changelog/best-practice/claude-settings/changelog.md` 以获取最近 25 条更新日志条目。每条条目以 `---` 分隔。解析这些既往条目中的优先行动项，以便与当前发现做对比。这让你能识别出：
- **反复出现项** —— 之前出现过且仍未解决的问题
- **新近解决项** —— 之前运行中的问题现已被修复
- **新增项** —— 本次运行中首次出现的问题

---

## 阶段 2：合并发现并生成报告

**等待两个 agent 完成。** 当你获得：
- **workflow-claude-settings-agent 的发现** —— 结合本地文件读取、外部文档抓取和漂移检测的详细报告分析
- **claude-code-guide 的发现** —— 关于最新 Claude Code 设置功能与变化的独立研究

交叉比对两者。专用 agent 提供针对报告的漂移分析，而 claude-code-guide agent 可能补充它遗漏的内容（例如非常近期的变更、未文档化的特性，或来自网络搜索的上下文）。把两者之间的任何矛盾标记出来，交由用户裁定。

**执行验证清单：** 对 `changelog/best-practice/claude-settings/verification-checklist.md` 中的每条规则，以 agent 发现作为源数据，按指定深度执行检查。在报告中包含一个**验证日志**小节，展示每条规则的结果：

```
Verification Log:
Rule # | Category              | Depth         | Result | Notes
1      | Settings Keys         | field-level   | PASS   | All keys match
2      | Permission Syntax     | content-match | FAIL   | New tool pattern added
...
```

**按需更新清单：** 若某项发现揭示了一种新的漂移类型，而现有清单规则都未覆盖（或覆盖深度不足），则向 `changelog/best-practice/claude-settings/verification-checklist.md` 追加一条新规则。该规则必须包含：类别、检查内容、深度级别、对照来源、添加日期以及来源（是哪次错误促成了这条规则）。不要为不会复现的一次性问题添加规则。

同时把当前发现与既往更新日志条目（来自阶段 1）做对比。对每个优先行动项标注为：
- `NEW` —— 该问题首次出现
- `RECURRING` —— 之前运行中出现过且仍未解决（注明首次出现的运行日期）
- `RESOLVED` —— 之前运行中出现过但现已被修复（注明解决日期）

产出包含以下小节的结构化报告：

1. **新增设置键** —— 官方文档中有但报告中缺失的键，并注明引入版本
2. **设置行为变更** —— 类型、默认值或描述发生变化的设置
3. **已废弃/移除的设置** —— 报告中有但官方文档中已不再存在的设置
4. **权限语法变化** —— 新的工具匹配模式、通配符行为或权限模式变更
5. **MCP 设置变化** —— 新的 MCP 配置键、匹配行为或服务器设置
6. **沙箱设置变化** —— 新的沙箱选项、网络设置或命令排除项
7. **插件设置变化** —— 新的插件配置键或 marketplace 选项
8. **模型配置变化** —— 新的模型别名、effort 级别或模型环境变量
9. **显示与 UX 变化** —— 新的状态栏字段、spinner 选项或显示设置
10. **环境变量完整性** —— 官方文档中有但报告缺失的变量，或报告中已不再被文档记载的变量
11. **设置层级准确性** —— 校验优先级、文件位置和覆盖行为
12. **示例准确性** —— Quick Reference 完整示例是否反映了当前设置
13. **来源准确性** —— 校验所有来源链接有效且指向正确的文档
14. **claude-code-guide Agent 发现** —— 该 agent 独有、未被专用 agent 捕获的洞察。只纳入带来新信息的发现。若两个 agent 之间存在矛盾，标记出来交由用户裁定。不要罗列「一致确认」的内容。

> **注意：** 与 Hook 相关的分析（事件、属性、matcher、退出码、HTTP hooks、hook 环境变量）**不在**本工作流范围内。Hooks 由 [claude-code-hooks](https://github.com/shanraisshan/claude-code-hooks) 仓库维护。

以一份带优先级的**行动项**汇总表收尾。每项必须包含 `Status` 列，取值为 `NEW`、`RECURRING (first seen: <date>)` 或 `RESOLVED`：

```
Priority Actions:
#  | Type                  | Action                                    | Status
1  | New Setting           | Add <key> to <section> table               | NEW
2  | Changed Behavior      | Update <key> description                   | NEW
3  | Deprecated Setting    | Remove <key> from table                    | RECURRING (first seen: 2026-03-05)
4  | Permission Syntax     | Add new tool pattern syntax                | NEW
5  | Env Variable          | Add <var> to environment variables table   | NEW
7  | Example Update        | Update Quick Reference example             | NEW
```

同时包含一个**自上次运行以来已解决**小节，列出上次运行中已不再是问题的项。

---

## 阶段 2.5：向更新日志追加摘要

**该阶段为强制项 —— 在向用户呈现报告之前务必执行。**

读取现有的 `changelog/best-practice/claude-settings/changelog.md` 文件，然后在末尾**追加**（不要覆盖）一条新条目。条目格式必须严格如下：

```markdown
---

## [<YYYY-MM-DD HH:MM AM/PM PKT>] Claude Code v<VERSION>

| # | Priority | Type | Action | Status |
|---|----------|------|--------|--------|
| 1 | HIGH/MED/LOW | <type> | <action description> | <status> |
| ... | ... | ... | ... | ... |
```

**状态格式 —— 必须使用以下三种之一：**
- `COMPLETE (reason)` —— 已采取行动并成功解决
- `INVALID (reason)` —— 发现有误、不适用或属有意设计
- `ON HOLD (reason)` —— 行动已推迟，等待外部依赖或用户决策

`(reason)` 为必填，必须简要说明做了什么或为什么。

**追加规则：**
- 始终追加 —— 绝不覆盖或替换既往条目
- The date and time is when the command is executed in Pakistan Standard Time (PKT, UTC+5); get it by running `TZ=Asia/Karachi date "+%Y-%m-%d %I:%M %p PKT"`. The version comes from agent findings
- If `changelog/best-practice/claude-settings/changelog.md` doesn't exist or is empty, create it with the Status Legend table (see top of file) then the first entry
- Each entry is separated by `---`
- **Only include items with HIGH, MEDIUM, or LOW priority** — omit NONE priority items (things that need no action)

---

## 阶段 2.6：更新「最后更新」徽章

**该阶段为强制项 —— 务必在阶段 2.5 之后、呈现报告之前立即执行。**

更新 `best-practice/claude-settings.md` 顶部的 Last Updated 徽章。 Run `TZ=Asia/Karachi date "+%b %d, %Y %-I:%M %p PKT"` to get the time, URL-encode it (spaces to `%20`, commas to `%2C`), and replace the date portion in the badge. Also update the Claude Code version in the badge if it has changed.

**不要把徽章更新记录为更新日志或报告中的行动项。** 徽章同步是每次运行的例行部分，不属于发现。

---

## 阶段 2.7：校验所有超链接

**该阶段为强制项 —— 务必在阶段 2.6 之后、呈现报告之前执行。**

扫描 `best-practice/claude-settings.md` 中的每一个超链接（包括 markdown 的 `[text](url)` 和内联 URL）。对每个链接：

1. **本地文件链接**（相对路径）：用 Read 工具校验该路径下文件是否存在。标记任何失效链接。
2. **外部 URL**（例如 `https://code.claude.com/docs/en/settings`）：用 WebFetch 抓取每个 URL，校验其返回有效页面（不是 404 或跳转到错误页）。标记任何失效或已迁移的链接。
3. **锚点链接**（例如 `#section-name`）：校验目标标题在同一文件中存在。

在报告中包含一份**超链接校验日志**：

```
Hyperlink Validation Log:
#  | Type     | Link                                          | Status | Notes
1  | Local    | ../                                            | OK     |
2  | External | https://code.claude.com/docs/en/settings       | OK     |
3  | External | https://www.schemastore.org/claude-code-settings.json | BROKEN | 404
...
```

**若有任何链接失效**，把它们作为 HIGH 优先级行动项加入报告。失效链接会削弱报告的实用性，必须先于其他任何改动修复。

---

## 阶段 3：提议采取行动

呈现报告后（并确认更新日志与徽章均已更新），询问用户：

1. **执行全部行动** —— 处理所有事项（补充缺失设置、更新描述、修复示例）
2. **执行指定行动** —— 由用户选择要执行的编号
3. **只保存报告** —— 不做任何改动

执行时：
- **New settings**: Add to the appropriate section table with correct type, default, and description
- **Changed behavior**: Update the setting description or default in the table
- **Deprecated settings**: Confirm with user before removing
- **Permission syntax changes**: Update the Permission Syntax table with new patterns
- **MCP setting changes**: Update the MCP Settings section
- **Sandbox setting changes**: Update the Sandbox Settings section
- **Plugin setting changes**: Update the Plugin Settings section
- **Model changes**: Update the Model Configuration section
- **Display changes**: Update the Display & UX section
- **Environment variable changes**: Add/update/remove vars in the Environment Variables section
- **Settings hierarchy changes**: Update the Settings Hierarchy table
- **Example updates**: Update the Quick Reference complete example to reflect current settings
- **Broken links**: Fix or replace broken URLs
- After all actions, re-run verification to confirm consistency

---

## 关键规则

1. **在一条消息中并行启动两个 agent** —— 绝不串行
2. **生成报告前等待两个 agent**
3. **绝不猜测**版本或日期 —— 使用 agent 提供的数据
4. **新增设置键为最高优先级** —— 它们需要同步更新表格和示例
5. **交叉核对设置数量** —— 每个表格中的设置数量必须与官方文档一致
6. **不要自动执行** —— 始终先呈现报告
7. **ALWAYS append to changelog** — Phase 2.5 is mandatory. Never skip it. Never overwrite previous entries.
8. **Compare with previous runs** — read the last 25 entries from the changelog and mark each action item as NEW, RECURRING, or RESOLVED.
9. **ALWAYS execute the verification checklist** — read the verification-checklist.md and execute every rule. Include a Verification Log in the report. Append new rules when a new type of drift is discovered.
10. **Checklist rules are append-only** — never remove or weaken existing rules. Only add new rules or upgrade depth levels.
11. **ALWAYS update the Last Updated badge** — Phase 2.6 is mandatory. Never skip it.
12. **ALWAYS validate all hyperlinks** — Phase 2.7 is mandatory. Never skip it. Broken links are HIGH priority.
13. **Environment variables are split across two files** — `claude-settings.md` owns `env`-configurable vars; `claude-cli-startup-flags.md` owns startup-only vars. Do NOT flag env vars as missing if they belong in the CLI file. Cross-reference `best-practice/claude-cli-startup-flags.md` to verify ownership boundaries.
14. **Verify the settings hierarchy** — the 5-level override chain plus managed policy layer must match official docs exactly.
