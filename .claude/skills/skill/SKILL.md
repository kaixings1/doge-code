---
name: skill
description: 管理本地技能 — 列出、添加、移除、搜索、编辑、设置向导。
argument-hint: "<command> [args]"
level: 2
---

# 技能管理 CLI

用于通过类 CLI 命令管理 oh-my-claudecode 技能的元技能。

## 子命令

### /skill list

按作用域分组展示所有可用技能。

**行为：**
1. 扫描插件 `skills/` 目录中随附的内置技能（只读）
2. 扫描位于 `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/omc-learned/` 的用户技能
3. 扫描位于 `.omc/skills/` 的项目技能
4. 解析 YAML frontmatter 以获取元数据
5. 以规整的表格格式展示：

```
内置技能（随 oh-my-claudecode 一起提供）：
| 名称              | 描述                           | 作用域   |
|-------------------|--------------------------------|----------|
| visual-verdict    | 结构化的视觉 QA 结论           | built-in |
| ralph             | 持久化循环                     | built-in |

用户技能（~/.claude/skills/omc-learned/）：
| 名称              | 触发词             | 质量    | 使用次数 | 作用域 |
|-------------------|--------------------|---------|-------|-------|
| error-handler     | fix, error         | 95%     | 42    | user  |
| api-builder       | api, endpoint      | 88%     | 23    | user  |

项目技能（.omc/skills/）：
| 名称              | 触发词             | 质量    | 使用次数 | 作用域   |
|-------------------|--------------------|---------|-------|---------|
| test-runner       | test, run          | 92%     | 15    | project |
```

**回退：** 若无法获取质量/使用次数统计，则显示 "N/A"

**内置技能说明：** 内置技能随 oh-my-claudecode 一起提供，可被发现和读取，但不能通过 `/skill remove` 或 `/skill edit` 移除或编辑。

---

### /skill add [name]

用于创建新技能的交互式向导。

**行为：**
1. **询问技能名称**（若命令中未提供）
   - 校验：仅允许小写字母与连字符，不得包含空格
2. **询问描述**
   - 清晰、简洁的一句话说明
3. **询问触发词**（以逗号分隔的关键词）
   - 示例："error, fix, debug"
4. **询问参数提示**（可选）
   - 示例："<file> [options]"
5. **询问作用域：**
   - `user` → `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/omc-learned/<name>/SKILL.md`
   - `project` → `.omc/skills/<name>/SKILL.md`
6. **按以下模板创建技能文件**：

```yaml
---
name: <name>
description: <description>
triggers:
  - <trigger1>
  - <trigger2>
argument-hint: "<args>"
---

# <Name> 技能

## 用途

[描述该技能的用途]

## 何时激活

[描述触发词与触发条件]

## 工作流程

1. [步骤 1]
2. [步骤 2]
3. [步骤 3]

## 示例

```
/oh-my-claudecode:<name> example-arg
```

## 备注

[补充说明、边界情况、易错点]
```

7. **报告成功结果**并附上文件路径
8. **建议：** "运行 `/skill edit <name>` 来定制内容"

**示例：**
```
用户：/skill add custom-logger
助手：正在创建新技能 'custom-logger'...

描述：带结构化输出的增强日志记录
触发词（以逗号分隔）：log, logger, logging
参数提示（可选）：<level> [message]
作用域（user/project）：user

✓ 已创建技能：~/.claude/skills/omc-learned/custom-logger/SKILL.md
→ 编辑方式：/skill edit custom-logger
```

---

### /skill remove <name>

按名称移除技能。

**行为：**
1. **在两个作用域中查找技能**：
   - `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/omc-learned/<name>/SKILL.md`
   - `.omc/skills/<name>/SKILL.md`
2. **若找到：**
   - 显示技能信息（名称、描述、作用域）
   - **请求确认：** "从 <scope> 删除技能 '<name>'？（yes/no）"
3. **若确认：**
   - 删除整个技能目录（例如 `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/omc-learned/<name>/`）
   - 报告："✓ 已从 <scope> 移除技能 '<name>'"
