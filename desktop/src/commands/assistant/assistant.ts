// 自动生成的存根 — 已替换为真实实现
import type { Command } from '../../commands.js'
import type React from 'react'

export { NewInstallWizard, computeDefaultInstallDir } from '../../assistant/assistant.js'

export const AssistantSessionChooser: (props: Record<string, unknown>) => null = () => null

export const assistant = {
  type: 'local',
  name: 'assistant',
  description: '助手模式控制',
  argumentHint: '[help|status|on|off]',
  isEnabled: () => true,
  supportsNonInteractive: true,
  load: () => import('../../assistant/assistant.js').then(m => ({ call: m.default.call }))
} satisfies Command
