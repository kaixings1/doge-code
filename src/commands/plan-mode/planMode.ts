import type { LocalCommandCall } from '../../types/command.js'
import { permissionModeTitle, permissionModeSymbol } from '../../utils/permissions/PermissionMode.js'

/**
 * Plan Mode command — toggle between normal mode and plan (read-only) mode.
 *
 * 用法:
 *   /plan-mode         — 切换计划模式（default ↔ plan）
 *   /plan-mode status  — 显示当前模式
 */
export const call: LocalCommandCall = async (args: string, context) => {
  const arg = (args || '').trim().toLowerCase()
  const appState = context.getAppState()
  const currentMode = appState.toolPermissionContext.mode

  if (arg === 'status') {
    const isPlan = currentMode === 'plan'
    const statusText = [
      permissionModeSymbol(currentMode) + ' 当前模式: ' + permissionModeTitle(currentMode),
      '',
      isPlan
        ? '🔍 计划模式已激活 — 只读探索，不执行修改'
        : '✏️ 默认模式 — 可正常编辑和执行',
      '',
      '使用 /plan-mode 切换模式',
    ].join('\n')
    return { type: 'text' as const, value: statusText }
  }

  // Toggle between default and plan mode
  const newMode: typeof currentMode = currentMode === 'plan' ? 'default' : 'plan'

  context.setAppState(prev => ({
    ...prev,
    toolPermissionContext: {
      ...prev.toolPermissionContext,
      mode: newMode,
    },
  }))

  const isPlan = newMode === 'plan'

  return {
    type: 'text' as const,
    value: [
      (isPlan ? '🔍 ' : '✏️ ') + '模式已切换: ' + permissionModeTitle(newMode),
      '',
      isPlan
        ? '计划模式已激活 — AI 将只进行探索和分析，不会执行修改操作。'
        : '已恢复默认模式 — AI 可以正常编辑文件和执行命令。',
      '',
      '使用 /plan-mode 随时切换回' + (isPlan ? '默认模式' : '计划模式'),
    ].join('\n'),
  }
}
