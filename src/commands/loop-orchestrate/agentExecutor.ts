/**
 * agentExecutor — 同步调度真 subagent 的封装（阶段 1.5）
 *
 * 封装 runAgent() 的复杂参数组装，让 loop-orchestrate 能真正调度
 * 独立上下文的 subagent（而非角色化 AI 模拟）。
 *
 * 复用 AgentTool.tsx 的同步路径组装逻辑（assembleToolPool + runAgent +
 * finalizeAgentTool + extractTextContent），收敛异步生成器为同步文本返回。
 */

import type { ToolUseContext } from '../../Tool.js'
import type { CanUseToolFn } from '../../hooks/useCanUseTool.js'
import type { Message } from '../../types/message.js'
import { createUserMessage, extractTextContent } from '../../utils/messages.js'
import { isBuiltInAgent } from '../../tools/AgentTool/loadAgentsDir.js'
import { getAgentModel } from '../../utils/model/agent.js'
import { getQuerySourceForAgent } from '../../utils/promptCategory.js'
import { createAgentId } from '../../utils/uuid.js'
import { asAgentId } from '../../types/ids.js'

// 注意：runAgent / finalizeAgentTool / assembleToolPool 必须在函数内动态 import。
// 它们经 runAgent → commands.ts 形成循环依赖（commands.ts → loop-orchestrate →
// agentExecutor → runAgent → commands.ts），静态 import 会导致
// "Cannot access 'feedback' before initialization"。动态 import 延迟到运行时，
// 此时 commands.ts 已加载完成，循环被打破。

export interface AgentExecutionResult {
  success: boolean
  output: string
  agentType: string
}

/**
 * 同步运行一个 subagent，返回其文本输出。
 *
 * @param agentType - subagent 类型名（如 'planner'、'code-reviewer'）
 * @param prompt - 传给 subagent 的任务描述
 * @param context - local-jsx 命令上下文（含 canUseTool、agentDefinitions、工具池）
 */
export async function runAgentSync(
  agentType: string,
  prompt: string,
  context: ToolUseContext,
  canUseTool: CanUseToolFn | null,
): Promise<AgentExecutionResult> {
  if (!canUseTool) {
    return {
      success: false,
      output: '❌ 当前上下文缺少 canUseTool，无法调度 subagent。请在交互式 REPL 中运行本命令。',
      agentType,
    }
  }

  const appState = context.getAppState()
  const agentDefinition = context.options.agentDefinitions.activeAgents.find(
    a => a.agentType.toLowerCase() === agentType.toLowerCase(),
  )

  if (!agentDefinition) {
    return {
      success: false,
      output: `❌ 未知 agent 类型: ${agentType}。可用类型：${context.options.agentDefinitions.activeAgents.map(a => a.agentType).join(', ')}`,
      agentType,
    }
  }

  const permissionMode = appState.toolPermissionContext.mode
  const workerPermissionContext = {
    ...appState.toolPermissionContext,
    mode: agentDefinition.permissionMode ?? 'acceptEdits',
  }
  // 动态 import 打破循环依赖（见文件顶部注释）
  const [{ runAgent }, { finalizeAgentTool }, { assembleToolPool }] = await Promise.all([
    import('../../tools/AgentTool/runAgent.js'),
    import('../../tools/AgentTool/agentToolUtils.js'),
    import('../../tools.js'),
  ])
  const workerTools = assembleToolPool(workerPermissionContext, appState.mcp.tools)

  const promptMessages = [createUserMessage({ content: prompt })]
  const agentId = createAgentId()

  const startTime = Date.now()
  const agentMessages: Message[] = []

  try {
    for await (const msg of runAgent({
      agentDefinition,
      promptMessages,
      toolUseContext: context,
      canUseTool,
      isAsync: false,
      querySource: getQuerySourceForAgent(agentDefinition.agentType, isBuiltInAgent(agentDefinition)),
      availableTools: workerTools,
      description: prompt.slice(0, 100),
      depth: 0,
    })) {
      agentMessages.push(msg)
    }
  } catch (err) {
    return {
      success: false,
      output: `❌ subagent 执行失败: ${err instanceof Error ? err.message : String(err)}`,
      agentType: agentDefinition.agentType,
    }
  }

  if (agentMessages.length === 0) {
    return { success: false, output: '❌ subagent 未返回任何消息。', agentType: agentDefinition.agentType }
  }

  const resolvedAgentModel = getAgentModel(
    agentDefinition.model,
    context.options.mainLoopModel,
    undefined,
    permissionMode,
  )
  const metadata = {
    prompt,
    resolvedAgentModel,
    isBuiltInAgent: isBuiltInAgent(agentDefinition),
    startTime,
    agentType: agentDefinition.agentType,
    isAsync: false,
  }

  try {
    const result = finalizeAgentTool(agentMessages, asAgentId(agentId), metadata)
    const output = extractTextContent(result.content, '\n')
    return { success: true, output, agentType: agentDefinition.agentType }
  } catch (err) {
    return {
      success: false,
      output: `❌ 提取 subagent 输出失败: ${err instanceof Error ? err.message : String(err)}`,
      agentType: agentDefinition.agentType,
    }
  }
}
