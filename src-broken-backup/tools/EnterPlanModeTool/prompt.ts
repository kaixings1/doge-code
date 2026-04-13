import { isPlanModeInterviewPhaseEnabled } from '../../../utils/planModeV2.js'
import { ASK_USER_QUESTION_TOOL_NAME } from '../AskUserQuestionTool/prompt.js'

const WHAT_HAPPENS_SECTION = `## What Happens in Plan Mode

In plan mode, you'll:
1. Thoroughly explore the codebase using Glob, Grep, and Read tools
2. Understand existing patterns and architecture
3. Design an implementation approach
4. Present your plan to the user for approval
5. Use ${ASK_USER_QUESTION_TOOL_NAME} if you need to clarify approaches
6. Exit plan mode with ExitPlanMode when ready to implement

`

function getEnterPlanModeToolPromptExternal(): string {
  // When interview phase is enabled, omit the "What Happens" section 。
  // detailed workflow instructions arrive via the plan_mode attachment (messages.ts).
  const whatHappens = isPlanModeInterviewPhaseEnabled()
    ? ''
    : WHAT_HAPPENS_SECTION

  return `当你准备开始非平凡的实现任务时，主动使用此工具。在编写代码之前获得用户对你的方法的认可可以防止浪费的工作并确保一致性。此工具将过渡到计划模式，你可以在其中探索代码库并设计实现方法以供用户审批。

## 何时使用此工。

**优先使用 EnterPlanMode** 用于实现任务，除非它们很简单。当满足以下 ANY 条件时使用：

1. **新功能实）*：添加有意义的的新功。
   - 例如）添加注销按钮" —）应该放在哪里？点击后会发生什么？
   - 例如）添加表单验证" —）什么规则？什么错误消息？

2. **多种有效方法**：任务可以通过几种不同的方式解。
   - 例如））API 添加缓存" —）可以使用 Redis、内存、基于文件等
   - 例如）提高性能" —）许多优化策略可。

3. **代码修改**：影响现有行为或结构的更。
   - 例如）更新登录流程" —）具体应该更改什么？
   - 例如）重构此组。 —）目标架构是什么？

4. **架构决策**：任务需要在模式或技术之间进行选择
   - 例如）添加实时更新" —）WebSocket vs SSE vs 轮询
   - 例如）实现状态管。 —）Redux vs Context vs 自定义解决方。

5. **多文件更）*：任务可能会触及 2-3 个以上的文件
   - 例如）重构身份验证系统"
   - 例如）添加新的 API 端点及测。

6. **需求不明确**：你需要在理解完整范围之前进行探索
   - 例如）让应用更。 —）需要分析并识别瓶颈
   - 例如）修复结账中的 bug" —）需要调查根本原。

7. **用户偏好很重）*：实现可以合理地以多种方式进。
   - 如果你想使用 ${ASK_USER_QUESTION_TOOL_NAME} 来澄清方法，则改）EnterPlanMode
   - 计划模式允许你先探索，然后带着上下文呈现选项

## 何时不使用此工具

仅对简单任务跳）EnterPlanMode。
- 单行或少量行的修复（拼写错误、明显的 bug、小的调整）
- 添加具有明确需求的单个函数
- 用户给出了非常具体、详细指示的任务
- 纯粹的研）探索任务（改用带有探索代理的 Agent 工具。

${whatHappens}## 示例

### 好的 —）使用 EnterPlanMode。
用户）为应用添加用户身份验。
- 需要架构决策（session vs JWT，在哪里存储令牌，中间件结构。

用户）优化数据库查。
- 多种方法可选，需要先分析，影响重。

用户）实现深色模式"
- 关于主题系统的架构决策，影响许多组件

用户）在用户配置文件中添加删除按钮"
- 看起来简单但涉及：放在哪里，确认对话框，API 调用，错误处理，状态更。

用户）更新 API 中的错误处理"
- 影响多个文件，用户应该审批方。

### 不好）—）不要使用 EnterPlanMode。
用户）修复 README 中的拼写错误"
- 直接明了，不需要规。

用户）添加 console.log 来调试这个函。
- 简单，明显的实。

用户）哪些文件处理路由。
- 研究任务，不是实现规。

## 重要提示

- 此工具需要用户审）—）他们必须同意进入计划模式
- 如果不确定是否使用它，倾向于规）—）最好先达成一致，而不是返。
- 用户 appreciates 在对他们的代码库进行重大更改之前被咨。
`
}

function getEnterPlanModeToolPromptAnt(): string {
  // When interview phase is enabled, omit the "What Happens" section 。
  // detailed workflow instructions arrive via the plan_mode attachment (messages.ts).
  const whatHappens = isPlanModeInterviewPhaseEnabled()
    ? ''
    : WHAT_HAPPENS_SECTION

  return `当任务存在真正的歧义，关于正确的方法是什么，并且在编写代码之前获取用户输入可以防止大量返工时，使用此工具。此工具将过渡到计划模式，你可以在其中探索代码库并设计实现方法以供用户审批。

## 何时使用此工。

当实现方法真正不明确时，计划模式很有价值。当以下情况时使用：

1. **重大的架构歧）*：存在多种合理的方法，且选择）meaningful地影响代码库
   - 例如））API 添加缓存" —）Redis vs 内存 vs 基于文件
   - 例如）添加实时更新" —）WebSocket vs SSE vs 轮询

2. **需求不明确**：你需要在取得进展之前进行探索和澄。
   - 例如）让应用更。 —）需要分析并识别瓶颈
   - 例如）重构此模。 —）需要理解目标架构应该是什。

3. **高影响重）*：任务将显著重组现有代码，并且事先获得认可可以降低风。
   - 例如）重新设计身份验证系统"
   - 例如）从一种状态管理方法迁移到另一。

## 何时不使用此工具

当你可以合理地推断出正确方法时，跳过计划模式。
- 任务很直接，即使触及多个文件
- 用户的请求足够具体，实现路径清晰
- 你正在添加具有明显实现模式的特性（例如添加按钮、遵循现有约定的新端点）
- bug 修复，一旦理）bug，修复就很清。
- 研究/探索任务（改）Agent 工具。
- 用户）我们可以）X ））让我们做 X" —）直接开始工。

当不确定时，倾向于开始工作并使用 ${ASK_USER_QUESTION_TOOL_NAME} 提出具体问题，而不是进入完整的规划阶段。

${whatHappens}## 示例

### 好的 —）使用 EnterPlanMode。
用户）为应用添加用户身份验。
- 真正的歧义：session vs JWT，在哪里存储令牌，中间件结构

用户）重新设计数据管道"
- 主要的重组，错误的方法会浪费大量精力

### 不好）—）不要使用 EnterPlanMode。
用户）在用户配置文件中添加删除按钮"
- 实现路径清晰；直接做就好

用户）我们可以研究搜索功能吗？"
- 用户想开始工作，不是规划

用户）更新 API 中的错误处理"
- 开始工作；如果需要，提出具体问题

用户）修复 README 中的拼写错误"
- 直接明了，不需要规。

## 重要提示

- 此工具需要用户审）—）他们必须同意进入计划模式
`
}

export function getEnterPlanModeToolPrompt(): string {
  return process.env.USER_TYPE === 'ant'
    ? getEnterPlanModeToolPromptAnt()
    : getEnterPlanModeToolPromptExternal()
}
