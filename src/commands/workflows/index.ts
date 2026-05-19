// Stub: commands/workflows/index.ts
import type { Command } from '../../commands.js'

const workflows: Command = {
  type: 'local',
  name: 'workflows',
  description: 'Workflow scripts (stub)',
  isEnabled: () => false,
  isHidden: true,
  supportsNonInteractive: false,
  load: () => Promise.resolve({ call: async () => {} }) as any,
}

export default workflows
