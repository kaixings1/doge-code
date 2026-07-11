---
description: 用自然语言功能描述创建或更新功能规范。
handoffs: 
  - label: Build Technical Plan
    agent: speckit.plan
    prompt: Create a plan for the spec. I am building with...
  - label: Clarify Spec Requirements
    agent: speckit.clarify
    prompt: Clarify specification requirements
    send: true
---

## User Input

```text
$ARGUMENTS
```

在继续之前，你**必须**考虑用户输入（如果不为空）。

## Pre-Execution Checks

**检查扩展钩子（规范生成前）**：
- 检查项目根目录下是否存在 `.specify/extensions.yml`
- 如果存在，读取它并查找 `hooks.before_specify` 键下的条目
- 如果 YAML 无法解析或无效，静默跳过钩子检查并正常继续
- 过滤掉 `enabled` 显式为 `false` 的钩子。没有 `enabled` 字段的钩子默认视为启用
- 对于剩余的每个钩子，**不要**尝试解释或评估钩子的 `condition` 表达式：
  - 如果钩子没有 `condition` 字段，或为空/null，将该钩子视为可执行
  - 如果钩子定义了非空的 `condition`，跳过该钩子，将条件评估留给 HookExecutor 实现
- 对于每个可执行的钩子，根据其 `optional` 标志输出以下内容：
  - **可选钩子**（`optional: true`）：
    ```
    ## Extension Hooks

    **Optional Pre-Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```
  - **强制钩子**（`optional: false`）：
    ```
    ## Extension Hooks

    **Automatic Pre-Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}

    Wait for the result of the hook command before proceeding to the Outline.
    ```
    输出上述代码块后，你**必须**实际调用钩子并在继续前等待其完成。以其在此 agent/会话中的相同方式运行（调用方式可能与上面字面上的 `{command}` ID 不同，例如 skills-mode agent 可能以 `/skill:speckit-...` 或 `$speckit-...` 运行）。仅输出代码块不会运行钩子。
- 如果没有注册钩子或 `.specify/extensions.yml` 不存在，静默跳过

## 大纲

用户在触发消息中 `__SPECKIT_COMMAND_SPECIFY__` 后面输入的文本**就是**功能描述。假设即使下面字面出现了 `{ARGS}`，你也可以在此对话中获得它。除非用户提供了空命令，否则不要要求用户重复。

根据功能描述，执行以下操作：

1. **为功能生成简洁的短名称**（2-4 个词）：
   - 分析功能描述并提取最有意义的关键词
   - 创建一个 2-4 个词的短名称，捕捉功能的本质
   - 尽可能使用"动作-名词"格式（例如 "add-user-auth"、"fix-payment-bug"）
   - 保留技术术语和首字母缩略词（OAuth2、API、JWT 等）
   - 保持简洁但具有足够的描述性，以便一目了然地理解功能
   - 示例：
     - "I want to add user authentication" → "user-auth"
     - "Implement OAuth2 integration for the API" → "oauth2-api-integration"
     - "Create a dashboard for analytics" → "analytics-dashboard"
     - "Fix payment processing timeout bug" → "fix-payment-timeout"

2. **分支创建**（可选，通过钩子）：

   如果上面的执行前检查中 `before_specify` 钩子成功运行，它将创建/切换到一个 git 分支并输出包含 `BRANCH_NAME` 和 `FEATURE_NUM` 的 JSON。记下这些值以供参考，但分支名称并**不**决定规范目录名称。

   如果用户显式提供了 `GIT_BRANCH_NAME`，将其传递给钩子，以便分支脚本使用确切值作为分支名（绕过所有前缀/后缀生成）。

