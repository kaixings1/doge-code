---
name: adk-git
description: ADK Python 项目的 Git 操作指南。包括提交信息格式和约定。
---

# adk-python 的 Git 操作

## 提交信息格式

使用 **Conventional Commits**：

```
<type>(<scope>): <description>
```

### 类型

- `feat`：新增功能
- `fix`：缺陷修复
- `docs`：仅文档变更
- `style`：格式调整，不改动代码
- `refactor`：重构代码结构，不改变行为
- `perf`：性能改进
- `test`：新增/更新测试
- `chore`：构建、配置、依赖
- `ci`：CI/CD 变更

### 描述措辞

**关键**：主题行必须回答**为什么**，而不只是**做了什么**。
只读主题行的评审者应能理解改动动机。

- **说明结果**，而不是实现细节：
  - 好：`Fix race condition when two agents write to same session`
  - 差：`Update session.py to add lock`
- **点名新增的能力**，而不是实现方式：
  - 好：`Support parallel tool execution in workflows`
  - 差：`Add asyncio.gather call in execute_tools_node`
- **重构要说明原因**，而不只是动作：
  - 好：`Make graph public for dev UI serialization`
  - 差：`Make graph a public field on new Workflow`
- **缺陷修复要说明哪里坏了**：
  - 好：`Prevent duplicate events when resuming HITL`
  - 差：`Check interrupt_id before appending`

### 详细的提交信息

提倡在正文中附上简短、具体的说明，写出详细的提交信息：
- 对于**新功能**：给出示例用法，或说明新增的能力。
- 对于**修复**：说明错误由什么导致，以及修复如何解决它。

**示例（新功能）：**
```
feat(workflow): Support JSON string parsing in schema validation

Automatically parse JSON strings into dicts or Pydantic models when input_schema or output_schema is defined on a node.
```

**示例（修复）：**
```
fix(sessions): Prevent duplicate events when resuming HITL

The interrupt_id was not checked before appending, causing duplicates if the user resumed multiple times. Added a check to ignore already processed interrupts.
```

提交前自检：读一遍你的主题行，问自己“它是否告诉了我 _为什么_ 要做这次改动？”如果它只描述了 _改了什么_，就重写它。

### 规则

1. **使用祈使语气** - 写 "Add feature"，不要写 "Added feature"。
2. **描述首字母大写**（用于 release-please 的变更日志）。
3. **主题行结尾不加句号**。
4. 主题行尽量控制在 **50 个字符**以内，最多 72 个。
5. **用正文补充上下文** - 加一个空行，然后说明 _为什么_，
   而不是 _怎么做_（当仅靠主题行不够充分时）。
6. **引用 GitHub issue** - 如果该提交修复了某个 GitHub issue，请在提交信息正文中包含 "Fixes #<issue-number>" 或 "Closes #<issue-number>"（若是跨仓库，则使用完整的 issue URL）。

### 示例

```
feat(agents): Support App pattern with lifecycle plugins
fix(sessions): Prevent memory leak on concurrent session cleanup
refactor(tools): Unify env var checks across tool implementations
docs: Add contributing guide for first-time contributors
```

## 提交前钩子

> [!IMPORTANT]
> 执行任何提交之前，先检查 `pre-commit` 是否已安装，并配置了预期的钩子（`isort`、`pyink`、`addlicense`、`mdformat`）。如果没有，请提醒用户使用 `adk-setup` 技能设置 pre-commit 钩子。
