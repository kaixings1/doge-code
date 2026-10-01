import { getGlobalConfig } from '../../utils/config.js'
import { updateSettingsForSource } from '../../utils/settings/settings.js'

export async function call(
  _onDone: any,
  _context: any,
  args: string,
): Promise<{ type: 'text'; value: string }> {
  const config = getGlobalConfig() as any
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
    return { type: 'text', value: `切换失败: ${error.message}` }
  }

  const mode = newValue ? '块状输出' : '普通输出'
  return { type: 'text', value: `已切换到${mode}模式` }
}
