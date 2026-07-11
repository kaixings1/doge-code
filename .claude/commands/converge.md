---
description: 评估代码库相对于功能规范、计划和任务的情况，将剩余未构建的作业作为新任务追加到 tasks.md 中，以便实施完成。
scripts:
  sh: scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks
  ps: scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks
---

## User Input

```text
$ARGUMENTS
```

在继续之前，你**必须**考虑用户输入（如果不为空）。

## Pre-Execution Checks

**检查扩展钩子（收敛前）**：

- 检查项目根目录下是否存在 `.specify/extensions.yml`
- 如果存在，读取它并查找 `hooks.before_converge` 键下的条目
- 如果 YAML 无法解析或无效，静默跳过钩子检查并正常继续
- 过滤掉 `enabled` 显式为 `false` 的钩子。没有 `enabled` 字段的钩子默认视为启用
- 对于剩余的每个钩子，**不要**尝试解释或评估钩子的 `condition` 表达式：
  - 如果钩子没有 `condition` 字段，或为空/null，将该钩子视为可执行
  - 如果钩子定义了非空的 `condition`，跳过该钩子，将条件评估留给 HookExecutor 实现
- 对于每个可执行的钩子，根据其 `optional` 标志输出以下内容：
  - **可选钩子**（`optional: true`）：

    ```text
    ## 扩展钩子

    **可选前置钩子**: {extension}
    命令: `/{command}`
    描述: {description}

    提示: {prompt}
    执行: `/{command}`
    ```

  - **强制钩子**（`optional: false`）：

    ```text
    ## 扩展钩子

    **自动前置钩子**: {extension}
    正在执行: `/{command}`
    EXECUTE_COMMAND: {command}

    在继续目标前等待钩子命令的结果。
    ```
    输出上述代码块后，你**必须**实际调用钩子并在继续前等待其完成。以其在此 agent/会话中的相同方式运行（调用方式可能与上面字面上的 `{command}` ID 不同，例如 skills-mode agent 可能以 `/skill:speckit-...` 或 `$speckit-...` 运行）。仅输出代码块不会运行钩子。

- 如果没有注册钩子或 `.specify/extensions.yml` 不存在，静默跳过

## 目标

弥合功能规范、计划和任务要求与代码库当前实现之间的差距。将 `spec.md`、`plan.md` 和 `tasks.md` 作为**唯一意图来源**（宪法作为治理约束），评估代码的当前状态，确定哪些需求、验收标准、计划决策和现有任务未满足、不完整或仅部分满足，并将**每项剩余工作作为新的可追踪任务追加到 `tasks.md` 末尾**，以便 `__SPECKIT_COMMAND_IMPLEMENT__` 可以完成它。此命令必须在 `__SPECKIT_COMMAND_IMPLEMENT__` 在当前 `tasks.md` 上运行之后，以及 `__SPECKIT_COMMAND_TASKS__` 生成完整的 `tasks.md` 之后才能运行。

这**不是** diff 工具，也**不**跟踪更改。它评估代码相对于功能工件的当前状态——无需 git，无需分支比较，无需历史记录。

## 操作约束

**仅追加，绝不重写**：此命令的**唯一**写入操作是向 `tasks.md` 追加一个新的 `## Phase N: Convergence` 部分。它必须**不**：

- 以任何方式修改 `spec.md` 或 `plan.md`；
- 重写、重新编号、重新排序或删除任何现有任务（包括来自先前收敛阶段的任务）；
- 修改、创建或删除任何应用程序代码——完成追加的任务是 `__SPECKIT_COMMAND_IMPLEMENT__` 的工作。

当代码库已满足所有要求时，必须保持 `tasks.md` **逐字节不变**（无空的 Convergence 标题）并报告干净结果。

**宪法权威**：项目宪法（`/memory/constitution.md`）是**不可协商的**。违反 MUST 原则的代码是最严重的发现，并产生相应的修复任务。如果宪法是未填写的模板，优雅跳过宪法检查而非失败。

