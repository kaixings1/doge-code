import type { SettingSource } from '../../../utils/settings/constants.js'
import type { AgentMemoryScope } from '../../../tools/AgentTool/agentMemory.js'

export type AgentWizardData = {
  location?: SettingSource
  wasGenerated?: boolean
  systemPrompt?: string
  selectedModel?: string
  selectedMemory?: AgentMemoryScope
  finalAgent?: {
    agentType: string
    whenToUse: string
    tools?: string[]
    color?: string
    model?: string
    memory?: AgentMemoryScope
    getSystemPrompt: () => string
  }
}
