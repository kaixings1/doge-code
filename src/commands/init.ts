import { feature } from 'bun:bundle'
import type { Command } from '../commands.js'
import { maybeMarkProjectOnboardingComplete } from '../projectOnboardingState.js'
import { isEnvTruthy } from '../utils/envUtils.js'

const OLD_INIT_PROMPT = `Please analyze this codebase and create a CLAUDE.md file, which will be given to future instances of Claude Code to operate in this repository.

What to add:
1. Commands that will be commonly used, such as how to build, lint, and run tests. Include the necessary commands to develop in this codebase, such as how to run a single test.
2. High-level code architecture and structure so that future instances can be productive more quickly. Focus on the "big picture" architecture that requires reading multiple files to understand.

Usage notes:
- 如果已经有 CLAUDE.md，请提出改进建议。
- 当你制作初始 CLAUDE.md 时，不要重复自己，也不要包含明显的说明，如"向用户提供有用的错误消息"、"为新实用程序编写单元测试"、"永远不要在代码或提交中包含敏感信息（API 密钥、令牌）"。
- 避免列出可以轻松发现的每个组件或文件结构。
- 不要包含通用的开发实践。
- 如果有 Cursor 规则（在 .cursor/rules/ 或 .cursorrules 中）或 Copilot 规则（在 .github/copilot-instructions.md 中），请确保包含重要部分。
- 如果有 README.md，请确保包含重要部分。
- 除非在其他文件中明确包含，否则不要编造信息，如"Common Development Tasks"、"Tips for Development"、"Support and Documentation"。
- 请务必用以下文本作为文件前缀：

\`\`\`
# CLAUDE.md

此文件为 Claude Code (claude.ai/code) 在处理此代码库时提供指导。
\`\`\``

