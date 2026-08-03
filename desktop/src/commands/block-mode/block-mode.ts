import type {
  LocalCommandContext,
  LocalCommandOnDone,
} from '../../types/command.js'
import { getGlobalConfig } from '../../utils/config.js'
import { updateSettingsForSource } from '../../utils/settings/settings.js'

export async function call(
  onDone: LocalCommandOnDone,
  _context: LocalCommandContext,
  args: string,
): Promise<null> {
  const config = getGlobalConfig()
  const current = config.blockOutput ?? false

  const trimmed = args?.trim().toLowerCase() || 'toggle'
  let newValue: boolean

  if (trimmed === 'on' || trimmed === 'true' || trimmed === '1' || trimmed === 'block') {
    newValue = true
  } else if (trimmed === 'off' || trimmed === 'false' || trimmed === '0' || trimmed === 'plain') {
    newValue = false
  } else {
    newValue = !current
  }

  const { error } = updateSettingsForSource('userSettings', {
    blockOutput: newValue,
  })
  if (error) {
    onDone(`切换失败: ${error.message}`)
    return null
  }

  const mode = newValue ? '块状输出' : '普通输出'
  onDone(`已切换到${mode}模式`)
  return null
}
