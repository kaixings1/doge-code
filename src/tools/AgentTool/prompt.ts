import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import { getSubscriptionType } from '../../utils/auth.js'
import { hasEmbeddedSearchTools } from '../../utils/embeddedTools.js'
import { isEnvDefinedFalsy, isEnvTruthy } from '../../utils/envUtils.js'
import { isTeammate } from '../../utils/teammate.js'
import { isInProcessTeammate } from '../../utils/teammateContext.js'
import { FILE_READ_TOOL_NAME } from '../FileReadTool/prompt.js'
import { FILE_WRITE_TOOL_NAME } from '../FileWriteTool/prompt.js'
import { GLOB_TOOL_NAME } from '../GlobTool/prompt.js'
import { SEND_MESSAGE_TOOL_NAME } from '../SendMessageTool/constants.js'
import { AGENT_TOOL_NAME } from './constants.js'
import { isForkSubagentEnabled } from './forkSubagent.js'
import type { AgentDefinition } from './loadAgentsDir.js'

/**
 * 获取代理可用的工具描述字符串
 * @param agent 代理定义
 * @returns 工具列表描述，如 "工具A, 工具B" 或 "除工具C外的所有工具"
 */
function getToolsDescription(agent: AgentDefinition): string {
  const { tools, disallowedTools } = agent
  const hasAllowlist = tools && tools.length > 0
  const hasDenylist = disallowedTools && disallowedTools.length > 0

  if (hasAllowlist && hasDenylist) {
    // 同时定义了白名单和黑名单：从白名单中过滤掉黑名单项（与运行时实际行为一致）
    const denySet = new Set(disallowedTools)
    const effectiveTools = tools.filter(t => !denySet.has(t))
    return effectiveTools.length === 0 ? '无' : effectiveTools.join(', ')
  }
  if (hasAllowlist) {
    // 仅白名单：显示明确允许的工具
    return tools.join(', ')
  }
  if (hasDenylist) {
    // 仅黑名单：显示 "除 X, Y, Z 外的所有工具"
    return `除 ${disallowedTools.join(', ')} 外的所有工具`
  }
  return '所有工具'
}

/**
 * 格式化单条代理信息，用于 agent_listing_delta 附件消息
 * 格式：`- type: whenToUse (工具: ...)`
 */
export function formatAgentLine(agent: AgentDefinition): string {
  return `- ${agent.agentType}: ${agent.whenToUse} (工具: ${getToolsDescription(agent)})`
}

/**
 * 决定代理列表是否应作为附件消息注入，而非嵌入在工具描述中。
 * 动态代理列表曾占舰队缓存创建 token 的约 10.2%，因 MCP 异步连接、/reload-plugins 或权限变更
 * 会导致描述变化，进而使整个工具架构缓存失效。
 *
 * 可通过 CLAUDE_CODE_AGENT_LIST_IN_MESSAGES=true/false 覆盖。
 */
export function shouldInjectAgentListInMessages(): boolean {
  if (isEnvTruthy(process.env.CLAUDE_CODE_AGENT_LIST_IN_MESSAGES)) return true
  if (isEnvDefinedFalsy(process.env.CLAUDE_CODE_AGENT_LIST_IN_MESSAGES)) return false
  return getFeatureValue_CACHED_MAY_BE_STALE('tengu_agent_list_attach', false)
}

/**
 * 生成代理工具的提示词
 * @param agentDefinitions 所有代理定义
 * @param isCoordinator 是否为协调者模式
 * @param allowedAgentTypes 允许的代理类型过滤列表
 */