3. **创建规范功能目录**：

   规范默认存放在 `specs/` 目录下，除非用户显式提供 `SPECIFY_FEATURE_DIRECTORY`。

   **`SPECIFY_FEATURE_DIRECTORY` 的解析顺序**：
   1. 如果用户显式提供了 `SPECIFY_FEATURE_DIRECTORY`（例如通过环境变量、参数或配置），直接使用
   2. 否则，在 `specs/` 下自动生成：
      - 检查 `.specify/init-options.json` 中的 `feature_numbering`（首选）或 `branch_numbering`（已弃用，仅迁移——将在未来版本中移除）
      - 如果是 `"timestamp"`：前缀为 `YYYYMMDD-HHMMSS`（当前时间戳）
      - 如果是 `"sequential"` 或不存在：前缀为 `NNN`（扫描 `specs/` 中现有目录后的下一个可用 3 位数字）
      - 构建目录名称：`<前缀>-<短名称>`（例如 `003-user-auth` 或 `20260319-143022-user-auth`）
      - 将 `SPECIFY_FEATURE_DIRECTORY` 设置为 `specs/<目录名称>`
      - 如果使用了 `branch_numbering`（且 `feature_numbering` 不存在），发出一行警告："⚠️ init-options.json 中的 `branch_numbering` 已弃用。请重命名为 `feature_numbering`。"

   **创建目录和规范文件**：
   - `mkdir -p SPECIFY_FEATURE_DIRECTORY`
   - 通过 Spec Kit 预设/模板解析栈解析活动的 `spec-template`（等同于 `specify preset resolve spec-template`）
   - 将解析后的 `spec-template` 文件复制到 `SPECIFY_FEATURE_DIRECTORY/spec.md` 作为起点
   - 将 `SPEC_FILE` 设置为 `SPECIFY_FEATURE_DIRECTORY/spec.md`
   - 将解析后的路径持久化到 `.specify/feature.json`：
     ```json
     {
       "feature_directory": "<解析后的功能目录>"
     }
     ```
   写入实际的解析目录路径值（例如 `specs/003-user-auth`），而非字面字符串 `SPECIFY_FEATURE_DIRECTORY`。这允许下游命令（`__SPECKIT_COMMAND_PLAN__`、`__SPECKIT_COMMAND_TASKS__` 等）定位功能目录，而无需依赖 git 分支命名约定。

   **重要**：
   - 每次 `__SPECKIT_COMMAND_SPECIFY__` 调用只能创建一个功能
   - 规范目录名和 git 分支名是独立的——它们可能相同，但这是用户的选择
   - 规范目录和文件始终由此命令创建，从不通过钩子创建

4. 加载解析后的活动 `spec-template` 文件以了解所需部分。

5. **如果存在**：加载 `/memory/constitution.md` 了解项目原则和治理约束。

6. 遵循此执行流程：
    1. 从参数解析用户描述。如果为空：错误"未提供功能描述"
    2. 从描述中提取关键概念。识别：参与者、操作、数据、约束
    3. 对于不明确的方面：
       - 根据上下文和行业标准做出有根据的猜测
       - 仅在以下情况标记 [需要澄清：具体问题]：
         - 选择会显著影响功能范围或用户体验
         - 存在多个具有不同含义的合理解释
         - 不存在合理的默认值
       - **限制：最多 3 个 [需要澄清] 标记**
       - 按影响优先级排序：范围 > 安全/隐私 > 用户体验 > 技术细节
    4. 填写用户场景和测试部分。如果没有清晰的用户流程：错误"无法确定用户场景"
    5. 生成功能需求。每个需求必须可测试。对未指定的细节使用合理的默认值（在假设部分记录假设）
    6. 定义成功标准。创建可衡量的、与技术无关的结果。包括定量指标（时间、性能、量）和定性指标（用户满意度、任务完成度）。每个标准必须可在不了解实现细节的情况下验证
    7. 识别关键实体（如果涉及数据）
    8. 返回：成功（规范准备好进行规划）

6. 使用模板结构将规范写入 SPEC_FILE，用从功能描述（参数）推导的具体细节替换占位符，同时保留部分顺序和标题。