4. **若未找到：**
   - 报告："✗ 在用户或项目作用域中未找到技能 '<name>'"

**安全：** 未经用户明确确认，绝不删除。

**示例：**
```
用户：/skill remove old-logger
助手：在用户作用域中找到技能 'old-logger'：
  描述：旧版日志工具
  作用域：user（~/.claude/skills/omc-learned/）

删除技能 'old-logger'？（yes/no）

用户：yes
助手：✓ 已从用户作用域移除技能 'old-logger'
```

---

### /skill edit <name>

以交互方式编辑已有技能。

**行为：**
1. **按名称查找技能**（搜索两个作用域）
2. **通过 Read 工具读取当前内容**
3. **显示当前取值：**
   ```
   当前技能 'custom-logger'：
   - 描述：带结构化输出的增强日志记录
   - 触发词：log, logger, logging
   - 参数提示：<level> [message]
   - 作用域：user
   ```
4. **询问要修改的内容：**
   - `description` - 更新描述
   - `triggers` - 更新触发关键词
   - `argument-hint` - 更新参数提示
   - `content` - 编辑完整的 markdown 内容
   - `rename` - 重命名技能（移动文件）
   - `cancel` - 不做修改直接退出
5. **对于选中的字段：**
   - 显示当前取值
   - 询问新的取值
   - 更新 YAML frontmatter 或内容
   - 写回文件
6. **报告成功结果**并附上变更摘要

**示例：**
```
用户：/skill edit custom-logger
助手：当前技能 'custom-logger'：
  - 描述：带结构化输出的增强日志记录
  - 触发词：log, logger, logging
  - 参数提示：<level> [message]

你想修改什么？（description/triggers/argument-hint/content/rename/cancel）

用户：triggers
助手：当前触发词：log, logger, logging
新的触发词（以逗号分隔）：log, logger, logging, trace

✓ 已更新 'custom-logger' 的触发词
```

---

### /skill search <query>

按内容、触发词、名称或描述搜索技能。

**行为：**
1. **扫描两个作用域中的所有技能**
2. **将查询词**（不区分大小写）**与以下内容匹配**：
   - 技能名称
   - 描述
   - 触发词
   - 完整的 markdown 内容
3. **带上下文展示匹配结果**：

```
找到 3 个匹配 "typescript error" 的技能：

1. typescript-fixer (user)
   描述：修复常见的 TypeScript 错误
   匹配："typescript error handling patterns"

2. error-handler (user)
   描述：通用错误处理工具
   匹配："Supports TypeScript and JavaScript errors"

3. lint-fix (project)
   描述：自动修复 lint 错误
   匹配："TypeScript ESLint error resolution"
```

**排序：** 名称/触发词中的匹配优先于内容匹配

**示例：**
```
用户：/skill search api endpoint
助手：找到 2 个匹配 "api endpoint" 的技能：

1. api-builder (user)
   描述：生成 REST API 端点
   触发词：api, endpoint, rest

2. backend-scaffold (project)
   描述：搭建后端服务脚手架
   匹配："Creates API endpoint boilerplate"
```

---

### /skill info <name>

显示某个技能的详细信息。

**行为：**
1. **按名称查找技能**（搜索两个作用域）
2. **解析 YAML frontmatter** 和内容
3. **显示完整详情：**

```
技能：custom-logger
作用域：user（~/.claude/skills/omc-learned/custom-logger/）
描述：带结构化输出的增强日志记录
触发词：log, logger, logging
参数提示：<level> [message]
质量：95%（若有）
使用次数：42 次（若有）
文件路径：/home/user/.claude/skills/omc-learned/custom-logger/SKILL.md

--- 完整内容 ---
[完整的 markdown 内容]
```

**若未找到：** 报告错误，并建议使用 `/skill search`

**示例：**
```
用户：/skill info custom-logger
助手：技能：custom-logger
作用域：user
描述：带结构化输出的增强日志记录
触发词：log, logger, logging
文件：~/.claude/skills/omc-learned/custom-logger/SKILL.md

--- 内容 ---
# 自定义日志记录器技能

## 用途
带结构化 JSON 输出的增强日志记录...
[其余内容]
```

