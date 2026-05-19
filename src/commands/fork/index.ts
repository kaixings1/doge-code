// Stub: commands/fork/index.ts
import type { Command } from '../../commands.js'

const fork = {
  type: 'local',
  name: 'fork',
  description: 'Fork subagent (stub)',
  isEnabled: () => false,
  isHidden: true,
  supportsNonInteractive: false,
  load: () => Promise.resolve({ call: async (_args: string, _context: any) => undefined as any }),
} satisfies Command

export default fork