7. **规范质量验证**：写入初始规范后，对照质量标准进行验证：

   a. **创建规范质量检查清单**：在 `SPECIFY_FEATURE_DIRECTORY/checklists/requirements.md` 生成检查清单文件，使用检查清单模板结构，包含这些验证项：

      ```markdown
      # Specification Quality Checklist: [功能名称]
      
      **目的**: 在继续规划之前验证规范的完整性和质量
      **创建时间**: [日期]
      **功能**: [指向 spec.md 的链接]
      
      ## 内容质量
      
      - [ ] 无实现细节（语言、框架、API）
      - [ ] 聚焦于用户价值和业务需求
      - [ ] 为非技术利益相关者编写
      - [ ] 所有强制部分已完成
      
      ## 需求完整性
      
      - [ ] 没有 [需要澄清] 标记残留
      - [ ] 需求可测试且无歧义
      - [ ] 成功标准可衡量
      - [ ] 成功标准与技术无关（无实现细节）
      - [ ] 所有验收场景已定义
      - [ ] 边界情况已识别
      - [ ] 范围清晰界定
      - [ ] 依赖项和假设已识别
      
      ## 功能就绪度
      
      - [ ] 所有功能需求都有明确的验收标准
      - [ ] 用户场景覆盖主要流程
      - [ ] 功能满足成功标准中定义的可衡量结果
      - [ ] 无实现细节泄漏到规范中
      
      ## 备注
      
      - 标记为不完整的项需要在 `__SPECKIT_COMMAND_CLARIFY__` 或 `__SPECKIT_COMMAND_PLAN__` 之前更新规范
      ```

   b. **运行验证检查**：对照每个检查项检查规范：
      - 确定每个项是否通过或失败
      - 记录发现的具体问题（引用相关规范部分）

   c. **处理验证结果**：

      - **如果所有项通过**：标记检查清单完成，进入强制执行后钩子部分

      - **如果项失败（不包括 [需要澄清]）**：
        1. 列出失败的项和具体问题
        2. 更新规范以解决每个问题
        3. 重新运行验证直到所有项通过（最多 3 次迭代）
        4. 如果 3 次迭代后仍失败，在检查清单备注中记录剩余问题并警告用户

      - **如果仍有 [需要澄清] 标记**：
        1. 从规范中提取所有 [需要澄清：...] 标记
        2. **限制检查**：如果超过 3 个标记，仅保留 3 个最关键（按范围/安全/UX 影响），并为其余做出有根据的猜测
        3. 对每个需要澄清的问题（最多 3 个），按以下格式向用户展示选项：

           ```markdown
           ## 问题 [N]：[主题]

           **上下文**：[引用相关规范部分]

           **我们需要知道**：[来自需要澄清标记的具体问题]

           **建议答案**：

           | 选项 | 答案 | 影响 |
           |--------|--------|--------------|
           | A | [第一个建议答案] | [这对功能意味着什么] |
           | B | [第二个建议答案] | [这对功能意味着什么] |
           | C | [第三个建议答案] | [这对功能意味着什么] |
           | 自定义 | 提供你自己的答案 | [说明如何提供自定义输入] |

           **你的选择**：_[等待用户响应]_
           ```

        4. **关键 - 表格格式**：确保 markdown 表格格式正确：
           - 管道符对齐，间距一致
           - 每个单元格内容周围应有空格：`| Content |` 而非 `|Content|`
           - 标题分隔符必须至少有 3 个破折号：`|--------|`
           - 测试表格在 markdown 预览中正确渲染
        5. 按顺序编号问题（Q1、Q2、Q3 - 最多 3 个）
        6. 在等待回复前一起展示所有问题
        7. 等待用户回复所有问题的选择
        8. 通过将每个 [需要澄清] 标记替换为用户选择或提供的答案来更新规范
        9. 所有澄清解决后重新运行验证

   d. **更新检查清单**：每次验证迭代后，用当前的通过/失败状态更新检查清单文件

## 强制执行后钩子

**在向用户报告完成之前，你必须完成此部分。**

