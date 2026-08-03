function readAssistantModeFlag(): boolean {
  return (
    process.env.CLAUDE_CODE_ASSISTANT_MODE === '1' ||
    process.env.CLAUDE_CODE_ASSISTANT_MODE === 'true'
  )
}

let assistantForced = false

/** 检查是否处于助手模式。 */
export function isAssistantMode(): boolean {
  return readAssistantModeFlag()
}

/** 检查助手模式是否已启用。 */
export function isAssistantModeEnabled(): boolean {
  return readAssistantModeFlag()
}

/** 检查助手模式是否被强制启用（通过 --assistant 标志）。 */
export function isAssistantForced(): boolean {
  return assistantForced
}

/** 标记助手模式为强制启用（用于守护进程模式）。 */
export function markAssistantForced(): void {
  assistantForced = true
}

/**
 * 初始化助手团队上下文。
 * 预填充团队信息以便 Agent 可以在没有显式 TeamCreate 的情况下生成队友。
 */
export async function initializeAssistantTeam(): Promise<{
  teamId: string
  teamName: string
}> {
  // 这里可以添加实际的团队初始化逻辑
  // 目前返回一个模拟的团队上下文
  return {
    teamId: 'assistant-team-' + Date.now(),
    teamName: 'Assistant Team'
  }
}

/**
 * 获取助手系统提示词附加内容。
 * 用于在系统提示词中添加助手模式特定的指导。
 */
export function getAssistantSystemPromptAddendum(): string {
  return `
你正在助手模式下运行。请遵循以下指导：
1. 优先使用工具来完成任务
2. 保持响应简洁且有针对性
3. 在执行操作前确认用户意图
4. 使用结构化输出便于解析
`.trim()
}

/**
 * 获取助手激活路径。
 * 返回助手模式相关的文档或设置页面路径。
 */
export function getAssistantActivationPath(): string {
  return '/settings/assistant'
}
