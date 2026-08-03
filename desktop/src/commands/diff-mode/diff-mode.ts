import type {
  LocalCommandContext,
  LocalCommandOnDone,
} from '../../types/command.js'
import {
  getGlobalConfig,
  saveGlobalConfig,
} from '../../utils/config.js'
import { updateSettingsForSource } from '../../utils/settings/settings.js'

export async function call(
  onDone: LocalCommandOnDone,
  _context: LocalCommandContext,
  args: string,
): Promise<null> {
  const config = getGlobalConfig()
  const current = config.sideBySideDiff ?? false

  const trimmed = args?.trim().toLowerCase() || 'toggle'
  let newValue: boolean

  if (trimmed === 'side-by-side' || trimmed === 'sbs' || trimmed === 'on' || trimmed === 'true' || trimmed === '1') {
    newValue = true
  } else if (trimmed === 'single' || trimmed === 'classic' || trimmed === 'off' || trimmed === 'false' || trimmed === '0') {
    newValue = false
  } else {
    newValue = !current
  }

  // Persist to config
  const { error } = updateSettingsForSource('userSettings', {
    sideBySideDiff: newValue,
  })
  if (error) {
    onDone(`切换失败: ${error.message}`)
    return null
  }

  const mode = newValue ? '并排差异视图' : '单列差异视图'
  onDone(`已切换到${mode}`)
  return null
}
