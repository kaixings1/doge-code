import { type Tool } from '../../engine/types.js'
export class SendUserFileTool implements Tool {
  name = 'send_user_file'
  description = 'Send user file'
  parameters = { type: 'object', properties: {}, required: [] }
  validate = () => ({ valid: true })
  execute = async () => ({ content: [{ type: 'text', text: 'Not available in this build' }] })
}
