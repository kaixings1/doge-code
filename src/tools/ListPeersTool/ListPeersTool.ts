import { type Tool } from '../../engine/types.js'
export class ListPeersTool implements Tool {
  name = 'list_peers'
  description = 'List peers'
  isEnabled = () => false
  inputSchema = { type: 'object', properties: {}, required: [] }
  execute = async () => ({ content: [{ type: 'text', text: 'Not available in this build' }] })
}
