// Stub: commands/peers/index.ts
import type { Command } from '../../commands.js'

const peers = {
  type: 'local',
  name: 'peers',
  description: 'Peer sessions (stub)',
  isEnabled: () => false,
  isHidden: true,
  supportsNonInteractive: false,
  load: () => Promise.resolve({ call: async (_args: string, _context: any) => undefined as any }),
} satisfies Command

export default peers