## 执行步骤

### 1. 初始化收敛上下文

从仓库根目录运行一次 `{SCRIPT}` 并解析 JSON，获取 FEATURE_DIR 和 AVAILABLE_DOCS。推导绝对路径：

- SPEC = FEATURE_DIR/spec.md
- PLAN = FEATURE_DIR/plan.md
- TASKS = FEATURE_DIR/tasks.md
- CONSTITUTION = `/memory/constitution.md`（如果存在）

如果 `spec.md`、`plan.md` 或 `tasks.md` 缺失，停止并提供清晰可操作的消息，指明要运行的前提命令（缺失 spec 运行 `__SPECKIT_COMMAND_SPECIFY__`，缺失 plan 运行 `__SPECKIT_COMMAND_PLAN__`，缺失 tasks 运行 `__SPECKIT_COMMAND_TASKS__`）。不要产生部分输出。
对于参数中的单引号（如 "I'm Groot"），使用转义语法。

### 2. 加载工件（渐进式披露）

从每个工件加载最小必要的上下文：

**从 spec.md：**

- 功能需求（FR-###）
- 成功标准（SC-###）——仅包含需要可构建工作的项；排除发布后的结果指标和业务 KPI
- 用户故事及其验收场景
- 边界情况（如果存在）

**从 plan.md：**

- 架构/技术栈选择和技术决策
- 数据模型引用
- 阶段和命名的接触点（计划说将要创建或编辑的文件/组件）
- 技术约束

**从 tasks.md：**

- 任务 ID（用于计算下一个 ID 和下一个阶段编号）
- 描述、阶段分组和引用的文件路径

**从宪法（如果不是未填写的模板）：**

- 原则名称和 MUST/SHOULD 规范声明

### 3. 构建意图清单

创建内部模型（不要回显原始工件）：

- **需求清单**：每个 FR-### / SC-### / 用户故事验收场景一个稳定键（例如 `US1/AC2`），外加强加可构建义务的计划决策和宪法原则。
- **代码范围映射**：从 `plan.md` 和 `tasks.md` 中命名的文件路径，加上对每个需求描述的概念进行关键词搜索，推导出需要评估的源文件和组件集合。将评估限定在这些范围内——**不要**推断超出工件定义的范围。

### 4. 评估代码库并分类发现

对意图清单中的每个项，检查范围内的当前代码，仅在存在差距时生成发现。按**差距类型**对每个发现进行分类：

- **`missing`（缺失）**：所需工作在代码中完全不存在。
- **`partial`（部分）**：工作存在但尚未完全满足需求/验收标准/计划决策。
- **`contradicts`（矛盾）**：代码做了与声明意图或宪法 MUST 原则冲突的事情。
- **`unrequested`（未请求）**：代码包含规范、计划或任务未要求的工作（提出以供注意——收敛**不会**删除代码，只会追加任务以审查/论证或移除）。

每个发现记录：稳定 ID、追溯的 `source-ref`、`gap-type`、严重性和简短的人类可读描述及证据（观察到的文件/区域）。

**边界情况：**

- **代码很少或没有代码**：将整个指定范围视为 `missing` 剩余工作而非失败。
- **无剩余工作**：产生零发现并遵循步骤 7 中的已收敛分支。

### 5. 分配严重性

- **严重**：违反宪法 MUST 原则，或阻塞 P1 用户故事基线功能的 `missing`/`contradicts` 差距。
- **高**：核心功能需求或验收标准上的 `missing` 或 `partial` 差距。
- **中**：次要需求上的 `partial` 差距，或理由不明确的 `unrequested` 添加。
- **低**：轻微的部分差距、润色或低风险的 `unrequested` 添加。

### 6. 展示会话内发现摘要

在追加任何内容之前，输出一个按严重程度分级的紧凑摘要（尚未写入文件）：

## 收敛发现

