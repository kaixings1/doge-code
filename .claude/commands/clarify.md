---
description: 通过最多 5 个高度针对性澄清问题，找出当前功能规范中未明确之处，并将答案回写进规范
handoffs: 
  - label: Build Technical Plan
    agent: speckit.plan
    prompt: Create a plan for the spec. I am building with...
scripts:
   sh: scripts/bash/check-prerequisites.sh --json --paths-only
   ps: scripts/powershell/check-prerequisites.ps1 -Json -PathsOnly
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Pre-Execution Checks

**检查扩展钩子（澄清前）**：
- Check if `.specify/extensions.yml` exists in the project root.
- If it exists, read it and look for entries under the `hooks.before_clarify` key
- If the YAML cannot be parsed or is invalid, skip hook checking silently and continue normally
- Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
- For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
  - If the hook has no `condition` field, or it is null/empty, treat the hook as executable
  - If the hook defines a non-empty `condition`, skip the hook and leave condition evaluation to the HookExecutor implementation
- For each executable hook, output the following based on its `optional` flag:
  - **可选钩子**（`optional: true`）：
    ```
    ## Extension Hooks

    **可选前置钩子**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```
  - **强制钩子**（`optional: false`）：
    ```
    ## Extension Hooks

    **自动前置钩子**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}

    Wait for the result of the hook command before proceeding to the Outline.
    ```
    输出上述代码块后，你**必须**实际调用钩子并在继续前等待其完成。以其在此 agent/会话中的相同方式运行。仅输出代码块不会运行钩子。
- If no hooks are registered or `.specify/extensions.yml` does not exist, skip silently

## 大纲

目标：检测并减少活动功能规范中的歧义或缺失决策点，并将澄清内容直接记录在规范文件中。

注意：此澄清工作流应在调用 `__SPECKIT_COMMAND_PLAN__` **之前**运行（并完成）。如果用户明确声明跳过澄清（例如探索性探针），你可以继续，但必须警告下游返工风险会增加。

执行步骤：

1. 从仓库根目录**一次**运行 `{SCRIPT}`（组合 `--json --paths-only` 模式）。解析最小的 JSON 负载字段：
   - `FEATURE_DIR`
   - `FEATURE_SPEC`
   - （可选捕获 `IMPL_PLAN`、`TASKS` 供将来链式流程使用。）
   - 如果 JSON 解析失败，中止并指示用户重新运行 `__SPECKIT_COMMAND_SPECIFY__` 或验证功能分支环境。
   - 对于参数中的单引号（如 "I'm Groot"），使用转义语法。

2. **如果存在**：加载 `/memory/constitution.md` 了解项目原则和治理约束。

3. Load the current spec file. Perform a structured ambiguity & coverage scan using this taxonomy. For each category, mark status: Clear / Partial / Missing. Produce an internal coverage map used for prioritization (do not output raw map unless no questions will be asked).

   功能范围与行为：
   - 核心用户目标和成功标准
   - 显式的范围外声明
   - 用户角色/人物画像区分

   领域与数据模型：
   - 实体、属性、关系
   - 身份和唯一性规则
   - 生命周期/状态转换
   - 数据量/规模假设

   交互与用户体验流程：
   - 关键用户旅程/序列
   - 错误/空/加载状态
   - 可访问性或本地化说明

   非功能质量属性：
   - 性能（延迟、吞吐量目标）
   - 可扩展性（水平/垂直、限制）
   - 可靠性与可用性（正常运行时间、恢复期望）
   - 可观测性（日志、指标、追踪信号）
   - 安全与隐私（认证/授权、数据保护、威胁假设）
   - 合规/监管约束（如有）

   集成与外部依赖：
   - 外部服务/API 和故障模式
   - 数据导入/导出格式
   - 协议/版本假设

   边界情况与故障处理：
   - 负面场景
   - 速率限制/节流
   - 冲突解决（例如并发编辑）

   约束与权衡：
   - 技术约束（语言、存储、托管）
   - 显式权衡或被拒绝的替代方案

   术语与一致性：
   - 规范词汇表术语
   - 应避免的同义词/弃用术语

   完成信号：
   - 验收标准可测试性
   - 可衡量的完成定义风格指标

   杂项/占位符：
   - TODO 标记/未解决的决策
   - 缺乏量化的模糊形容词（"健壮"、"直观"）

   对于状态为"部分"或"缺失"的每个类别，添加候选项问题机会，除非：
   - 澄清不会实质性改变实现或验证策略
   - 信息更适合推迟到规划阶段（内部记录）