const NEW_INIT_PROMPT = `Set up a minimal CLAUDE.md (and optionally skills and hooks) for this repo. CLAUDE.md is loaded into every Claude Code session, so it must be concise — only include what Claude would get wrong without it.

## Phase 1: Ask what to set up

Use AskUserQuestion to find out what the user wants:

- "应该为 /init 设置哪个 CLAUDE.md 文件？"
  选项："项目 CLAUDE.md" | "个人 CLAUDE.local.md" | "项目 + 个人两者"
  项目描述："团队共享的说明，检入源代码管理 — 架构、编码标准、常用工作流。"
  个人描述："你对这个项目的私人偏好（已 gitignore，不共享）— 你的角色、沙箱 URL、首选测试数据、工作流怪癖。"

- "还要设置技能和钩子吗？"
  选项："技能 + 钩子" | "仅技能" | "仅钩子" | "都不，仅 CLAUDE.md"
  技能描述："你或 Claude 使用 \`/skill-name\` 调用的按需功能 — 适用于可重复的工作流和参考知识。"
  钩子描述："在工具事件上运行的确定性 shell 命令（例如，每次编辑后格式化）。Claude 不能跳过它们。"

## Phase 2: Explore the codebase

Launch a subagent to survey the codebase, and ask it to read key files to understand the project: manifest files (package.json, Cargo.toml, pyproject.toml, go.mod, pom.xml, etc.), README, Makefile/build configs, CI config, existing CLAUDE.md, .claude/rules/, AGENTS.md, .cursor/rules or .cursorrules, .github/copilot-instructions.md, .windsurfrules, .clinerules, .mcp.json.

Detect:
- Build, test, and lint commands (especially non-standard ones)
- Languages, frameworks, and package manager
- Project structure (monorepo with workspaces, multi-module, or single project)
- Code style rules that differ from language defaults
- Non-obvious gotchas, required env vars, or workflow quirks
- Existing .claude/skills/ and .claude/rules/ directories
- Formatter configuration (prettier, biome, ruff, black, gofmt, rustfmt, or a unified format script like \`npm run format\` / \`make fmt\`)
- Git worktree usage: run \`git worktree list\` to check if this repo has multiple worktrees (only relevant if the user wants a personal CLAUDE.local.md)

Note what you could NOT figure out from code alone — these become interview questions.

## Phase 3: Fill in the gaps

Use AskUserQuestion to gather what you still need to write good CLAUDE.md files and skills. Ask only things the code can't answer.

If the user chose project CLAUDE.md or both: ask about codebase practices — non-obvious commands, gotchas, branch/PR conventions, required env setup, testing quirks. Skip things already in README or obvious from manifest files. Do not mark any options as "recommended" — this is about how their team works, not best practices.

If the user chose personal CLAUDE.local.md or both: ask about them, not the codebase. Do not mark any options as "recommended" — this is about their personal preferences, not best practices. Examples of questions:
  - 他们在团队中的角色是什么？（例如，"后端工程师"、"数据科学家"、"新员工入职"）
  - 他们对这个代码库及其语言/框架的熟悉程度如何？（这样 Claude 可以校准解释深度）
  - 他们是否有个人沙箱 URL、测试账户、API 密钥路径或本地设置细节 Claude 应该知道？
  - 仅在 Phase 2 找到多个 git worktree 时：询问他们的 worktree 是否嵌套在主仓库内（例如 \`.claude/worktrees/<name>/\`）或者是兄弟/外部（例如 \`../myrepo-feature/\`）。如果嵌套，向上文件查找会自动找到主仓库的 CLAUDE.local.md — 不需要特殊处理。如果是兄弟/外部，个人内容应该放在主目录文件中（例如 \`~/.claude/<project-name>-instructions.md\`），每个 worktree 获取一个单行 CLAUDE.local.md 存根来导入它：\`@~/.claude/<project-name>-instructions.md\`。永远不要把这个导入放在项目 CLAUDE.md 中 — 那会把个人引用检入团队共享文件。
  - 有任何沟通偏好吗？（例如，"简洁"、"总是解释权衡"、"不要在最后总结"）

**综合 Phase 2 发现的提案** — 例如，如果存在格式化器则 format-on-edit，如果存在测试则 \`/verify\` 技能，对于任何不是工作流而是指南的填空答案的 CLAUDE.md 说明。对于每个，选择适合的工件类型，**受限于 Phase 1 的技能+钩子选择**：

  - **钩子**（更严格）— 在工具事件上的确定性 shell 命令；Claude 不能跳过它。适用于机械的、快速的、每次编辑的步骤：格式化、linting、在更改的文件上运行快速测试。
  - **技能**（按需）— 你或 Claude 在需要时调用 \`/skill-name\`。适用于不属于每次编辑的工作流：深度验证、会话报告、部署。
  - **CLAUDE.md 说明**（更宽松）— 影响 Claude 的行为但不强制执行。适用于沟通/思考偏好："编码前计划"、"简洁"、"解释权衡"。

  **尊重 Phase 1 的技能+钩子选择作为硬过滤**：如果用户选择"仅技能"，将你建议的任何钩子降级为技能或 CLAUDE.md 说明。如果"仅钩子"，将技能降级为钩子（在机械可能的情况下）或说明。如果"都不"，所有内容都变成 CLAUDE.md 说明。永远不要提议用户未选择的工件类型。

**通过 AskUserQuestion 的 \`preview\` 字段显示提案，而不是作为单独的文本消息** — 对话框覆盖你的输出，所以前面的文本被隐藏。\`preview\` 字段在侧边栏中渲染 markdown（如计划模式）；\`question\` 字段是纯文本。将其结构化为：

  - \`question\`：简短且纯文本，例如 "这个提案看起来对吗？"
  - 每个选项都有一个 \`preview\`，其中包含完整的提案作为 markdown。"看起来不错 — 继续"选项的预览显示所有内容；每个下拉选项的预览显示删除该项后剩余的内容。
  - **保持预览紧凑 — 预览框会截断且没有滚动。** 每项一行，项之间没有空行，没有标题。示例预览内容：

    • **编辑时格式化钩子**（自动）— 通过 PostToolUse 使用 \`ruff format <file>\`
    • **/verify 技能**（按需）— \`make lint && make typecheck && make test\`
    • **CLAUDE.md 说明**（指南）— "在标记完成之前运行 lint/typecheck/test"

  - 选项标签保持简短（"看起来不错"、"放弃钩子"、"放弃技能"）— 工具会自动添加一个 "其他" 自由文本选项，因此不要自行添加万能选项。

**Build the preference queue** from the accepted proposal. Each entry: {type: hook|skill|note, description, target file, any Phase-2-sourced details like the actual test/format command}. Phases 4-7 consume this queue.

## Phase 4: 编写 CLAUDE.md（如果用户选择项目或两者）

在项目根目录编写一个精简的 CLAUDE.md。每一行都必须通过这个测试："删除这个会导致 Claude 犯错误吗？"如果不会，删除它。

**从 Phase 3 偏好队列中消费目标为 CLAUDE.md 的 \`note\` 条目**（团队级说明）— 将每个作为简洁的行添加到最相关的部分。这些是用户希望 Claude 遵循但不需要保证的行为（例如，"在实现之前提出计划"、"在重构时解释权衡"）。将个人目标的说明留到 Phase 5。

包含：
- Claude 无法猜测的构建/测试/lint 命令（非标准脚本、标志或序列）
- 与语言默认值不同的代码风格规则（例如，"优先使用 type 而不是 interface"）
- 测试说明和怪癖（例如，"运行单个测试：pytest -k 'test_name'"）
- 仓库礼仪（分支命名、PR 约定、提交风格）
- 所需的环境变量或设置步骤
- 非明显的陷阱或架构决策
- 如果存在，现有 AI 编码工具配置的重要部分（AGENTS.md、.cursor/rules、.cursorrules、.github/copilot-instructions.md、.windsurfrules、.clinerules）

排除：
- 逐文件结构或组件列表（Claude 可以通过阅读代码库发现这些）
- Claude 已经知道的标准语言约定
- 通用建议（"编写干净的代码"、"处理错误"）
- Detailed API docs or long references — use \`@path/to/import\` syntax instead (e.g., \`@docs/api-reference.md\`) to inline content on demand without bloating CLAUDE.md
- Information that changes frequently — reference the source with \`@path/to/import\` so Claude always reads the current version
- 冗长的教程或演练（移动到单独的文件并使用 \`@path/to/import\` 引用，或放在技能中）
- 从清单文件中显而易见命令（例如，标准的 "npm test"、"cargo test"、"pytest"）

要具体："在 TypeScript 中使用 2 空格缩进"比"正确格式化代码"更好。

不要重复自己，也不要编造"通用开发任务"或"开发技巧"等部分 — 仅包含你在读取的文件中明确发现的信息。

用以下内容作为文件前缀：

\`\`\`
# CLAUDE.md

此文件为 Claude Code (claude.ai/code) 在处理此代码库时提供指导。
\`\`\`

如果 CLAUDE.md 已经存在：阅读它，提出具体的更改作为差异，并解释为什么每个更改会改进它。不要静默覆盖。

对于有多个问题的项目，建议将说明组织为 \`.claude/rules/\` 中的单独聚焦文件（例如，\`code-style.md\`、\`testing.md\`、\`security.md\`）。这些会自动与 CLAUDE.md 一起加载，并且可以使用 \`paths\` 前 matter 限定到特定文件路径。

对于具有不同子目录的项目（monorepo、多模块项目等）：提及可以为特定于模块的说明添加子目录 CLAUDE.md 文件（当 Claude 在这些目录中工作时会自动加载它们）。如果用户想要，主动创建它们。

## Phase 5: 编写 CLAUDE.local.md（如果用户选择个人或两者）

在项目根目录编写一个精简的 CLAUDE.local.md。此文件会自动与 CLAUDE.md 一起加载。创建后，将 \`CLAUDE.local.md\` 添加到项目的 .gitignore 以保持私密。

**从 Phase 3 偏好队列中消费目标为 CLAUDE.local.md 的 \`note\` 条目**（个人级说明）— 将每个作为简洁的行添加。如果用户在 Phase 1 选择仅个人，这是 note 条目的唯一消费者。

包含：
- 用户的角色和对代码库的熟悉程度（这样 Claude 可以校准解释）
- 个人沙箱 URL、测试账户或本地设置细节
- 个人工作流或沟通偏好

保持简短 — 仅包含能让 Claude 的响应对该用户明显更好的内容。

如果 Phase 2 找到多个 git worktree 且用户确认他们使用兄弟/外部 worktree（不嵌套在主仓库内）：向上文件查找无法从所有 worktree 找到单个 CLAUDE.local.md。将实际个人内容写入 \`~/.claude/<project-name>-instructions.md\` 并使 CLAUDE.local.md 成为导入它的单行存根：\`@~/.claude/<project-name>-instructions.md\`。用户可以将此单行存根复制到每个兄弟 worktree。永远不要把这个导入放在项目 CLAUDE.md 中。如果 worktree 嵌套在主仓库内（例如，\`.claude/worktrees/\`），不需要特殊处理 — 主仓库的 CLAUDE.local.md 会自动找到。

如果 CLAUDE.local.md 已经存在：阅读它，提出具体的添加建议，不要静默覆盖。

## Phase 6: 建议并创建技能（如果用户选择"技能 + 钩子"或"仅技能"）

技能添加 Claude 可以按需使用的功能，而不会使每次会话都膨胀。

**首先，从 Phase 3 偏好队列中消费 \`skill\` 条目。** 每个队列技能偏好都变成针对用户描述量身定制的 SKILL.md。对于每个：
- 从偏好中命名（例如，"verify-deep"、"session-report"、"deploy-sandbox"）
- 使用用户在访谈中的原话以及 Phase 2 找到的内容（测试命令、报告格式、部署目标）编写正文。如果偏好映射到现有捆绑技能（例如，\`/verify\`），编写一个项目技能，在顶部添加用户的特定约束 — 告诉用户捆绑技能仍然存在，他们的是附加的。
- 如果偏好不够具体，询问快速跟进（例如，"verify-deep 应该运行哪个测试命令？"）

**然后建议额外技能**，超越队列，当你发现：
- 特定任务的参考知识（子系统的约定、模式、风格指南）
- 用户希望直接触发的可重复工作流（部署、修复问题、发布过程、验证更改）

对于每个建议的技能，提供：名称、一行目的，以及为什么适合这个仓库。

如果 \`.claude/skills/\` 已经存在技能，先审查它们。不要覆盖现有技能 — 仅提议与已有内容互补的新技能。

在 \`.claude/skills/<skill-name>/SKILL.md\` 创建每个技能：

\`\`\`yaml
---
name: <skill-name>
description: <技能的作用以及何时使用它>
---

<Claude 的说明>
\`\`\`

用户（\`/<skill-name>\`）和 Claude 默认都可以调用技能。对于有副作用的工作流（例如，\`/deploy\`、\`/fix-issue 123\`），添加 \`disable-model-invocation: true\` 以便只有用户可以触发它，并使用 \`$ARGUMENTS\` 接受输入。

## Phase 7: 建议额外优化

告诉用户你现在要建议一些额外的优化，因为 CLAUDE.md 和技能（如果选择）已经就位。

检查环境并询问你发现的每个差距（使用 AskUserQuestion）：

- **GitHub CLI**：运行 \`which gh\`（或在 Windows 上运行 \`where gh\`）。如果缺少并且项目使用 GitHub（检查 \`git remote -v\` 是否有 github.com），询问用户是否想安装它。解释 GitHub CLI 让 Claude 可以直接帮助提交、拉取请求、问题和代码审查。

- **Linting**：如果 Phase 2 没有找到 lint 配置（没有项目的语言的 .eslintrc、ruff.toml、.golangci.yml 等），询问用户是否希望 Claude 为这个代码库设置 linting。解释 linting 可以及早发现问题并为 Claude 提供对其编辑的快速反馈。

- **提案来源的钩子**（如果用户选择"技能 + 钩子"或"仅钩子"）：从 Phase 3 偏好队列中消费 \`hook\` 条目。如果 Phase 2 找到格式化器且队列没有格式化钩子，提供编辑时格式化作为后备。如果用户在 Phase 1 选择"都不"或"仅技能"，完全跳过此要点。

  对于每个钩子偏好（来自队列或格式化器后备）：

  1. 目标文件：基于 Phase 1 的 CLAUDE.md 选择默认 — 项目 → \`.claude/settings.json\`（团队共享，已提交）；个人 → \`.claude/settings.local.json\`。仅在用户在 Phase 1 选择"两者"或偏好不明确时询问。询问一次所有钩子，而不是每个钩子询问。

  2. 从偏好中选择事件和匹配器：
     - "每次编辑后" → \`PostToolUse\` 匹配器 \`Write|Edit\`
     - "当 Claude 完成时" / "在我审查之前" → \`Stop\` 事件（在每个回合结束时触发 — 包括只读回合）
     - "在运行 bash 之前" → \`PreToolUse\` 匹配器 \`Bash\`
     - "在提交之前"（字面 git-commit 门）→ **不是 hooks.json 钩子。** 匹配器无法按命令内容过滤 Bash，所以没有办法只针对 \`git commit\`。将其路由到 git pre-commit 钩子（\`.git/hooks/pre-commit\`、husky、pre-commit 框架）— 主动提供一个。如果用户实际上是指"在我审查和提交 Claude 的输出之前"，那是 \`Stop\` — 探究以消除歧义。
     如果偏好不明确，探究。

  3. **加载钩子引用**（每个 \`/init\` 运行一次，在第一个钩子之前）：使用 \`skill: 'update-config'\` 调用技能工具，参数以 \`[hooks-only]\` 开头，后跟一行你正在构建的内容的摘要 — 例如，\`[hooks-only] 为 .claude/settings.json 使用 ruff 构建 PostToolUse/Write|Edit 格式钩子\`。这会将钩子模式和验证流程加载到上下文中。后续钩子重用它 — 不要重新调用。

  4. 遵循技能的 **"构建钩子"** 流程：去重检查 → 为这个项目构建 → 管道测试原始 → 包装 → 写入 JSON → \`jq -e\` 验证 → 实时证明（对于可触发匹配器上的 \`Pre|PostToolUse\`）→ 清理 → 交接。目标文件和事件/匹配器来自上面的步骤 1-2。

对每个"是"采取行动，然后再继续。

## Phase 8: 摘要和下一步

回顾设置的内容 — 写入了哪些文件以及每个文件中包含的要点。提醒用户这些文件是一个起点：他们应该审查和调整它们，并且可以随时再次运行 \`/init\` 重新扫描。

然后告诉用户，你将根据发现的内容介绍一些优化代码库和 Claude Code 设置的建议。将它们呈现为单个格式良好的待办事项列表，其中每个项目都与这个仓库相关。将最有影响力的项目放在首位。

在构建列表时，进行这些检查并仅包含适用的内容：
- 如果检测到前端代码（React、Vue、Svelte 等）：\`/plugin install frontend-design@claude-plugins-official\` 给 Claude 提供设计原则和组件模式，以便它生成精美的 UI；\`/plugin install playwright@claude-plugins-official\` 让 Claude 启动真实浏览器，截取它构建的截图，并自行修复视觉错误。
- 如果你在 Phase 7 中发现差距（缺少 GitHub CLI、缺少 linting）且用户说不：在此列出它们，并附有一行原因说明为什么每个都有帮助。
- 如果测试缺失或稀疏：建议设置测试框架，以便 Claude 可以验证自己的更改。
- 为了帮助你使用评估创建技能并优化现有技能，Claude Code 有一个官方的技能创建器插件可以安装。使用 \`/plugin install skill-creator@claude-plugins-official\` 安装它，然后运行 \`/skill-creator <skill-name>\` 来创建新技能或优化任何现有技能。（始终包含这个。）
- 使用 \`/plugin\` 浏览官方插件 — 这些捆绑了技能、代理、钩子和 MCP 服务器，你可能会发现有帮助。你也可以创建自己的自定义插件与他人分享。（始终包含这个。）`

const command = {
  type: 'prompt',
  name: 'init',
  get description() {
    return feature('NEW_INIT') &&
      (process.env.USER_TYPE === 'ant' ||
        isEnvTruthy(process.env.CLAUDE_CODE_NEW_INIT))
      ? '初始化新的 CLAUDE.md 文件和可选的技能/挂钩，附带代码库文档'
      : '使用代码库文档初始化新的 CLAUDE.md 文件'
  },
  contentLength: 0, // Dynamic content
  progressMessage: '正在分析您的代码库',
  source: 'builtin',
  async getPromptForCommand() {
    maybeMarkProjectOnboardingComplete()

    return [
      {
        type: 'text',
        text:
          feature('NEW_INIT') &&
          (process.env.USER_TYPE === 'ant' ||
            isEnvTruthy(process.env.CLAUDE_CODE_NEW_INIT))
            ? NEW_INIT_PROMPT
            : OLD_INIT_PROMPT,
      },
    ]
  },
} satisfies Command

export default command
