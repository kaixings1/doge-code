import { type Tool } from '../../engine/types.js'
export class SubscribePRTool implements Tool {
  name = 'subscribe_pr'
  description = 'Subscribe PR'
  isEnabled = () => false
  inputSchema = { type: 'object', properties: {}, required: [] }
  execute = async () => ({ content: [{ type: 'text', text: 'Not available in this build' }] })
}