export async function getPrompt(
  agentDefinitions: AgentDefinition[],
  isCoordinator?: boolean,
  allowedAgentTypes?: string[],
): Promise<string> {
  // 根据允许的类型过滤代理列表
  const effectiveAgents = allowedAgentTypes
    ? agentDefinitions.filter(a => allowedAgentTypes.includes(a.agentType))
    : agentDefinitions

  const forkEnabled = isForkSubagentEnabled()

  // 分支（Fork）子代理说明（仅当功能启用时）
  const whenToForkSection = forkEnabled
    ? `

## 何时使用分支（Fork）

当中间步骤产生的工具输出不值得长期保留在上下文中时，应省略 \`subagent_type\` 直接 fork 自身。判断标准是定性的：“我后续是否还会用到这些输出？”，而非任务规模大小。
- **调研**：对开放性问题使用 fork。若问题可拆解为多个独立子问题，可在一条消息中并行启动多个 fork。这优于新建子代理，因为 fork 继承上下文且共享缓存。
- **实现**：涉及多步修改的实现任务建议使用 fork。实施前请先完成必要的调研。

Fork 因共享提示缓存而成本低廉。不要在 fork 上设置 \`model\` 参数——不同模型无法复用父级缓存。传入简短的 \`name\`（一至两个单词，小写），方便用户在团队面板中查看并在运行中途进行引导。

**不要偷看结果。** 工具结果中包含 \`output_file\` 路径——除非用户明确要求查看进度，否则不要读取或跟踪该文件。中途读取对话记录会将 fork 内部的工具调用噪声带入你的上下文，这完全违背了 fork 的初衷。

**不要猜测结果。** 启动后，你对 fork 的发现一无所知。切勿以任何形式凭空编造或预测 fork 的结果，无论是自然语言叙述、摘要总结还是结构化数据输出。完成通知会在后续轮次中以用户角色消息的形式到达，它**绝不是**由你本人写出的内容。若用户在通知到达前追问，告知其 fork 仍在运行——只给状态，不做猜测。

**编写 fork 提示。** 因 fork 继承你的上下文，提示应是**指令性**的——告诉它做什么，而非解释背景情况。明确范围：包含什么、排除什么、其他代理在负责什么。无需重复解释已存在于上下文中的背景信息。
`
    : ''

  // 提示词编写指导
  const writingThePromptSection = `

## 编写提示词

${forkEnabled ? '启动全新代理（指定了 subagent_type）时，它启动时没有任何对话历史。' : ''}请向代理简要说明情况，如同对刚走进房间的聪明同事说话——它没看到这段对话，不知道你尝试过什么，也不理解任务的意义所在。
- 解释你要完成什么目标以及为什么。
- 描述你已经了解到或排除掉的信息。
- 提供足够的问题背景，使代理能做判断而不仅执行狭窄指令。
- 若只需简短回复，请明确说明（如“200字以内汇报”）。
- 查询类任务：给出精确命令。调研类任务：给出问题本身——预设步骤在前提错误时只会成为负担。

${forkEnabled ? '对全新代理，过于简略的' : '过于简略的'}命令式提示只会导致肤浅且缺乏针对性的输出。

**永远不要将理解责任外包。** 不要写“根据你的发现修复bug”或“基于调研实现”。这类说法将综合判断的责任推给子代理。写出的提示应证明你已经理解了问题：包含文件路径、行号、具体要改什么。
`

  // 示例（分支模式与普通模式不同）
  const forkExamples = `使用示例：

<example>
用户：“这个分支还差什么才能发布？”
助手：<thinking>这是个调查性问题，用 fork——我只需要清单，不需要 git 输出留在上下文里。</thinking>
${AGENT_TOOL_NAME}({
  name: "ship-audit",
  description: "分支发布就绪审计",
  prompt: "审计该分支发布前还缺什么。检查：未提交更改、领先 main 的提交、是否有测试、GrowthBook 开关是否接入、是否修改了 CI 相关文件。用清单报告——已完成 vs 缺失。200字以内。"
})
助手：发布就绪审计正在运行。
<commentary>
本轮结束。协调者此时对审计结果一无所知。后续通知以用户消息形式从外部到达，并非由助手本人撰写。
</commentary>
[后续轮次——通知作为用户消息到达]
助手：审计结果回来了。三个阻塞项：新提示路径缺少测试、GrowthBook 开关已接入但未写入 build_flags.yaml、还有一个未提交文件。
</example>

<example>
用户：“那开关到底接没接？”
<commentary>
用户在等待期间追问。审计 fork 正是为此启动的，但尚未返回。协调者没有答案。只给状态，不编造结果。
</commentary>
助手：还在等审计结果——那是它要检查的项目之一。应该快回来了。
</example>

<example>
用户：“能否对这个迁移的安全性给个第二意见？”
助手：<thinking>调用 code-reviewer 代理——它看不到我的分析，可以独立判断。</thinking>
<commentary>
指定了 subagent_type，代理从零上下文开始。需要在提示中提供完整背景。
</commentary>
${AGENT_TOOL_NAME}({
  name: "migration-review",
  description: "独立迁移审查",
  subagent_type: "code-reviewer",
  prompt: "审查迁移 0042_user_schema.sql 的安全性。背景：我们给 5000 万行表添加 NOT NULL 列。现有行用回填默认值。我想确认该回填方式在并发写入下是否安全——我已检查过锁行为，但需要独立验证。报告：是否安全？若否，具体会出什么问题？"
})
</example>
`

  const currentExamples = `使用示例：

<example_agent_descriptions>
"test-runner": 写完代码后用于运行测试
"greeting-responder": 用友好笑话回应用户问候
</example_agent_descriptions>

<example>
用户：“请写一个判断素数的函数”
助手：我将使用 ${FILE_WRITE_TOOL_NAME} 工具编写如下代码：
<code>
function isPrime(n) {
  if (n <= 1) return false
  for (let i = 2; i * i <= n; i++) {
    if (n % i === 0) return false
  }
  return true
}
</code>
<commentary>
已编写重要代码且任务完成，现调用 test-runner 代理运行测试。
</commentary>
助手：使用 ${AGENT_TOOL_NAME} 工具启动 test-runner 代理。
</example>

<example>
用户：“你好”
<commentary>
用户在问候，使用 greeting-responder 代理回应笑话。
</commentary>
助手：“我将使用 ${AGENT_TOOL_NAME} 工具启动 greeting-responder 代理。”
</example>
`

  const listViaAttachment = shouldInjectAgentListInMessages()

  const agentListSection = listViaAttachment
    ? `可用的代理类型列表将通过对话中的 <system-reminder> 消息提供。`
    : `可用的代理类型及其可访问工具：
${effectiveAgents.map(agent => formatAgentLine(agent)).join('\n')}`

  // 协调者与非协调者共用的核心部分
  const shared = `启动新代理以自主处理复杂、多步骤任务。

${AGENT_TOOL_NAME} 工具用于启动专门的代理（子进程），每种代理类型具有特定能力和工具集。

${agentListSection}

${
  forkEnabled
    ? `使用 ${AGENT_TOOL_NAME} 工具时，指定 subagent_type 以使用专门代理，或省略它以 fork 自身——fork 会继承你的完整对话上下文。`
    : `使用 ${AGENT_TOOL_NAME} 工具时，必须指定 subagent_type 参数来选择代理类型。若省略，则使用通用代理。`
}`

  // 协调者模式仅需精简版
  if (isCoordinator) {
    return shared
  }

  // 根据环境调整搜索工具提示
  const embedded = hasEmbeddedSearchTools()
  const fileSearchHint = embedded ? '通过 Bash 工具使用 `find`' : `${GLOB_TOOL_NAME} 工具`
  const contentSearchHint = embedded ? '通过 Bash 工具使用 `grep`' : `${GLOB_TOOL_NAME} 工具`

  // 何时不应使用代理（分支模式下不需要此节）
  const whenNotToUseSection = forkEnabled
    ? ''
    : `
何时不应使用 ${AGENT_TOOL_NAME} 工具：
- 想读取特定文件路径时，使用 ${FILE_READ_TOOL_NAME} 工具或 ${fileSearchHint}，能更快定位
- 搜索特定类定义（如 "class Foo"）时，使用 ${contentSearchHint}，能更快定位
- 在特定文件或 2-3 个文件内搜索代码时，使用 ${FILE_READ_TOOL_NAME} 工具而非代理工具
- 其他与上述代理描述无关的任务
`

  // 并发提示（当列表以附件形式发送时，此部分在附件中处理）
  const concurrencyNote =
    !listViaAttachment && getSubscriptionType() !== 'pro'
      ? `
- 尽可能在单条消息中并发启动多个代理以提升性能`
      : ''

  // 后台任务相关提示（仅特定条件下显示）
  const backgroundTaskNote =
    // eslint-disable-next-line custom-rules/no-process-env-top-level
    !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS) &&
    !isInProcessTeammate() &&
    !forkEnabled
      ? `
- 可选使用 run_in_background 参数在后台运行代理。后台运行时会自动通知完成——无需 sleep、轮询或主动检查进度。继续其他工作或回应用户即可。
- **前台与后台**：需要代理结果才能继续时用前台（默认），如调研结果影响后续决策。有真正独立并行工作时再用后台。`
      : ''

  // 隔离模式提示
  const isolationNote = `- 可选设置 \`isolation: "worktree"\` 在临时 git 工作树中运行代理，提供隔离的仓库副本。若无更改，工作树自动清理；若有更改，结果中返回工作树路径和分支。${
    process.env.USER_TYPE === 'ant'
      ? `\n- 可设置 \`isolation: "remote"\` 在远程 CCR 环境中运行代理。此为后台任务，完成时会通知。适用于需要干净沙箱的长时间任务。`
      : ''
  }`

  // 队友上下文限制提示
  const contextRestrictionNote = isInProcessTeammate()
    ? `
