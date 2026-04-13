import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../../services/analytics/growthbook.js'
import { getSubscriptionType } from '../../../utils/auth.js'
import { hasEmbeddedSearchTools } from '../../../utils/embeddedTools.js'
import { isEnvDefinedFalsy, isEnvTruthy } from '../../../utils/envUtils.js'
import { isTeammate } from '../../../utils/teammate.js'
import { isInProcessTeammate } from '../../../utils/teammateContext.js'
import { FILE_READ_TOOL_NAME } from '../FileReadTool/prompt.js'
import { FILE_WRITE_TOOL_NAME } from '../FileWriteTool/prompt.js'
import { GLOB_TOOL_NAME } from '../GlobTool/prompt.js'
import { SEND_MESSAGE_TOOL_NAME } from '../SendMessageTool/constants.js'
import { AGENT_TOOL_NAME } from './constants.js'
import { isForkSubagentEnabled } from './forkSubagent.js'
import type { AgentDefinition } from './loadAgentsDir.js'

function getToolsDescription(agent: AgentDefinition): string {
  const { tools, disallowedTools } = agent
  const hasAllowlist = tools && tools.length > 0
  const hasDenylist = disallowedTools && disallowedTools.length > 0

  if (hasAllowlist && hasDenylist) {
    // 两者都定义：根据黑名单过滤白名单，以匹配运行时行为
    const denySet = new Set(disallowedTools)
    const effectiveTools = tools.filter(t => !denySet.has(t))
    if (effectiveTools.length === 0) {
      return '。
    }
    return effectiveTools.join(', ')
  } else if (hasAllowlist) {
    // 仅有白名单：显示可用的特定工。
    return tools.join(', ')
  } else if (hasDenylist) {
    // 仅有黑名单：显示“除 X, Y, Z 之外的所有工具。
    return `）${disallowedTools.join(', ')} 之外的所有工具`
  }
  // 无限。
  return '所有工。
}

/**
 * ）agent_listing_delta 附件消息格式化单行代理信息：
 * `- type: whenToUse (Tools: ...)`.
 */
export function formatAgentLine(agent: AgentDefinition): string {
  const toolsDescription = getToolsDescription(agent)
  return `- ${agent.agentType}: ${agent.whenToUse} (工具: ${toolsDescription})`
}

/**
 * 代理列表是否应作为附件消息注入，而不是嵌入工具描述中。
 * 当为 true 时，getPrompt() 返回静态描述，attachments.ts 会发）agent_listing_delta 附件。
 *
 * 动态代理列表约占缓存生）token ）10.2%：MCP 异步连接）reload-plugins 或权限模式变更会改变列表 ）描述改变 ）完整的工）schema 缓存失效。
 *
 * 可通过 CLAUDE_CODE_AGENT_LIST_IN_MESSAGES=true/false 覆盖测试。
 */
export function shouldInjectAgentListInMessages(): boolean {
  if (isEnvTruthy(process.env.CLAUDE_CODE_AGENT_LIST_IN_MESSAGES)) return true
  if (isEnvDefinedFalsy(process.env.CLAUDE_CODE_AGENT_LIST_IN_MESSAGES))
    return false
  return getFeatureValue_CACHED_MAY_BE_STALE('tengu_agent_list_attach', false)
}

