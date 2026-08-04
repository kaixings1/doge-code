import { type Tool } from '../../engine/types.js'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

export class CtxInspectTool implements Tool {
  name = 'context_inspect'
  description = 'Inspect current context: token usage, message count, and state'
  parameters = {
    type: 'object' as const,
    properties: {
      detail: { type: 'string', description: 'Detail level: summary or full', enum: ['summary', 'full'] }
    },
    required: []
  }
  validate = () => ({ valid: true })
  execute = async (params: Record<string, any>) => {
    const detail = params?.detail || 'summary'
    const lines: string[] = ['## Context Inspection', '']
    const statsPath = join(process.cwd(), '.doge', 'stats.json')
    if (existsSync(statsPath)) {
      try {
        const stats = JSON.parse(readFileSync(statsPath, 'utf-8'))
        if (stats.totalTokens) {
          lines.push(`**Total Tokens:** ${(stats.totalTokens.input + stats.totalTokens.output).toLocaleString()}`)
          lines.push(`**Input:** ${(stats.totalTokens.input || 0).toLocaleString()}`)
          lines.push(`**Output:** ${(stats.totalTokens.output || 0).toLocaleString()}`)
        }
      } catch { /* ignore */ }
    }
    lines.push(`**Detail Level:** ${detail}`)
    if (detail === 'full') {
      lines.push('', '### Environment', `- CWD: ${process.cwd()}`, `- Node: ${process.version}`, `- Platform: ${process.platform}`)
      lines.push('', '### Memory', `- RSS: ${(process.memoryUsage().rss / 1024 / 1024).toFixed(1)} MB`)
      lines.push(`- Heap: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)} MB`)
    }
    return { content: [{ type: 'text', text: lines.join('\n') }] }
  }
}
