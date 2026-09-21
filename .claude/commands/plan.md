---
description: 使用 plan 模板执行实现规划工作流，以生成设计工件。
handoffs: 
  - label: Create Tasks
    agent: speckit.tasks
    prompt: Break the plan into tasks
    send: true
  - label: Create Checklist
    agent: speckit.checklist
    prompt: Create a checklist for the following domain...
scripts:
  sh: scripts/bash/setup-plan.sh --json
  ps: scripts/powershell/setup-plan.ps1 -Json
---

## 用户输入

```text
$ARGUMENTS
```

在继续之前（如果非空），你**必须**考虑用户输入。

## 执行前检查

**检查扩展 hooks（规划之前）**：
- 检查项目根目录是否存在 `.specify/extensions.yml`。
- 如果存在，读取它并查找 `hooks.before_plan` 键下的条目
- 如果 YAML 无法解析或无效，静默跳过 hook 检查并正常继续
- 过滤掉 `enabled` 显式为 `false` 的 hooks。没有 `enabled` 字段的 hook 默认视为已启用。
- 对于每个剩余的 hook，**不要**尝试解释或求值 hook 的 `condition` 表达式：
  - 如果 hook 没有 `condition` 字段，或它为 null/空，把该 hook 视为可执行
  - 如果 hook 定义了非空的 `condition`，跳过该 hook，把条件求值留给 HookExecutor 实现
- 对于每个可执行的 hook，根据其 `optional` 标志输出以下内容：
  - **可选 hook**（`optional: true`）：
    ```
    ## Extension Hooks

    **Optional Pre-Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```
  - **强制 hook**（`optional: false`）：
    ```
    ## Extension Hooks

    **Automatic Pre-Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}

    Wait for the result of the hook command before proceeding to the Outline.
    ```
    发出上面的块之后，你**必须**真正调用该 hook 并等待它完成再继续。以你在本 agent/会话中自己运行该命令的方式运行它（调用方式可能与上面字面显示的 `{command}` id 不同，例如 skills 模式 agent 会把它作为 `/skill:speckit-...` 或 `$speckit-...` 运行）。仅发出该块本身并不会运行 hook。
- 如果没有注册任何 hook，或 `.specify/extensions.yml` 不存在，静默跳过

## 大纲

1. **设置**：从仓库根目录运行 `{SCRIPT}` 并解析 JSON 以获取 FEATURE_SPEC、IMPL_PLAN、SPECS_DIR、BRANCH。对于参数中的单引号如 "I'm Groot"，使用转义语法：例如 'I'\''m Groot'（或尽可能用双引号："I'm Groot"）。

2. **加载上下文**：读取 FEATURE_SPEC 和 `/memory/constitution.md`。加载 IMPL_PLAN 模板（已复制）。

3. **执行 plan 工作流**：遵循 IMPL_PLAN 模板中的结构以：
   - 填写技术上下文（把未知项标记为 "NEEDS CLARIFICATION"）
   - 从 constitution 填写 Constitution Check 章节
   - 评估关卡（如果违规且无正当理由则报 ERROR）
   - 阶段 0：生成 research.md（解决所有 NEEDS CLARIFICATION）
   - 阶段 1：生成 data-model.md、contracts/、quickstart.md
   - 阶段 1：通过运行 agent 脚本更新 agent 上下文
   - 设计完成后重新评估 Constitution Check

## 强制的执行后 Hooks

**在向用户报告完成之前，你**必须**完成本章节。**

检查项目根目录是否存在 `.specify/extensions.yml`。
- 如果不存在，或 `hooks.after_plan` 下没有注册 hook，跳到完成报告。
- 如果存在，读取它并查找 `hooks.after_plan` 键下的条目。
- 如果 YAML 无法解析或无效，静默跳过 hook 检查并继续到完成报告。
- 过滤掉 `enabled` 显式为 `false` 的 hooks。没有 `enabled` 字段的 hook 默认视为已启用。
- 对于每个剩余的 hook，**不要**尝试解释或求值 hook 的 `condition` 表达式：
  - 如果 hook 没有 `condition` 字段，或它为 null/空，把该 hook 视为可执行
  - 如果 hook 定义了非空的 `condition`，跳过该 hook，把条件求值留给 HookExecutor 实现
