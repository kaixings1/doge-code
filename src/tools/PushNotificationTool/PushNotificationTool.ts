import { type Tool } from '../../engine/types.js'
export class PushNotificationTool implements Tool {
  name = 'push_notification'
  description = 'Push notification'
  isEnabled = () => false
  inputSchema = { type: 'object', properties: {}, required: [] }
  execute = async () => ({ content: [{ type: 'text', text: 'Not available in this build' }] })
}
