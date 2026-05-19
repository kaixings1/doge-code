function readAssistantModeFlag(): boolean {
  return (
    process.env.CLAUDE_CODE_ASSISTANT_MODE === '1' ||
    process.env.CLAUDE_CODE_ASSISTANT_MODE === 'true'
  )
}

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
  const mod = require('../../assistant/index.js')
  return mod.isAssistantForced?.() || false
}

/** 标记助手模式为强制启用（用于守护进程模式）。 */
export function markAssistantForced(): void {
  const mod = require('../../assistant/index.js')
  mod.markAssistantForced?.()
}

/**
 * 初始化助手团队上下文。
 */
export async function initializeAssistantTeam(): Promise<any> {
  const mod = require('../../assistant/index.js')
  return mod.initializeAssistantTeam?.() || { teamId: 'default', teamName: 'Default Team' }
}

/**
 * 获取助手系统提示词附加内容。
 */
export function getAssistantSystemPromptAddendum(): string {
  const mod = require('../../assistant/index.js')
  return mod.getAssistantSystemPromptAddendum?.() || ''
}

/**
 * 获取助手激活路径。
 */
export function getAssistantActivationPath(): string {
  const mod = require('../../assistant/index.js')
  return mod.getAssistantActivationPath?.() || '/settings/assistant'
}
