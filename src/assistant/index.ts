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
