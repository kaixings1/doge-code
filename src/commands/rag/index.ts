import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { ragApi } from './api.js'

export const call: LocalJSXCommandCall = async (args) => {
  const parts = args.trim().split(/\s+/)
  const subcmd = parts[0] || ''

  if (!subcmd) {
    return { type: 'text', value: 'Usage: /rag help' }
  }

  try {
    let result = ''
    if (subcmd === 'add') {
      const folder = parts[1] || '.'
      result = await ragApi.indexFolder(folder)
    } else if (subcmd === 'query') {
      const q = parts.slice(1).join(' ')
      if (!q) return { type: 'text', value: 'Usage: /rag query <text>' }
      result = await ragApi.query(q)
    } else if (subcmd === 'list') {
      result = await ragApi.listIndexed()
    } else if (subcmd === 'clear') {
      result = await ragApi.clearIndex()
    } else {
      result = 'Usage: /rag <add|query|list|clear> [args]'
    }
    return { type: 'text', value: result }
  } catch (err) {
    return { type: 'text', value: 'Error: ' + err.message }
  }
}

const ragCommand = {
  type: 'local-jsx' as const,
  name: 'rag',
  description: 'RAG local knowledge base - index folders and search',
  argumentHint: '<add|query|list|clear> [args]',
  isEnabled: true,
  load: () => import('./index.js'),
} satisfies Command

export default ragCommand