---

### /skill sync

在用户作用域与项目作用域之间同步技能。

**行为：**
1. **扫描两个作用域：**
   - 用户技能：`${CLAUDE_CONFIG_DIR:-~/.claude}/skills/omc-learned/`
   - 项目技能：`.omc/skills/`
2. **比较并分类：**
   - 仅用户有的技能（项目中没有）
   - 仅项目有的技能（用户中没有）
   - 共有的技能（两者中都有）
3. **展示可同步的项：**

```
同步报告：

仅用户有的技能（5）：
  - error-handler
  - api-builder
  - custom-logger
  - test-generator
  - deploy-helper

仅项目有的技能（2）：
  - test-runner
  - backend-scaffold

共有的技能（3）：
  - frontend-ui-ux
  - git-master
  - planner

选项：
  [1] 将用户技能复制到项目
  [2] 将项目技能复制到用户
  [3] 查看差异
  [4] 取消
```

4. **处理用户选择：**
   - 选项 1：选择要复制到项目的技能
   - 选项 2：选择要复制到用户的技能
   - 选项 3：展示共有技能的左右对照 diff
   - 选项 4：退出

**安全：** 未经确认绝不覆盖

**示例：**
```
用户：/skill sync
助手：发现 5 个仅用户有的技能和 2 个仅项目有的技能。

是否将 'error-handler' 从用户复制到项目？（yes/no/skip）
用户：yes
助手：✓ 已将 'error-handler' 复制到 .omc/skills/

是否将 'api-builder' 从用户复制到项目？（yes/no/skip）
用户：skip
...
```

---

### /skill setup

用于设置和管理本地技能的交互式向导（原为 local-skills-setup）。

**行为：**

#### 步骤 1：检查并创建目录

首先检查技能目录是否存在，若不存在则创建：

```bash
# 检查并创建用户级技能目录
USER_SKILLS_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/omc-learned"
if [ -d "$USER_SKILLS_DIR" ]; then
  echo "用户技能目录已存在：$USER_SKILLS_DIR"
else
  mkdir -p "$USER_SKILLS_DIR"
  echo "已创建用户技能目录：$USER_SKILLS_DIR"
fi

# 检查并创建项目级技能目录
PROJECT_SKILLS_DIR=".omc/skills"
if [ -d "$PROJECT_SKILLS_DIR" ]; then
  echo "项目技能目录已存在：$PROJECT_SKILLS_DIR"
else
  mkdir -p "$PROJECT_SKILLS_DIR"
  echo "已创建项目技能目录：$PROJECT_SKILLS_DIR"
fi
```

#### 步骤 2：技能扫描与清点

扫描两个目录并展示完整的清点结果：