| ID | 差距类型 | 严重性 | 来源 | 证据 | 剩余工作 |
|----|----------|--------|------|------|----------|
| F1 | missing | HIGH | FR-008 | 示例：在写入 tasks.md 时，path/to/module.py 中未检测到仅追加保护 | 添加仅追加强制机制 |

**摘要指标：**

- 已检查的需求/验收标准
- 已检查的计划决策
- 已检查的宪法原则（或"已跳过——模板"）
- 按差距类型的发现（missing / partial / contradicts / unrequested）
- 按严重性的发现

### 7. 追加收敛任务（或报告已收敛）

**如果存在一个或多个可操作的发现**（`tasks_appended` 结果）：

追加到 `tasks.md` 的**末尾**，按照追加契约：

1. 扫描所有现有任务 ID；设 `M` 为最大值。确定下一个阶段编号 `N`（最高现有阶段 + 1）。
2. 写入一个新的章节标题 `## Phase N: Convergence`。
3. 每个可操作的发现发射一个检查项，按严重/高优先排序，分配零填充 ID `T{M+1:03d}, T{M+2:03d}, …`：

   ```markdown
   - [ ] T042 <祈使描述> 根据 <source-ref>（<gap-type>）
   ```

   `<source-ref>` 将任务追溯到其来源：例如 `FR-003`、`SC-002`、`US1/AC2`、`plan: storage decision`、`Constitution II`。

   `<gap-type>` 是 `missing`、`partial`、`contradicts` 或 `unrequested` 之一。

   违反宪法任务必须首先发射并描述为 `CRITICAL`。
4. 绝不重用或重新编号现有 ID。如果存在先前的收敛阶段，在其下方添加一个新的、单独编号的阶段——不要触碰旧的。

**如果没有可操作的发现**（`converged` 结果）：

- **不**修改 `tasks.md`——无空阶段标题。
- 报告：**"✅ 已收敛——实现满足规范、计划和任务。"**
- 包含已检查内容的摘要计数。

### 8. 提供后续操作（交接）

- 在 `tasks_appended` 上：说明在哪个阶段下追加了多少任务，并推荐运行 `__SPECKIT_COMMAND_IMPLEMENT__` 来完成它们；注意后续的收敛运行将发现更少或没有剩余项。
- 在 `converged` 上：建议继续进行审查/打开 PR。此功能指定范围无需进一步的实现传递。

### 9. 检查扩展钩子

产生结果后，检查项目根目录下是否存在 `.specify/extensions.yml`。

- 如果存在，读取它并查找 `hooks.after_converge` 键下的条目
- 如果 YAML 无法解析或无效，静默跳过钩子检查并正常继续
- 过滤掉 `enabled` 显式为 `false` 的钩子。没有 `enabled` 字段的钩子默认视为启用
- 对于剩余的每个钩子，**不要**尝试解释或评估钩子的 `condition` 表达式：
  - 如果钩子没有 `condition` 字段，或为空/null，将该钩子视为可执行
  - 如果钩子定义了非空的 `condition`，跳过该钩子，将条件评估留给 HookExecutor 实现
- 在列出任何钩子之前，在会话内报告收敛结果（`converged` 或 `tasks_appended`），以便用户决定是否运行可选的后续命令。
- 对于每个可执行的钩子，根据其 `optional` 标志输出以下内容：
  - **可选钩子**（`optional: true`）：

    ```text
    ## 扩展钩子

    **可选钩子**: {extension}
    命令: `/{command}`
    描述: {description}

    提示: {prompt}
    执行: `/{command}`
    ```

  - **强制钩子**（`optional: false`）：

    ```text
    ## 扩展钩子

    **自动钩子**: {extension}
    正在执行: `/{command}`
    EXECUTE_COMMAND: {command}
    ```
    输出上述代码块后，你**必须**实际调用钩子并在继续前等待其完成。以其在此 agent/会话中的相同方式运行。仅输出代码块不会运行钩子。

- 如果没有注册钩子或 `.specify/extensions.yml` 不存在，静默跳过
