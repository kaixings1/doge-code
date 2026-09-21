---
description: 编辑现有的 insert。修改文本内容或管理 insert 层级条件。变更会应用到引用该 insert 的所有订阅。
---

# 编辑 Insert

**宣告：** "[skill-bus] Editing insert."

## 流程

### 第 1 步：范围选择

使用 AskUserQuestion 询问：
**"在哪个范围内编辑？"**
- **Global** - `~/.claude/skill-bus.json`
- **Project** - `.claude/skill-bus.json`

如果所选范围没有配置文件或没有 insert，显示："No inserts found in {scope} config. Run /skill-bus:add-sub to create inserts."

### 第 2 步：选择 Insert

显示所选范围内的 insert：

Set `SCOPE` to the user's choice from Step 1 (`global` or `project`), then run:

```bash
SB_CLI=$(ls ~/.claude/plugins/cache/*/skill-bus/*/lib/cli.py ~/.claude/plugins/repos/skill-bus/lib/cli.py 2>/dev/null | tail -1)
SCOPE="global"  # or "project" — set from Step 1
python3 "$SB_CLI" inserts --scope "$SCOPE" --cwd "$PWD"
```

显示输出（不含 "[Create new insert]" 那一行）。询问：**"要编辑哪个 insert？"**

**跨范围提示：** 如果用户选择了某个范围，但想要的 insert 在另一个范围，告知他们："This insert is defined in {other scope} scope. Switch to that scope to edit it."

### 第 3 步：选择要编辑什么

使用 AskUserQuestion 询问：
**"你想编辑什么？"**
- **Text** - 修改 insert 的文本内容
- **Conditions** - 添加、移除或修改 insert 层级条件
- **Both** - 同时编辑文本和条件

### 第 4a 步：编辑文本（如果选择）

显示所选 insert 的完整当前文本。

询问：**"新的文本应该是什么？"**

### 第 4b 步：编辑条件（如果选择）

显示当前的 insert 层级条件：

有条件时：
```
Current conditions on 'compound-knowledge':
  1. fileExists("docs/")

These conditions apply to ALL subscriptions using this insert
(unless a subscription opts out with "inheritConditions": false).
```

无条件时：
```
No conditions on 'compound-knowledge'.
Insert-level conditions apply to ALL subscriptions using this insert.
```

使用 AskUserQuestion 呈现选项：
**"要做什么条件变更？"**
- **Add condition** - 为此 insert 添加一个新条件
- **Remove condition** - 移除一个现有条件（仅当有条件时）
- **Replace all** - 清空并设置新条件
- **Clear all** - 移除此 insert 的所有条件

**如果选择 "Add condition"：** 使用与 add-sub 第 4 步相同的条件选择流程（呈现 5+1 种类型、获取值、提供 NOT 包裹、循环添加更多）。

**如果选择 "Remove condition"：** 显示编号列表，询问要移除哪一个。

**如果选择 "Replace all"：** 清空现有条件，然后使用添加条件流程。

**If "Clear all":** 将条件设为 undefined（从 insert 对象中移除该键）。

### 第 5 步：保存并确认

在配置文件中更新 insert。显示受影响的订阅（**两个**范围都扫描以查找引用）：

```
Updated insert 'compound-knowledge'.
  Text: [changed / unchanged]
  Conditions: fileExists("docs/") (1 condition)
Affects subscriptions:
  → superpowers:writing-plans [pre] (project) — effective: fileExists("docs/") AND gitBranch("feature/*")
  → superpowers:brainstorming [pre] (global) — effective: fileExists("docs/")
```

当订阅退出且没有自己的条件时：
```
  → superpowers:code-review [pre] (project) — effective: (no conditions — opts out with inheritConditions: false)
```

当订阅退出但有自己的条件时：
```
  → superpowers:code-review [pre] (project) — effective: gitBranch("feature/*") (subscription-level only — opts out of insert conditions)
```

当没有订阅引用此 insert 时：
```
Affects subscriptions: (none — this insert is not referenced by any subscription)
```