```bash
# 扫描用户级技能
echo "=== 用户级技能（~/.claude/skills/omc-learned/）==="
if [ -d "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/omc-learned" ]; then
  USER_COUNT=$(find "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/omc-learned" -name "*.md" 2>/dev/null | wc -l)
  echo "技能总数：$USER_COUNT"

  if [ $USER_COUNT -gt 0 ]; then
    echo ""
    echo "已找到的技能："
    find "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/omc-learned" -name "*.md" -type f -exec sh -c '
      FILE="$1"
      NAME=$(grep -m1 "^name:" "$FILE" 2>/dev/null | sed "s/name: //")
      DESC=$(grep -m1 "^description:" "$FILE" 2>/dev/null | sed "s/description: //")
      MODIFIED=$(stat -c "%y" "$FILE" 2>/dev/null || stat -f "%Sm" "$FILE" 2>/dev/null)
      echo "  - $NAME"
      [ -n "$DESC" ] && echo "    描述：$DESC"
      echo "    修改时间：$MODIFIED"
      echo ""
    ' sh {} \;
  fi
else
  echo "目录未找到"
fi

echo ""
echo "=== 项目级技能（.omc/skills/）==="
if [ -d ".omc/skills" ]; then
  PROJECT_COUNT=$(find ".omc/skills" -name "*.md" 2>/dev/null | wc -l)
  echo "技能总数：$PROJECT_COUNT"

  if [ $PROJECT_COUNT -gt 0 ]; then
    echo ""
    echo "已找到的技能："
    find ".omc/skills" -name "*.md" -type f -exec sh -c '
      FILE="$1"
      NAME=$(grep -m1 "^name:" "$FILE" 2>/dev/null | sed "s/name: //")
      DESC=$(grep -m1 "^description:" "$FILE" 2>/dev/null | sed "s/description: //")
      MODIFIED=$(stat -c "%y" "$FILE" 2>/dev/null || stat -f "%Sm" "$FILE" 2>/dev/null)
      echo "  - $NAME"
      [ -n "$DESC" ] && echo "    描述：$DESC"
      echo "    修改时间：$MODIFIED"
      echo ""
    ' sh {} \;
  fi
else
  echo "目录未找到"
fi

# 汇总
TOTAL=$((USER_COUNT + PROJECT_COUNT))
echo "=== 汇总 ==="
echo "所有目录中的技能总数：$TOTAL"
```

#### 步骤 3：快捷操作菜单

扫描完成后，使用 AskUserQuestion 工具提供以下选项：

**问题：** "你想对本地技能做什么？"

**选项：**
1. **添加新技能** - 启动技能创建向导（调用 `/skill add`）
2. **列出所有技能及其详情** - 展示完整的技能清单（调用 `/skill list`）
3. **扫描对话中的模式** - 分析当前对话，找出值得沉淀为技能的模式
4. **导入技能** - 从 URL 导入技能或粘贴内容
5. **完成** - 退出向导

**选项 3：扫描对话中的模式**

分析当前对话上下文，找出可能值得沉淀为技能的模式。重点关注：
- 近期采用非显而易见解决方案的调试过程
- 需要深入排查的棘手 bug
- 发现的针对本代码库的绕行方案
- 花费较长时间才解决的错误模式

报告发现结果，并询问用户是否要将其中的内容提取为技能（调用 `/skillify`；`/learner` 为已弃用的兼容别名）。

**选项 4：导入技能**

请用户提供以下任一项：
- **URL**：从 URL 下载技能（例如 GitHub gist）
- **粘贴内容**：直接粘贴技能的 markdown 内容

然后询问作用域：
- **用户级**（~/.claude/skills/omc-learned/） - 对所有项目可用
- **项目级**（.omc/skills/） - 仅对当前项目可用

校验技能格式并保存到选定位置。

---

### /skill scan

用于扫描两个技能目录的快捷命令（是 `/skill setup` 的子集）。

**行为：**
执行 `/skill setup` 步骤 2 中的扫描，但不进入交互式向导。

---

## 技能模板

通过 `/skill add` 或 `/skill setup` 创建技能时，为常见的技能类型提供快捷模板：

### 错误解决方案模板

```markdown
---
id: error-[unique-id]
name: [错误名称]
description: 针对[特定上下文中的特定错误]的解决方案
source: conversation
triggers: ["错误消息片段", "文件路径", "症状"]
quality: high
---

# [错误名称]

## 核心洞察
这个错误的根本原因是什么？你发现了什么原理？

## 为什么重要
如果不知道这一点会出什么问题？是什么症状把你引到这里？

## 识别特征
如何判断何时适用？有哪些迹象？
- 错误消息："[确切错误]"
- 文件：[具体文件路径]
- 上下文：[何时出现这种情况]

## 解决方法
分步解决方案：
1. [带文件/行号引用的具体操作]
2. [带文件/行号引用的具体操作]
3. [验证步骤]

## 示例
\`\`\`typescript
// 修改前（有问题的）
[有问题的代码]

// 修改后（已修复）
[修正后的代码]
\`\`\`
```

### 工作流技能模板

