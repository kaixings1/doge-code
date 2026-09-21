---
description: 订阅技能事件。添加一个订阅，在技能运行前或运行后注入上下文。支持在 insert 层级（被继承）和订阅层级（AND 叠加）配置可选条件。
---

# 订阅技能事件

**宣告：** "[skill-bus] Adding subscription."

## 流程

### 第 1 步：范围选择

使用 AskUserQuestion 询问用户：

**"这个订阅使用什么范围？"**
- **Global** - 应用于所有项目。保存到 `~/.claude/skill-bus.json`
- **Project** - 仅此仓库。保存到 `.claude/skill-bus.json`

### 第 2 步：技能选择

运行技能发现脚本以显示可用技能：

```bash
SB_CLI=$(ls ~/.claude/plugins/cache/*/skill-bus/*/lib/cli.py ~/.claude/plugins/repos/skill-bus/lib/cli.py 2>/dev/null | tail -1)
python3 "$SB_CLI" skills --cwd "$PWD"
```

向用户显示输出，然后询问：**"要订阅哪个（些）技能？"**

如果用户输入 `*` 通配符模式，警告他们：
> "通配符订阅会匹配大量技能，并在每次匹配时增加上下文 token。你确定吗？"

### 第 3 步：触发时机选择

使用 AskUserQuestion 询问：
**"这应该在何时触发？"**
- **Pre** - 在技能加载之前。用于：添加上下文、引用文件、设置状态。
- **Post** - 在技能工具返回之后。用于：补充技能输出。
- **Complete** *（实验性）* - 在 Claude 完成技能的完整工作范围之后。用于：触发后续技能、捕获输出、串联工作流。自动注入 "you MUST run /skill-bus:complete" 指令。需要在设置中配置 `"completionHooks": true`。

### 第 4 步：Insert 选择

显示所选范围的现有 insert：

将 `SCOPE` 设为用户在第 1 步的选择（`global` 或 `project`），然后运行：

```bash
SB_CLI=$(ls ~/.claude/plugins/cache/*/skill-bus/*/lib/cli.py ~/.claude/plugins/repos/skill-bus/lib/cli.py 2>/dev/null | tail -1)
SCOPE="global"  # or "project" — set from Step 1
python3 "$SB_CLI" inserts --scope "$SCOPE" --cwd "$PWD"
```

显示输出。

询问：**"要附加哪个 insert？"**

**如果选择 "Create new"：**
1. 询问 insert 名称（slug 格式，例如 `deploy-guard`）
2. **名称存在性检查：** 如果目标范围内已存在同名 insert，则拒绝："Insert '{name}' already exists. Use the existing one, or choose a different name." 并提议改为链接到现有 insert。
3. 询问 insert 文本（要注入的上下文）
4. 检查文本长度 —— 如果 >200 字符（约 50 token），警告：
   > "这个 insert 相当长（约 N token）。继续吗？"
5. 将 insert 保存到目标配置的 `inserts` 对象中

**如果选择现有 insert：**
继续到第 5 步。

### 第 5 步：条件（可选）

**检查所选 insert 是否有 insert 层级条件。** 如果有，显示：

```
Insert 'compound-knowledge' has insert-level conditions:
  - fileExists("docs/")

These are inherited by this subscription (AND-stacked with any subscription conditions you add).
To opt out of inherited conditions, choose "Opt out" below.
```

使用 AskUserQuestion 询问：
**"添加订阅层级条件吗？"**
- **No extra conditions** - 仅应用 insert 层级条件（若 insert 无条件则没有）
- **Add conditions** - 添加订阅专属条件（与 insert 条件 AND 叠加）
- **Opt out of insert conditions** - 此订阅忽略 insert 层级条件。设置 `"inheritConditions": false`。

如果 insert 没有条件，简化为：
**"添加条件吗？（订阅仅在所有条件都通过时才触发）"**
- **No conditions** - 技能匹配时始终触发
- **Add conditions** - 仅在运行时条件满足时触发

**如果选择 "Add conditions"：**

