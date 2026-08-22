import type { LocalCommandCall } from '../../types/command.js'
import mcpConfigModule from './mcpConfig.js'

const call: LocalCommandCall = async (args) => {
  const trimmed = (args || '').trim()
  if (!trimmed || trimmed === 'help' || trimmed === '--help' || trimmed === '-h') {
    return mcpConfigModule.call('help')
  }
  return mcpConfigModule.call(trimmed)
}

export default call
