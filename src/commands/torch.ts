import type { Command } from '../commands.js'

const torch: Command = {
  type: 'local',
  name: 'torch',
  description: 'Torch 模式（预留）',
  isEnabled: () => false,
  isHidden: true,
  supportsNonInteractive: false,
  load: () => Promise.resolve({ call: async () => ({ type: 'text' as const, value: 'Torch 模式未实现' }) }),
}

export default torch
