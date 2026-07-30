import { type Tool } from '../../engine/types.js'
export class SubscribePRTool implements Tool {
  name = 'subscribe_pr'
  description = 'Subscribe PR'
  parameters = { type: 'object', properties: {}, required: [] }
  validate = () => ({ valid: true })
  execute = async () => ({ content: [{ type: 'text', text: 'Not available in this build' }] })
}
