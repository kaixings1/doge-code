import { AGENT_TOOL_NAME } from '../../../tools/AgentTool/constants.js';
import { ASK_USER_QUESTION_TOOL_NAME } from '../../../tools/AskUserQuestionTool/prompt.js';
import { ENTER_PLAN_MODE_TOOL_NAME } from '../../../tools/EnterPlanModeTool/constants.js';
import { EXIT_PLAN_MODE_TOOL_NAME } from '../../../tools/ExitPlanModeTool/constants.js';
import { SKILL_TOOL_NAME } from '../../../tools/SkillTool/constants.js';
import { getIsGit } from '../../../utils/git.js';
import { registerBundledSkill } from '../bundledSkills.js';

const MIN_AGENTS = 5; // 最小代理数。
const MAX_AGENTS = 30; // 最大代理数。

const WORKER_INSTRUCTIONS = `完成变更实现后：
1. **简）* - 调用\`${SKILL_TOOL_NAME}\`工具，使用\`skill: "simplify"\`来审查和清理你的更改。
2. **运行单元测试** - 运行项目的测试套件（检查package.json脚本、Makefile目标或常见命令如\`npm test\`、\`bun test\`、\`pytest\`、\`go test\`）。如果测试失败，修复它们。
3. **端到端测）* - 按照协调者提示中的端到端测试配方（见下文）。如果配方中说明此单元跳过端到端测试，则跳过。
4. **提交和推）* - 用清晰的消息提交所有更改，推送分支，并使用\`gh pr create\`创建PR。使用描述性标题。如果\`gh\`不可用或推送失败，请在最终消息中注明。
5. **报告** - 以单行结束：\`PR: <url>\`以便协调者可以跟踪。如果未创建PR，以\`PR: ）- <原因>\`结束。

**你必须始终用中文回复）*`;

function buildPrompt(instruction: string): string {
  return `# 批处理：并行工作编排

你正在编排跨此代码库的大规模、可并行化的更改。

## 用户指令

${instruction}

## 阶段1：研究和计划（计划模式）

现在调用\`${ENTER_PLAN_MODE_TOOL_NAME}\`工具进入计划模式，然后：

1. **理解范围**。启动一个或多个子代理（在前）- 你需要它们的结果）深入研究此指令触及的内容。查找所有需要更改的文件、模式和调用点。理解现有约定，使迁移保持一致。

2. **分解为独立单）*。将工作分解）{MIN_AGENTS}-${MAX_AGENTS}个自包含单元。每个单元必须：
   - 可在隔离的git工作树中独立实现（不与兄弟单元共享状态）
   - 可独立合并，而不依赖于另一个单元的PR首先落地
   - 大小大致均匀（拆分大单元，合并琐碎的单元。

   根据实际工作调整数量：少文件 ）接近${MIN_AGENTS}；数百文））接近${MAX_AGENTS}。优先按目录或模块切片，而不是任意的文件列表。

3. **确定端到端测试配）*。弄清楚工作者如何验证其更改确实在端到端上工）- 而不仅仅是单元测试通过。寻找：
   - 一个\`claude-in-chrome\`技能或浏览器自动化工具（对于UI更改：点击受影响的流程，截图结果。
   - 一个\`tmux\`或CLI验证器技能（对于CLI更改：交互式启动应用，执行更改的行为。
   - 一个开发服务器 + curl模式（对于API更改：启动服务器，调用受影响的端点）
   - 工作者可以运行的现有端到）集成测试套件

   如果找不到具体的端到端路径，使用\`${ASK_USER_QUESTION_TOOL_NAME}\`工具询问用户如何端到端验证此更改。根据你的发现提）-3个具体选项（例如，"通过chrome扩展截图"）运行\`bun run dev\`并curl端点"）无端到端测试 - 单元测试已足））。不要跳过此步骤 - 工作者自己不能询问用户。

   将配方写成简短、具体的一组步骤，工作者可以自主执行。包括任何设置（启动开发服务器，首先构建）和确切的命令/交互来验证。

4. **编写计划**。在你的计划文件中，包括。
   - 研究期间发现的内容摘。
   - 工作单元编号列表 - 每个：简短标题、覆盖的文件/目录列表、更改的一行描。
   - 端到端测试配方（）跳过端到端测试，因为..."，如果用户选择了此选项。
   - 你将给每个代理的确切工作者指令（共享模板。

5. 调用\`${EXIT_PLAN_MODE_TOOL_NAME}\`呈现计划以供批准。

## 阶段2：生成工作者（计划批准后）

计划批准后，使用\`${AGENT_TOOL_NAME}\`工具为每个工作单元生成一个后台代理）*所有代理必须使用\`isolation: "工作）\`和\`run_in_background: true\`）* 在一个消息块中启动所有代理，使它们并行运行。

对于每个代理，提示必须完全自包含。包括：
- 总体目标（用户的指令。
- 此单元的特定任务（标题、文件列表、更改描）- 从你的计划中逐字复制。
- 你发现的任何工作者需要遵循的代码库约。
- 你计划中的端到端测试配方（或"跳过端到端测试，因为..."。
- 以下工作者指令，逐字复制。

\`\`\`
${WORKER_INSTRUCTIONS}
\`\`\`

使用\`subagent_type: "通用目的"\`，除非更具体的代理类型适合。

## 阶段3：跟踪进。

启动所有工作者后，渲染初始状态表。

| # | 单元 | 状）| PR |
|---|------|--------|----|
| 1 | <标题> | 运行）| - |
| 2 | <标题> | 运行）| - |

当后台代理完成通知到达时，从每个代理的结果中解析\`PR: <url>\`行，并重新渲染带有更新状态（\`完成\` / \`失败\`）和PR链接的表。为任何未产生PR的代理保留简短失败说明。

当所有代理都报告后，渲染最终表格和一行摘要（例如）22/24个单元已作为PR落地"）。
`;
}

const NOT_A_GIT_REPO_MESSAGE = `这不是git仓库）batch命令需要git仓库，因为它在隔离的git工作树中生成代理，并从每个代理创建PR。首先初始化仓库，或从现有仓库内运行此命令。`;

const MISSING_INSTRUCTION_MESSAGE = `提供描述你想要进行的批处理更改的指令。

示例。
  /batch 从react迁移到vue
  /batch 将所有lodash用法替换为原生等效物
  /batch 为所有无类型的函数参数添加类型注解`;

export function registerBatchSkill(): void {
  registerBundledSkill({
    name: 'batch',
    description: '研究并规划大规模更改，然后在5-30个隔离的工作树代理中并行执行，每个代理都会打开一个PR）,
    whenToUse: '当用户想要在多个文件中进行大规模的机械性更改时使用（迁移、重构、批量重命名），这些更改可以分解为独立的并行单元）,
    argumentHint: '<指令>',
    userInvocable: true,
    disableModelInvocation: true,
    async getPromptForCommand(args) {
      const instruction = args.trim();
      if (!instruction) {
        return [{ type: 'text', text: MISSING_INSTRUCTION_MESSAGE }];
      }

      const isGit = await getIsGit();
      if (!isGit) {
        return [{ type: 'text', text: NOT_A_GIT_REPO_MESSAGE }];
      }

      return [{ type: 'text', text: buildPrompt(instruction) }];
    },
  });
}