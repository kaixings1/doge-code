import { AGENT_TOOL_NAME } from '../../tools/AgentTool/constants.js'
import { ASK_USER_QUESTION_TOOL_NAME } from '../../tools/AskUserQuestionTool/prompt.js'
import { ENTER_PLAN_MODE_TOOL_NAME } from '../../tools/EnterPlanModeTool/constants.js'
import { EXIT_PLAN_MODE_TOOL_NAME } from '../../tools/ExitPlanModeTool/constants.js'
import { SKILL_TOOL_NAME } from '../../tools/SkillTool/constants.js'
import { getIsGit } from '../../utils/git.js'
import { registerBundledSkill } from '../bundledSkills.js'

const MIN_AGENTS = 5
const MAX_AGENTS = 30

const WORKER_INSTRUCTIONS = `完成更改实现后：
1. **简化** — 调用 \`${SKILL_TOOL_NAME}\` 工具，使用 \`skill: "simplify"\` 来审查和清理你的更改。
2. **运行单元测试** — 运行项目的测试套件（检查 package.json 脚本、Makefile 目标或常见命令如 \`npm test\`、\`bun test\`、\`pytest\`、\`go test\`）。如果测试失败，修复它们。
3. **端到端测试** — 按照协调员提示（如下）中的 e2e 测试方案执行。如果方案说对此单元跳过 e2e，则跳过。
4. **提交并推送** — 用清晰的消息提交所有更改，推送分支，并使用 \`gh pr create\` 创建 PR。使用描述性标题。如果 \`gh\` 不可用或推送失败，在最终消息中注明。
5. **报告** — 以单行结尾：\`PR: <url>\` 以便协调员跟踪。如果没有创建 PR，以 \`PR: none — <reason>\` 结尾。`

function buildPrompt(instruction: string): string {
  return `# Batch: 并行工作编排

你正在跨此代码库编排一个大型可并行化的更改。

## 用户指令

${instruction}

## 阶段 1：研究和计划（计划模式）

现在调用 \`${ENTER_PLAN_MODE_TOOL_NAME}\` 工具进入计划模式，然后：

1. **理解范围。** 启动一个或多个子代理（在前台——你需要它们的结果）来深入研究此指令涉及的内容。找到所有需要更改的文件、模式和调用点。理解现有的约定，以便迁移保持一致。

2. **分解为独立单元。** 将工作分解为 ${MIN_AGENTS}–${MAX_AGENTS} 个自包含单元。每个单元必须：
   - 能够在隔离的 git worktree 中独立实现（与兄弟单元没有共享状态）
   - 能够独立合并，而不依赖其他单元的 PR 先合并
   - 大小大致均匀（拆分大单元，合并简单的单元）

   根据实际工作量调整数量：少量文件 → 接近 ${MIN_AGENTS}；数百个文件 → 接近 ${MAX_AGENTS}。优先按目录或模块切片，而不是任意文件列表。

3. **确定 e2e 测试方案。** 弄清楚工作人员如何验证其更改是否真正端到端有效——而不仅仅是单元测试通过。查找：
   - \`claude-in-chrome\` 技能或浏览器自动化工具（对于 UI 更改：点击受影响的流程，截图结果）
   - \`tmux\` 或 CLI 验证技能（对于 CLI 更改：交互式启动应用，测试更改行为）
   - 开发服务器 + curl 模式（对于 API 更改：启动服务器，访问受影响的端点）
   - 现有的 e2e/集成测试套件，工作人员可以运行

   如果你找不到具体的 e2e 路径，使用 \`${ASK_USER_QUESTION_TOOL_NAME}\` 工具询问用户如何端到端验证此更改。根据你找到的内容提供 2-3 个具体选项（例如："通过 chrome 扩展截图"、"运行 \`bun run dev\` 并 curl 端点"、"无 e2e——单元测试足够"）。不要跳过——工人无法自己询问用户。

   将方案编写为一组简短、具体的步骤，让工人能够自主执行。包括任何设置（启动开发服务器、先构建）和确切的命令/交互以进行验证。

4. **编写计划。** 在计划文件中，包括：
   - 你在研究期间发现的内容摘要
   - 工作单元的编号列表——每个单元：简短标题、涵盖的文件/目录列表、更改的简短描述
   - e2e 测试方案（或"跳过 e2e，因为……"如果用户选择了）
   - 你将给每个代理的确切工作说明（共享模板）

5. 调用 \`${EXIT_PLAN_MODE_TOOL_NAME}\` 提交计划以供审批。

## 阶段 2：启动工人（计划审批后）

一旦计划获得批准，使用 \`${AGENT_TOOL_NAME}\` 工具为每个工作单元生成一个后台代理。**所有代理必须使用 \`isolation: "worktree"\` 和 \`run_in_background: true\`。** 在单个消息块中启动它们，使它们并行运行。

对于每个代理，提示必须是完全自包含的。包括：
- 总体目标（用户的指令）
- 该单元的具体任务（标题、文件列表、更改描述——逐字从你的计划复制）
- 你发现的任何代码库约定，工人需要遵循
- 你的计划中的 e2e 测试方案（或"跳过 e2e，因为……"）
- 下面的工作说明，逐字复制：

\`\`\`
${WORKER_INSTRUCTIONS}
\`\`\`

除非有更具体的代理类型合适，否则使用 \`subagent_type: "general-purpose"\`。

## 阶段 3：跟踪进度

启动所有工人后，渲染初始状态表：

| # | 单元 | 状态 | PR |
|---|------|--------|----|
| 1 | <标题> | running | — |
| 2 | <标题> | running | — |

随着后台代理完成通知到达，从每个代理的结果中解析 \`PR: <url>\` 行，并使用更新的状态（\`done\` / \`failed\`）和 PR 链接重新渲染表格。对任何未生成 PR 的代理保留简短的失败说明。

当所有代理都已报告时，渲染最终表和一行摘要（例如，"24 个单元中有 22 个作为 PR 落地"）。
`
}

const NOT_A_GIT_REPO_MESSAGE = `这不是一个 git 仓库。\`/batch\` 命令需要一个 git 仓库，因为它会在隔离的 git worktree 中生成代理并从中创建 PR。请先初始化仓库，或在现有仓库中运行此命令。`

const MISSING_INSTRUCTION_MESSAGE = `提供描述你想要进行的批量更改的指令。

示例：
  /batch 从 react 迁移到 vue
  /batch 用原生等效替换所有 lodash 的使用
  /batch 为所有无类型函数参数添加类型注释`

export function registerBatchSkill(): void {
  registerBundledSkill({
    name: 'batch',
    description:
      '研究并规划大规模更改，然后在 5-30 个隔离的工作树代理中并行执行，每个代理都会打开一个 PR。',
    whenToUse:
      '当用户想要跨多个文件进行广泛的机械更改（迁移、重构、批量重命名）时使用，这些更改可以分解为独立的并行单元。',
    argumentHint: '<instruction>',
    userInvocable: true,
    disableModelInvocation: true,
    async getPromptForCommand(args) {
      const instruction = args.trim()
      if (!instruction) {
        return [{ type: 'text', text: MISSING_INSTRUCTION_MESSAGE }]
      }

      const isGit = await getIsGit()
      if (!isGit) {
        return [{ type: 'text', text: NOT_A_GIT_REPO_MESSAGE }]
      }

      return [{ type: 'text', text: buildPrompt(instruction) }]
    },
  })
}