```markdown
---
id: workflow-[unique-id]
name: [工作流名称]
description: 针对[本代码库中特定任务]的流程
source: conversation
triggers: ["任务描述", "文件模式", "目标关键词"]
quality: high
---

# [工作流名称]

## 核心洞察
这个工作流与显而易见的做法有何不同？

## 为什么重要
如果不遵循这个流程，会出什么问题？

## 识别特征
何时应该使用这个工作流？
- 任务类型：[具体任务]
- 涉及文件：[具体模式]
- 判断依据：[如何识别]

## 解决方法
1. [包含具体命令/文件的步骤]
2. [包含具体命令/文件的步骤]
3. [验证]

## 易错点
- [常见错误及其避免方法]
- [边界情况及处理方法]
```

### 代码模式模板

```markdown
---
id: pattern-[unique-id]
name: [模式名称]
description: 针对[本代码库中特定用例]的模式
source: conversation
triggers: ["代码模式", "文件类型", "问题领域"]
quality: high
---

# [模式名称]

## 核心洞察
这个模式背后的关键原理是什么？

## 为什么重要
这个模式能解决本代码库中的哪些问题？

## 识别特征
何时应用这个模式？
- 文件类型：[具体文件]
- 问题：[具体问题]
- 上下文：[本代码库特有的上下文]

## 解决方法
给出决策启发式，而不只是代码：
1. [基于原则的步骤]
2. [基于原则的步骤]

## 示例
\`\`\`typescript
[展示该原理的说明性示例]
\`\`\`

## 反模式
不应该做什么，以及为什么：
\`\`\`typescript
[需要避免的常见错误]
\`\`\`
```

### 集成技能模板

```markdown
---
id: integration-[unique-id]
name: [集成名称]
description: [系统 A] 在本代码库中如何与 [系统 B] 集成
source: conversation
triggers: ["系统名称", "集成点", "配置文件"]
quality: high
---

# [集成名称]

## 核心洞察
这些系统的连接方式中，有哪些不明显的地方？

## 为什么重要
如果不了解这个集成，会出什么问题？

## 识别特征
何时会涉及这个集成？
- 文件：[具体集成文件]
- 配置：[具体配置位置]
- 症状：[哪些迹象表明集成有问题]

## 解决方法
如何正确处理这个集成：
1. [包含文件路径的配置步骤]
2. [包含具体细节的设置步骤]
3. [验证步骤]

## 易错点
- [集成特有的坑 #1]
- [集成特有的坑 #2]
```

---

## 错误处理

**所有命令都必须处理：**
- 文件/目录不存在
- 权限错误
- 无效的 YAML frontmatter
- 重复的技能名称
- 无效的技能名称（空格、特殊字符）

**错误格式：**
```
✗ 错误：<清晰的消息>
→ 建议：<有用的下一步>
```

---

## 使用示例

```bash
# 列出所有技能
/skill list

# 创建新技能
/skill add my-custom-skill

# 移除技能
/skill remove old-skill

# 编辑已有技能
/skill edit error-handler

# 搜索技能
/skill search typescript error

# 获取详细信息
/skill info my-custom-skill

# 在作用域之间同步
/skill sync

# 运行设置向导
/skill setup

# 快速扫描
/skill scan
```

## 使用模式

### 直接命令模式

带参数调用时，跳过交互式向导：

- `/oh-my-claudecode:skill list` - 展示详细的技能清单
- `/oh-my-claudecode:skill add` - 启动技能创建（调用 skillify）
- `/oh-my-claudecode:skill scan` - 扫描两个技能目录

### 交互模式

不带参数调用时，运行完整的引导式向导。

---

## 本地技能的优势

**自动应用**：Claude 会检测触发词并自动应用技能 - 无需记住或搜索解决方案。

**版本控制**：项目级技能（`.omc/skills/`）应当随代码一起提交，让整个团队受益。在链接的工作树中，未提交的技能仅保留在该工作树内，工作树被移除后便会消失。

**知识持续演进**：随着你发现更好的做法并优化触发词，技能会不断完善。

**减少 Token 消耗**：Claude 无需反复解决同样的问题，而是高效地套用已知模式。

