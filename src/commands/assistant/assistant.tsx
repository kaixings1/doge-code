// 助手模式相关组件
import * as React from 'react'
import { NewInstallWizard, computeDefaultInstallDir } from '../../assistant/assistant.js'
import { AssistantSessionChooser } from '../../assistant/AssistantSessionChooser.js'
import type { Command } from '../../commands.js'

export { NewInstallWizard, computeDefaultInstallDir, AssistantSessionChooser }
export const assistant: Command = {
  type: 'local',
  name: 'assistant',
  description: '助手模式控制',
  argumentHint: '[help|status|on|off]',
  isEnabled: () => true,
  supportsNonInteractive: true,
  load: () => import('../../assistant/assistant.js').then(m => ({ call: m.default.call }))
}