检查项目根目录下是否存在 `.specify/extensions.yml`。
- 如果不存在，或没有在 `hooks.after_specify` 下注册的钩子，跳到完成报告。
- 如果存在，读取它并查找 `hooks.after_specify` 键下的条目。
- 如果 YAML 无法解析或无效，静默跳过并继续到完成报告。
- 过滤掉 `enabled` 显式为 `false` 的钩子。没有 `enabled` 字段的钩子默认视为启用。
- 对于剩余的每个钩子，**不要**尝试解释或评估钩子的 `condition` 表达式。
- 对于每个可执行的钩子，根据其 `optional` 标志输出以下内容：
  - **强制钩子**（`optional: false`）—— **你必须为每个强制钩子发出 `EXECUTE_COMMAND:`**：
    ```
    ## Extension Hooks

    **Automatic Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}
    ```
    输出上述代码块后，你**必须**实际调用钩子并在继续前等待其完成。以其在此 agent/会话中的相同方式运行（调用方式可能与上面字面上的 `{command}` ID 不同，例如 skills-mode agent 可能以 `/skill:speckit-...` 或 `$speckit-...` 运行）。仅输出代码块不会运行钩子。
  - **可选钩子**（`optional: true`）：
    ```
    ## Extension Hooks

    **Optional Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```

## 完成报告

向用户报告完成，包含：
- `SPECIFY_FEATURE_DIRECTORY` — 功能目录路径
- `SPEC_FILE` — 规范文件路径
- 检查清单结果摘要
- 下一阶段的就绪状态（`__SPECKIT_COMMAND_CLARIFY__` 或 `__SPECKIT_COMMAND_PLAN__`）

**注意：** 分支创建由 `before_specify` 钩子（git 扩展）处理。规范目录和文件始终由此核心命令处理。

## 快速指南

- 专注于用户**需要什么**和**为什么**。
- 避免如何实现（无技术栈、API、代码结构）。
- 为业务利益相关者编写，而非开发人员。
- 不要在规范中嵌入任何检查清单。那将是单独的命令。

### 部分要求

- **强制部分**：每个功能必须完成
- **可选部分**：仅在与功能相关时包含
- 当某个部分不适用时，完全移除它（不要留为"不适用"）

### 对于 AI 生成

当从用户提示创建此规范时：

1. **做出有根据的猜测**：使用上下文、行业标准和常见模式来填补空白
2. **记录假设**：在假设部分记录合理的默认值
3. **限制澄清**：最多 3 个 [需要澄清] 标记——仅用于以下关键决策：
   - 显著影响功能范围或用户体验
   - 具有多个不同含义的合理解释
   - 缺乏任何合理的默认值
4. **优先级排序**：范围 > 安全/隐私 > 用户体验 > 技术细节
5. **像测试人员一样思考**：每个模糊的需求都应使"可测试且无歧义"检查项失败
6. **常见需要澄清的领域**（仅当没有合理的默认值时）：
   - 功能范围和边界（包括/排除特定用例）
   - 用户类型和权限（如果可能存在多个相互冲突的解释）
   - 安全/合规要求（当具有法律/财务意义时）

**合理默认值的示例**（不要询问这些）：

- 数据保留：该领域的行业标准实践
- 性能目标：除非另有说明，标准 Web/移动应用期望
- 错误处理：带有适当回退的用户友好消息
- 认证方法：Web 应用的标准基于会话或 OAuth2
- 集成模式：使用项目适当的模式（Web 服务用 REST/GraphQL，库用函数调用，工具用 CLI 参数等）

### 成功标准指南

成功标准必须：

1. **可衡量**：包含具体指标（时间、百分比、数量、比率）
2. **与技术无关**：不提及框架、语言、数据库或工具
3. **以用户为中心**：从用户/业务角度描述结果，而非系统内部
4. **可验证**：可在不了解实现细节的情况下测试/验证

**好的示例**：

- "用户可以在 3 分钟内完成结账"
- "系统支持 10,000 并发用户"
- "95% 的搜索在 1 秒内返回结果"
- "任务完成率提高 40%"

**不好的示例**（侧重实现）：

- "API 响应时间低于 200ms"（过于技术性，用"用户立即看到结果"）
- "数据库可以处理 1000 TPS"（实现细节，使用面向用户的指标）
- "React 组件高效渲染"（框架特定）
- "Redis 缓存命中率高于 80%"（技术特定）

## 完成条件

- [ ] 规范已写入 `SPEC_FILE` 并通过质量检查清单验证
- [ ] 扩展钩子已根据规则分派或跳过
- [ ] 向用户报告完成，包含功能目录、规范文件路径和检查清单结果