- 对于每个可执行的 hook，根据其 `optional` 标志输出以下内容：
  - **强制 hook**（`optional: false`）—— **你必须为每个强制 hook 发出 `EXECUTE_COMMAND:`**：
    ```
    ## Extension Hooks

    **Automatic Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}
    ```
    发出上面的块之后，你**必须**真正调用该 hook 并等待它完成再继续。以你在本 agent/会话中自己运行该命令的方式运行它（调用方式可能与上面字面显示的 `{command}` id 不同，例如 skills 模式 agent 会把它作为 `/skill:speckit-...` 或 `$speckit-...` 运行）。仅发出该块本身并不会运行 hook。
  - **可选 hook**（`optional: true`）：
    ```
    ## Extension Hooks

    **Optional Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```

## 完成报告

命令在阶段 2 规划后结束。报告分支、IMPL_PLAN 路径以及生成的工件。

## 阶段

### 阶段 0：大纲与研究

1. **从上面的技术上下文中提取未知项**：
   - 每个 NEEDS CLARIFICATION → 研究任务
   - 每个依赖 → 最佳实践任务
   - 每个集成 → 模式任务

2. **生成并分派研究代理**：

   ```text
   For each unknown in Technical Context:
     Task: "Research {unknown} for {feature context}"
   For each technology choice:
     Task: "Find best practices for {tech} in {domain}"
   ```

3. **在 `research.md` 中整合发现**，使用格式：
   - Decision: [what was chosen]
   - Rationale: [why chosen]
   - Alternatives considered: [what else evaluated]

**输出**：所有 NEEDS CLARIFICATION 均已解决的 research.md

### 阶段 1：设计与契约

**前提条件：** `research.md` 已完成

1. **从功能规格中提取实体** → `data-model.md`：
   - 实体名称、字段、关系
   - 来自需求的校验规则
   - 如有适用则为状态转换

2. **定义接口契约**（如果项目有外部接口）→ `/contracts/`：
   - 识别项目向用户或其他系统暴露哪些接口
   - 记录适合项目类型的契约格式
   - 示例：库的公共 API、CLI 工具的命令 schema、Web 服务的端点、解析器的语法、应用的 UI 契约
   - 如果项目纯属内部（构建脚本、一次性工具等）则跳过

3. **创建快速上手验证指南** → `quickstart.md`：
   - 记录可运行的验证场景，证明该功能端到端可用
   - 包含前提条件、设置命令、测试/运行命令以及预期结果
   - 使用指向契约和数据模型细节的链接或引用，而不是重复它们
   - 不要包含完整实现代码、模型/服务/控制器主体、迁移或完整测试套件
   - 把此工件保持为验证/运行指南；实现细节属于 `tasks.md` 和实现阶段

4. **Agent 上下文更新**：
   - 更新 `__CONTEXT_FILE__` 中 `<!-- SPECKIT START -->` 与 `<!-- SPECKIT END -->` 标记之间的 plan 引用，使其指向步骤 1 中创建的 plan 文件（IMPL_PLAN 路径）

**输出**：data-model.md、/contracts/*、quickstart.md、更新后的 agent 上下文文件

## 关键规则

- 文件系统操作使用绝对路径；文档和 agent 上下文文件中的引用使用项目相对路径
- 关卡失败或有未解决的澄清时报 ERROR

## 完成条件

- [ ] Plan 工作流已执行且设计工件已生成
- [ ] 扩展 hooks 已按上面"强制的执行后 Hooks"中的规则分派或跳过
- [ ] 已向用户报告完成，包含分支、plan 路径和生成的工件