4. 内部生成候选澄清问题的优先级队列（最多 5 个）。不要一次性输出所有问题。应用以下约束：
    - 整个会话最多 5 个问题。
    - 每个问题必须可回答为：简短多选（2-5 个互斥选项），或单字/短语答案（明确约束："答案 <=5 字"）。
    - 仅包含答案对架构、数据建模、任务分解、测试设计、UX 行为、运维就绪或合规验证有实质性影响的问题。
    - 确保类别覆盖均衡：优先覆盖影响最大的未解决类别；避免在单个高影响区域（如安全态势）未解决时问两个低影响问题。
    - 排除已回答的问题、琐碎的样式偏好或计划级执行细节（除非阻碍正确性）。
    - 优先选择减少下游返工风险或防止验收测试错位的澄清。
    - 如果超过 5 个类别未解决，通过（影响 × 不确定性）启发式选择前 5 个。

5. Sequential questioning loop (interactive):
    - Present EXACTLY ONE question at a time.
    - For multiple‑choice questions:
       - **Analyze all options** and determine the **most suitable option** based on:
          - Best practices for the project type
          - Common patterns in similar implementations
          - Risk reduction (security, performance, maintainability)
          - Alignment with any explicit project goals or constraints visible in the spec
       - Present your **recommended option prominently** at the top with clear reasoning (1-2 sentences explaining why this is the best choice).
       - Format as: `**Recommended:** Option [X] - <reasoning>`
       - Then render all options as a Markdown table:

       | Option | Description |
       |--------|-------------|
       | A | <Option A description> |
       | B | <Option B description> |
       | C | <Option C description> (add D/E as needed up to 5) |
       | Short | Provide a different short answer (<=5 words) (Include only if free-form alternative is appropriate) |

       - After the table, add: `You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.`
    - 对于简答题（无有意义的分立选项）：
       - 根据最佳实践和上下文提供你的**建议答案**。
       - 格式为：`**Suggested:** <你的建议答案> - <简要理由>`
       - 然后输出：`Format: Short answer (<=5 words). You can accept the suggestion by saying "yes" or "suggested", or provide your own answer.`
    - 用户回答后：
       - 如果用户回复"yes"、"recommended"或"suggested"，使用你先前陈述的建议作为答案。
       - 否则，验证答案映射到一个选项或符合 <=5 字约束。
       - 如果模糊不清，要求快速澄清（计数仍属于同一问题；不推进）。
       - 一旦满意，记录到工作记忆中（尚未写入磁盘）并移动到下一个排队问题。
    - 在以下情况停止提问：
       - 所有关键歧义已提前解决（剩余排队项变得不必要），或
       - 用户发出完成信号（"done"、"good"、"no more"），或
       - 已达到 5 个问题。
    - 绝不提前透露未来的排队问题。
    - 如果一开始就没有有效问题，立即报告没有关键歧义。

6. 每次接受答案后集成（增量更新方法）：
    - 维护规范的内存表示（开始时加载一次）以及原始文件内容。
    - 对于本次会话的第一个集成答案：
       - 确保 `## Clarifications` 部分存在（如果缺失，根据规范模板在最高层级上下文/概述部分之后立即创建）。
       - 在其下方，为今天创建（如果不存在）`### Session YYYY-MM-DD` 子标题。
    - 在接受后立即追加一行项目符号：`- Q: <问题> → A: <最终答案>`。
    - 然后立即将澄清应用于最适当的部分：
       - 功能歧义 → 在功能需求中更新或添加项目符号。
       - 用户交互/参与者区分 → 用澄清的角色、约束或场景更新用户故事或参与者子部分。
       - 数据形状/实体 → 更新数据模型（添加字段、类型、关系），保留排序；简洁记录添加的约束。
       - 非功能约束 → 在成功标准 > 可衡量结果中添加/修改可衡量标准（将模糊形容词转换为指标或明确目标）。
       - 边界情况/负面流程 → 在边界情况/错误处理下添加新的项目符号（如果模板为其提供了占位符则创建此类子部分）。
       - 术语冲突 → 在整个规范中规范化术语；仅在必要时通过添加 `(formerly referred to as "X")` 保留原始术语。
    - 如果澄清使早期的模糊声明无效，替换该声明而非重复；不留过时的矛盾文本。
    - 每次集成**后**保存规范文件，以最小化上下文丢失的风险（原子覆盖）。
    - 保留格式：不要重新排序无关部分；保持标题层级完整。
    - 保持每个插入的澄清最小化和可测试（避免叙述漂移）。

7. 验证（每次写入后执行，外加最终检查）：
   - 澄清会话每个接受的答案恰好包含一个项目符号（无重复）。
   - 总共提问（接受）的问题数 ≤ 5。
   - 更新的部分不包含新答案本应解决的遗留模糊占位符。
   - 没有残留的矛盾早期声明（扫描已移除的现在无效的替代选择）。
   - Markdown 结构有效；仅允许的新标题：`## Clarifications`、`### Session YYYY-MM-DD`。
   - 术语一致性：所有更新的部分使用相同的规范术语。