**代码库记忆**：把原本会遗失在对话历史中的团队知识保留下来。

---

## 技能质量标准

好的技能应当：

1. **无法直接搜到** - 通过搜索引擎不容易找到
   - 反例："如何在 TypeScript 中读取文件"
   - 正例："本代码库使用自定义路径解析，需要 fileURLToPath"

2. **特定于上下文** - 引用本代码库中真实的文件/错误
   - 反例："用 try/catch 处理错误"
   - 正例："server.py:42 中的 aiohttp 代理在发生 ClientDisconnectedError 时崩溃"

3. **可精确执行** - 明确说明做什么以及在何处做
   - 反例："处理边界情况"
   - 正例："当在 dist/ 中看到 'Cannot find module' 时，检查 tsconfig.json 的 moduleResolution"

4. **来之不易** - 需要投入大量调试精力才能得到
   - 反例：泛泛的编程模式
   - 正例："worker.ts 中的竞态条件 - 第 89 行的 Promise.all 需要 await"

---

## 相关技能

- `/oh-my-claudecode:skillify` - 从当前对话中提取技能（`/oh-my-claudecode:learner` 是已弃用的别名）
- `/oh-my-claudecode:note` - 保存快速笔记（比技能更随意）
- `/oh-my-claudecode:deepinit` - 生成 AGENTS.md 代码库层级结构

---

## 示例会话

```
> /oh-my-claudecode:skill list

正在检查技能目录...
✓ 用户技能目录已存在：~/.claude/skills/omc-learned/
✓ 项目技能目录已存在：.omc/skills/

正在扫描技能...

=== 用户级技能 ===
技能总数：3
  - async-network-error-handling
    描述：在异步网络代码中处理彼此独立的 I/O 失败的模式
    修改时间：2026-01-20 14:32:15

  - esm-path-resolution
    描述：ESM 中需要 fileURLToPath 的自定义路径解析
    修改时间：2026-01-19 09:15:42

=== 项目级技能 ===
技能总数：5
  - session-timeout-fix
    描述：修复 session.ts 中重启后 sessionId 为 undefined 的问题
    修改时间：2026-01-22 16:45:23

  - build-cache-invalidation
    描述：何时清理 TypeScript 构建缓存以修复幽灵错误
    修改时间：2026-01-21 11:28:37

=== 汇总 ===
技能总数：8

你想做什么？
1. 添加新技能
2. 列出所有技能及其详情
3. 扫描对话中的模式
4. 导入技能
5. 完成
```

---

## 用户提示

- 定期运行 `/oh-my-claudecode:skill list` 回顾你的技能库
- 解决棘手 bug 后，立即运行 skillify 把它记录下来
- 用项目级技能保存本代码库特有的知识
- 用用户级技能保存到处都适用的通用模式
- 持续回顾并优化触发词，以提升匹配准确率

---

## 实现说明

1. **YAML 解析：** 使用 frontmatter 提取来获取元数据
2. **文件操作：** 使用 Read/Write 工具，创建新文件时绝不使用 Edit
3. **用户确认：** 破坏性操作必须始终确认
4. **清晰反馈：** 使用对勾（✓）、叉号（✗）、箭头（→）让信息更清楚
5. **作用域解析：** 始终同时检查用户和项目两个作用域
6. **校验：** 强制遵循命名约定（仅小写字母与连字符）

---

## 相关技能

- `/oh-my-claudecode:skillify` - 从当前对话中提取技能（`/oh-my-claudecode:learner` 是已弃用的别名）
- `/oh-my-claudecode:note` - 保存快速笔记（比技能更随意）
- `/oh-my-claudecode:deepinit` - 生成 AGENTS.md 代码库层级结构

---

## 未来增强

- `/skill export <name>` - 将技能导出为可分享的文件
- `/skill import <file>` - 从文件导入技能
- `/skill stats` - 展示所有技能的使用统计
- `/skill validate` - 检查所有技能是否有格式错误
- `/skill template <type>` - 基于预定义模板创建