- 此上下文中 run_in_background、name、team_name 和 mode 参数不可用。仅支持同步子代理。`
    : isTeammate()
      ? `
- name、team_name 和 mode 参数在此上下文中不可用——队友不能派生其他队友。省略它们以派生子代理。`
      : ''

  // 非协调者完整提示
  return `${shared}
${whenNotToUseSection}

使用说明：
- 始终包含简短描述（3-5词）概括代理任务${concurrencyNote}
- 代理完成后会返回一条消息给你。返回结果对用户不可见。若需向用户展示结果，应自行发送文本消息简要总结。${backgroundTaskNote}
- 要继续先前派生的代理，使用 ${SEND_MESSAGE_TOOL_NAME}，将代理 ID 或名称作为 \`to\` 字段。代理将恢复完整上下文。${forkEnabled ? '每次调用 Agent 且指定 subagent_type 时均从零上下文开始——请提供完整任务描述。' : '每次 Agent 调用均从头开始——请提供完整任务描述。'}
- 一般应信任代理的输出
- 明确告知代理是编写代码还是仅做调研（搜索、读文件、网络获取等）${forkEnabled ? '' : '，因其不知晓用户意图'}
- 若代理描述提及应主动使用，请尽量主动调用，无需用户开口。
- 若用户要求“并行”运行代理，你必须在单条消息中包含多个 ${AGENT_TOOL_NAME} 工具调用。例如，同时启动 build-validator 和 test-runner，应在一条消息中放置两个工具调用。
${isolationNote}${contextRestrictionNote}${whenToForkSection}${writingThePromptSection}

${forkEnabled ? forkExamples : currentExamples}`
}