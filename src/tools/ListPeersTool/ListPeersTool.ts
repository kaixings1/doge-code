import { type Tool } from '../../engine/types.js'
export class ListPeersTool implements Tool {
  name = 'list_peers'
  description = 'List peers'
  parameters = { type: 'object', properties: {}, required: [] }
  validate = () => ({ valid: true })
  execute = async () => ({ content: [{ type: 'text', text: 'Not available in this build' }] })
}
