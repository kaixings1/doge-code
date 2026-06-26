import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { queryApi } from './api.js'

export const call: LocalJSXCommandCall = async (args) => {
  const parts = args.trim().split(/\s+/)
  const code = parts[0] || ''
  const type = parts[1] || 'price'
  if (!code) {
    return { type: 'text', value: 'Usage: /stock <code> [price|finance|overview]' }
  }
  const secid = code.startsWith('6') ? '1.' + code : '0.' + code
  try {
    let result = ''
    if (type === 'price') result = await queryApi.realtimeQuote(secid, code)
    else if (type === 'finance') result = await queryApi.financeData(code)
    else result = await queryApi.companyOverview(code)
    return { type: 'text', value: result }
  } catch (err) {
    return { type: 'text', value: 'Error: ' + err.message }
  }
}

const stockCommand = {
  type: 'local-jsx' as const,
  name: 'stock',
  description: 'Stock quote and financial data',
  argumentHint: '<code> [price|finance|overview]',
  isEnabled: () => true,
  load: () => import('./index.js'),
} satisfies Command

export default stockCommand