export async function getPrompt(
  agentDefinitions: AgentDefinition[],
  isCoordinator?: boolean,
  allowedAgentTypes?: string[],
): Promise<string> {
  // ）Agent(x,y) 限制了可生成的代理类型时，根据允许的类型过滤代理
  const effectiveAgents = allowedAgentTypes
    ? agentDefinitions.filter(a => allowedAgentTypes.includes(a.agentType))
    : agentDefinitions

  // 分叉子代理特性：启用时，插入“何时分叉”章。
  // （分叉语义、指令式提示）并替换为支持分叉的示例。
  const forkEnabled = isForkSubagentEnabled()

  const whenToForkSection = forkEnabled
    ? `

## 何时分叉

当中间工具的输出不值得保留在你的上下文中时，就分叉自己（省）\`subagent_type\`）。判断标准是定性的——即“我之后还会需要这个输出吗”——而不是任务大小。
- **调研**：对于开放式问题，使用分叉。如果调研可以拆分为独立的子问题，可以在一条消息中并行启动多个分叉。对于这种情况，分叉优于启动全新子代理——它会继承上下文并共享你的缓存。
- **实现**：对于需要超过几次编辑的实现工作，优先使用分叉。在动手实现之前先做好调研。

分叉非常轻量，因为它们共享父进程的提示缓存。不要在分叉上设）\`model\`——不同的模型无法重用父进程的缓存。传递一个简短的 \`name\`（一两个词，小写），以便用户能在团队面板中看到该分叉并在运行过程中引导它。

**不要偷看）* 工具结果中包含一）\`output_file\` 路径——除非用户明确要求进度检查，否则不要读取）tail 该文件。你会收到完成通知；相信它。中途读取输出文件会将分叉的工具噪音拉入你的上下文，这违背了分叉的目的。

**不要抢跑）* 启动分叉后，你对分叉发现了什么一无所知。绝不要以任何形式（无论是散文、摘要还是结构化输出）捏造或预测分叉结果。通知会在后续轮次中以用户角色的消息到达；它永远不是你自己写的。如果在通知到达之前用户追问后续问题，告诉他们分叉仍在运行——提供状态，而不是猜测。

**编写分叉提示）* 由于分叉会继承你的上下文，提示是一）指令*——说明要做什么，而不是当前情况是什么。明确指出范围：包含什么、排除什么、另一个代理在处理什么。不要重复背景。
`
    : ''

  const writingThePromptSection = `

## 编写提示

${forkEnabled ? '当生成一个全新的代理（带）`subagent_type`）时，它从零上下文开始。 : ''}像对待一个刚走进房间的聪明同事一样给代理下达指令——它没有看到之前的对话，不知道你尝试过什么，也不明白为什么这个任务很重要。
- 解释你试图达成什么目标以及为什么。
- 描述你已经了解或排除的信息。
- 提供足够的背景上下文，让代理能够做出判断，而不仅仅是遵循狭窄的指令。
- 如果你需要简短回复，请说明（）00 字以内报告”）。
- 查询：直接给出具体命令。调查：直接给出问题——当前提错误时，预设的步骤只会成为累赘。

${forkEnabled ? '对于全新代理。 : ''}简短的命令式提示会产生肤浅、泛泛的结果。

**永远不要委托理解）* 不要写“根据你的发现修）bug”或“基于调研实现它”。这些短语把综合任务推给了代理，而不是你自己完成。写出能证明你理解的提示：包含文件路径、行号、具体要修改什么。
`

  const forkExamples = `示例用法。

<示例>
用户：“这个分支距离可以发布还缺什么？。
助手）思）对此使用分叉——这是一个调查问题。我想要待办清单，而不是将 git 输出塞进我的上下文）/思。
${AGENT_TOOL_NAME}({
  name: "ship-audit",
  description: "分支发布就绪度审）,
  prompt: "审计这个分支在发布前还缺什么。检查：未提交的更改、领）main 分支的提交、是否存在测试、GrowthBook 门控是否已连接、与 CI 相关的文件是否发生了变化。报告待办清单——已完成 vs. 缺失）00 字以内。
})
助手：发布就绪度审计正在运行。
<评注>
当前轮次结束。协调者此时对审计结果一无所知。接下来是另一个轮次——通知从外部到达，是一条用户角色的消息。不是由协调者自己编写的。
</评注>
[后续轮次——通知作为用户消息到达]
助手：审计完成了。三个阻塞项：新提示路径没有测试，GrowthBook 门控已连接但不在 build_flags.yaml 中，还有一个未提交的文件。
</示例>

<示例>
用户：“所以门控到底有没有接好。
<评注>
用户在等待过程中提问。审计分叉正是为了回答这个问题而启动的，但尚未返回结果。协调者没有这个答案。给出状态，而不是捏造结果。
</评注>
助手：仍在等待审计结果——那正是它正在检查的事项之一。应该很快就到。
</示例>

<示例>
用户：“你能再找个人看看这个迁移是否安全吗？。
助手）思）我会调用 code-reviewer 代理——它看不到我的分析，所以可以给出独立的判断）/思。
<评注>
指定）subagent_type，因此代理是全新启动的。它需要在提示中获得完整的背景信息。这个说明解释了要评估什么以及为什么。
</评注>
${AGENT_TOOL_NAME}({
  name: "migration-review",
  description: "独立的迁移复）,
  subagent_type: "code-reviewer",
  prompt: "复核迁移 0042_user_schema.sql 的安全性。背景：我们要向一）5000 万行的表中添加一）NOT NULL 列。现有行会回填一个默认值。我想得到关于并发写入下回填方法是否安全的第二意见——我已经检查了锁行为，但希望独立验证。报告：是否安全，如果不安全，具体哪里会出问题？"
})
</示例>
`

  const currentExamples = `示例用法。

<示例_代理描述>
"test-runner": 在完成代码编写后使用此代理运行测。
"greeting-responder": 使用此代理以友好的笑话回应用户的问。
</示例_代理描述>

<示例>
用户：“请写一个检查数字是否为质数的函数。
助手：我将使）${FILE_WRITE_TOOL_NAME} 工具编写以下代码。
<code>
function isPrime(n) {
  if (n <= 1) return false
  for (let i = 2; i * i <= n; i++) {
    if (n % i === 0) return false
  }
  return true
}
</code>
<评注>
因为编写了一段重要的代码并且任务已完成，现在使用 test-runner 代理运行测试
</评注>
助手：使）${AGENT_TOOL_NAME} 工具启动 test-runner 代理
</示例>

<示例>
用户：“你好。
<评注>
因为用户打招呼，使用 greeting-responder 代理以友好的笑话回应
</评注>
助手：“我将使）${AGENT_TOOL_NAME} 工具启动 greeting-responder 代理。
</示例>
`

  // 当开关打开时，代理列表位于 agent_listing_delta 附件中（）attachments.ts），而不是内联在此处。
  // 这可以保持工具描述在 MCP/插件/权限变更时静态不变，从而避免每次加载代理时工具块提示缓存失效。
  const listViaAttachment = shouldInjectAgentListInMessages()

  const agentListSection = listViaAttachment
    ? `可用的代理类型会在对话的 <system-reminder> 消息中列出。`
    : `可用的代理类型及其可访问的工具：
${effectiveAgents.map(agent => formatAgentLine(agent)).join('\n')}`

  // 协调者模式和非协调者模式共享的核心提示
  const shared = `启动一个新代理以自动处理复杂的多步骤任务。

${AGENT_TOOL_NAME} 工具启动专门的代理（子进程），它们自主处理复杂任务。每种代理类型都有特定的功能和可用的工具。

${agentListSection}

${
  forkEnabled
    ? `使用 ${AGENT_TOOL_NAME} 工具时，指定 subagent_type 以使用专门的代理，或省略它以分叉自己 ）分叉将继承你的完整对话上下文。`
    : `使用 ${AGENT_TOOL_NAME} 工具时，指定 subagent_type 参数以选择要使用的代理类型。如果省略，则使用通用代理。`
}`

  // 协调者模式使用精简提示——协调者的系统提示已经涵盖了使用说明、示例和何时不使用。
  if (isCoordinator) {
    return shared
  }

  // Ant 原生构建会将 find/grep 别名为嵌入式 bfs/ugrep，并移除专用）Glob/Grep 工具，因此通过 Bash 指向 find。
  const embedded = hasEmbeddedSearchTools()
  const fileSearchHint = embedded
    ? '通过 Bash 工具使用 `find`'
    : `${GLOB_TOOL_NAME} 工具`
  // “class Foo”示例是关于内容搜索的。非嵌入式保）Glob（原意：查找包含内容的文件）。嵌入式则使）grep，因）find -name 不查看文件内容。
  const contentSearchHint = embedded
    ? '通过 Bash 工具使用 `grep`'
    : `${GLOB_TOOL_NAME} 工具`
  const whenNotToUseSection = forkEnabled
    ? ''
    : `
何时不使）${AGENT_TOOL_NAME} 工具。
- 如果你想读取特定文件路径，使）${FILE_READ_TOOL_NAME} 工具）${fileSearchHint} 而非 ${AGENT_TOOL_NAME} 工具，可以更快找到匹。
- 如果你正在搜索特定类定义）"class Foo"，使）${contentSearchHint} 可以更快找到匹配
- 如果你正在搜索特定文件或 2-3 个文件中的代码，使用 ${FILE_READ_TOOL_NAME} 工具而非 ${AGENT_TOOL_NAME} 工具，可以更快找到匹。
- 与上方代理描述无关的其他任务
`

  // 当通过附件列出时，“启动多个代理”的注意事项在附件消息中（根据订阅条件）。当内联时，保留现有的每次调）getSubscriptionType() 检查。
  const concurrencyNote =
    !listViaAttachment && getSubscriptionType() !== 'pro'
      ? `
- 尽可能同时启动多个代理，以最大化性能；为此，使用包含多个工具使用的单条消息`
      : ''

  // 非协调者模式获得包含所有章节的完整提示
  return `${shared}
${whenNotToUseSection}

使用说明。
- 始终包含一个简短的描述）-5 个词），概括代理将要做什）{concurrencyNote}
- 代理完成后，它会向您返回一条消息。代理返回的结果对用户不可见。要向用户展示结果，您应该回发一条文本消息，简明扼要地总结结果）{
    // eslint-disable-next-line custom-rules/no-process-env-top-level
    !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS) &&
    !isInProcessTeammate() &&
    !forkEnabled
      ? `
- 您可以选择使用 run_in_background 参数在后台运行代理。当代理在后台运行时，您会在它完成时自动收到通知——不）sleep、轮询或主动检查其进度。继续其他工作或回应用户即可。
- **前台 vs 后台**：当您需要代理的结果才能继续推进时，使用前台（默认——例如，调研代理的发现会指导您的后续步骤。当您有真正独立的工作需要并行处理时，使用后台。`
      : ''
  }
- 要继续之前生成的代理，请使用 ${SEND_MESSAGE_TOOL_NAME} 工具，并将代理的 ID 或名称作）\`to\` 字段。代理将以其完整的上下文恢复执行）{forkEnabled ? '每次使用 subagent_type 调用全新代理时，都没有上下文——请提供完整的任务描述。 : '每次代理调用都是全新的——请提供完整的任务描述）}
- 代理的输出通常应被信任
- 清晰地告诉代理您是希望它编写代码，还是只做调研（搜索、文件读取、网络获取等）{forkEnabled ? '' : '，因为它不了解用户的意图'}
- 如果代理描述中提到应主动使用它，那么您应尽力在用户要求之前就使用它。请自行判断。
- 如果用户指定要“并行”运行代理，您必须发送一条包含多）${AGENT_TOOL_NAME} 工具使用内容块的消息。例如，如果您需要同时启）build-validator 代理）test-runner 代理，请发送一条同时包含两个工具调用的消息。
- 您可以选择设置 \`isolation: "worktree"\` 以在临时 git worktree 中运行代理，从而为它提供一个隔离的仓库副本。如果代理没有做出任何更改，worktree 会自动清理；如果做出了更改，结果中会返回 worktree 路径和分支）{
    process.env.USER_TYPE === 'ant'
      ? `\n- 您可以设）\`isolation: "remote"\` 以在远程 CCR 环境中运行代理。这始终是一个后台任务；完成后您会收到通知。适用于需要全新沙箱的长时间运行任务。`
      : ''
  }${
    isInProcessTeammate()
      ? `
- run_in_background、name、team_name ）mode 参数在此上下文中不可用。仅支持同步子代理。`
      : isTeammate()
        ? `
- name、team_name ）mode 参数在此上下文中不可用——队友无法生成其他队友。请省略它们以生成子代理。`
        : ''
  }${whenToForkSection}${writingThePromptSection}

${forkEnabled ? forkExamples : currentExamples}`
}