8. 将更新后的规范写回 `FEATURE_SPEC`。

9. **重新验证规范质量检查清单**（如果存在）：
   - 检查 `FEATURE_DIR/checklists/requirements.md` 是否存在。
   - 如果不存在，静默跳过此步骤。
   - 如果存在：
     1. 读取检查清单文件。
     2. 识别所有 GitHub 任务列表复选框行——匹配 `- [ ]`、`- [x]` 或 `- [X]` 的行（不区分大小写，允许嵌套项的前导空白）在代码围栏外。忽略所有其他内容（标题、备注、非复选框项目符号、元数据）。
     3. 对每个复选框行，将其当前标记状态（已勾选或未勾选）和项目文本记录到前置快照列表中。
     4. 对照**更新后的**规范重新评估每个复选框项。
     5. 对每个复选框项，仅在勾选/未勾选状态实际发生变化时更新：
        - 如果项现在通过且之前未勾选：将 `[ ]` 改为 `[x]`。
        - 如果项现在失败且之前已勾选：将 `[x]`/`[X]` 改为 `[ ]`。
        - 如果状态未变化：保持标记不变（保留现有大小写以避免外观差异）。
     6. 保存更新后的检查清单文件。**仅切换状态发生变化的复选框行的 `[ ]`/`[x]` 标记部分。**所有其他文件内容——标题、元数据、备注、行顺序、空白——必须保持不变以避免噪声差异。
     7. 比较前置快照与当前状态，为完成报告计算三个列表：
        - **新通过**：从未勾选变为已勾选的项。
        - **回归**：从已勾选变为未勾选的项。
        - **仍未勾选**：仍保持未勾选的项。
     8. 记录前后通过计数为已勾选/总复选框项。

行为规则：

- 如果未发现有意义歧义，回复："未检测到值得正式澄清的关键歧义。"并建议继续。
- 如果规范文件缺失，指示用户先运行 `__SPECKIT_COMMAND_SPECIFY__`（不要在此创建新规范）。
- 不超过 5 个问题（单个问题的澄清重试不计为新问题）。
- 避免推测性技术栈问题，除非缺失阻碍功能清晰度。
- 尊重用户提前终止信号（"stop"、"done"、"proceed"）。
- 如果因完全覆盖而未提问，输出简洁的覆盖摘要（所有类别清晰）然后建议继续。
- 如果配额已用完但仍有未解决的高影响类别，在"已延期"下明确标记并附理由。

Context for prioritization: {ARGS}

## 强制执行后钩子

**在向用户报告完成之前，你必须完成此部分。**

检查项目根目录下是否存在 `.specify/extensions.yml`。
- 如果不存在，或没有在 `hooks.after_clarify` 下注册的钩子，跳到完成报告。
- 如果存在，读取它并查找 `hooks.after_clarify` 键下的条目。
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
    输出上述代码块后，你**必须**实际调用钩子并在继续前等待其完成。以其在此 agent/会话中的相同方式运行。仅输出代码块不会运行钩子。
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

提问循环结束或提前终止后报告完成：
- 提问和回答的问题数量。
- 更新后的规范路径。
- 涉及的部分（列出名称）。
- 规范质量检查清单状态（如果 `FEATURE_DIR/checklists/requirements.md` 已重新验证）：显示前后通过计数（例如"Spec Quality Checklist: 12/16 → 15/16 items passing"），并列出任何状态发生变化的项——包括新勾选（未勾选→已勾选）和任何回归（已勾选→未勾选）。如果有任何项仍未勾选，将其列出为需要注意的领域。
- 覆盖摘要表，列出每个分类类别的状态：已解决（原为部分/缺失并已处理）、已延期（超出问题配额或更适合规划）、清晰（已足够）、未解决（仍为部分/缺失但影响低）。
- 如果存在任何"未解决"或"已延期"项，建议是继续执行 `__SPECKIT_COMMAND_PLAN__` 还是在计划后再次运行 `__SPECKIT_COMMAND_CLARIFY__`。
- 建议的下一个命令。

## 完成条件

- [ ] 规范歧义已识别，澄清已整合到规范文件中
- [ ] 规范质量检查清单已对照更新后的规范重新验证（如果 `FEATURE_DIR/checklists/requirements.md` 存在）
- [ ] 扩展钩子已根据规则分派或跳过
- [ ] 向用户报告完成情况，包含已回答的问题、涉及的部分、检查清单状态和覆盖摘要
