import { type Tool } from '../../engine/types.js'
export class SendUserFileTool implements Tool {
  name = 'send_user_file'
  description = 'Send user file'
  isEnabled = () => false
  inputSchema = { type: 'object', properties: {}, required: [] }
  execute = async () => ({ content: [{ type: 'text', text: 'Not available in this build' }] })
}