呈现可用的条件类型：

```
Condition types:

  1. fileExists    — File or directory exists (relative to project root)
                     Example: "docs/plans/"
  2. gitBranch     — Current branch matches pattern
                     Example: "feature/*"
  3. envSet        — Environment variable is set and non-empty
                     Example: "CI"
  4. envEquals     — Environment variable equals a specific value
                     Example: NODE_ENV = "development"
  5. fileContains  — File contains a string (or regex with "regex": true)
                     Example (literal): package.json contains "prisma"
                     Example (regex): package.json matches "prisma.*\d+\.\d+"
```

询问：**"哪种条件类型？"**

然后根据类型询问值：
- `fileExists`：**"应该存在什么路径？"**（相对于项目根目录）
- `gitBranch`：**"什么分支模式？"**（支持 `feature/*`、`fix/*` 之类的 glob）
- `envSet`：**"哪个环境变量？"**
- `envEquals`：**"哪个变量？"** 然后 **"什么值？"**
- `fileContains`：**"哪个文件？"** 然后 **"搜索什么模式？"** 然后 **"使用正则匹配吗？"**（yes/no，默认：no）

每个条件之后，使用 AskUserQuestion 询问：
**"添加另一个条件吗？（AND 逻辑 —— 全部必须通过）"**
- **Done** - 不再添加条件
- **Add another** - 再添加一个条件
- **Wrap in NOT** - 对最后添加的条件取反

**如果选择 "Wrap in NOT"：** 把最近的条件包裹进 `{"not": {...}}`。显示更新后的条件。然后再次询问是否要添加更多。

**如果选择 "Opt out of insert conditions"：** 在订阅上设置 `"inheritConditions": false`。然后询问是否要添加订阅层级条件（流程与上面的 "Add conditions" 相同）。

### 第 6 步：重复检查

检查 `insert+on+when` 元组在目标范围内是否已存在。
如果重复：显示 "This subscription already exists: {insert} -> {skill} [{timing}]. Nothing to add." 并停止。

注意：两个具有相同 `insert+on+when` 但不同条件的订阅**确实**被视为重复。条件修改的是行为，不是身份。如果用户想为同一个 insert+skill 配置不同条件，他们应该创建一个不同命名的 insert。

### 第 7 步：保存订阅

创建订阅对象：

无条件：
```json
{"insert": "<name>", "on": "<pattern>", "when": "<pre|post|complete>"}
```

带订阅层级条件：
```json
{"insert": "<name>", "on": "<pattern>", "when": "<pre|post|complete>", "conditions": [{"fileExists": "docs/plans/"}, {"gitBranch": "feature/*"}]}
```

带 inheritConditions 退出：
```json
{"insert": "<name>", "on": "<pattern>", "when": "<pre|post|complete>", "inheritConditions": false}
```

带退出且自有条件：
```json
{"insert": "<name>", "on": "<pattern>", "when": "<pre|post|complete>", "inheritConditions": false, "conditions": [{"gitBranch": "feature/*"}]}
```

追加到目标配置的 `subscriptions` 数组中。如果文件不存在，项目范围用 `mkdir -p .claude` 创建目录。

### 第 8 步：确认

当 insert 有条件且订阅添加了更多条件时：
```
Subscription created:
  insert: compound-knowledge
  on:     superpowers:brainstorming
  when:   pre
  scope:  project

  Effective conditions:
    inherited: fileExists("docs/")        ← from insert
    added:     gitBranch("feature/*")     ← subscription-specific
    logic:     fileExists("docs/") AND gitBranch("feature/*")

  Saved to .claude/skill-bus.json
```

退出时：
```
  Effective conditions:
    (none — opted out of insert conditions with inheritConditions: false)
```

退出但有自己的条件时：
```
  Effective conditions:
    inherited: (opted out with inheritConditions: false)
    added:     gitBranch("feature/*")     ← subscription-specific
    logic:     gitBranch("feature/*")
```

任何位置都无条件时：
```
  Conditions: none (always fires when skill matches)
```
