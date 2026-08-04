import { type Tool } from '../../engine/types.js'
import { readdirSync, existsSync } from 'fs'
import { join } from 'path'

export class ListPeersTool implements Tool {
  name = 'list_peers'
  description = 'List remote peers and connected sessions'
  parameters = {
    type: 'object' as const,
    properties: {
      status: { type: 'string', description: 'Filter by peer status', enum: ['all', 'active', 'inactive'] }
    },
    required: []
  }
  validate = () => ({ valid: true })
  execute = async (params: Record<string, any>) => {
    const statusFilter = params?.status || 'all'
    const lines: string[] = ['## Peer Connections', '']
    const peersDir = join(process.cwd(), '.doge', 'peers')
    if (existsSync(peersDir)) {
      try {
        const files = readdirSync(peersDir)
        for (const file of files.filter(f => f.endsWith('.json'))) {
          const data = JSON.parse(require('fs').readFileSync(join(peersDir, file), 'utf-8'))
          lines.push(`- **${data.name || file.replace('.json', '')}**`)
          lines.push(`  - ID: ${data.id || 'unknown'}`)
          lines.push(`  - Status: ${data.status || 'unknown'}`)
          lines.push(`  - Last Active: ${data.lastActive || 'unknown'}`)
          lines.push('')
        }
      } catch { /* ignore */ }
    }
    if (lines.length === 2) {
      lines.push('No peer connections found.')
      lines.push('Remote sessions are stored in .doge/peers/ directory.')
    }
    return { content: [{ type: 'text', text: lines.join('\n') }] }
  }
}
