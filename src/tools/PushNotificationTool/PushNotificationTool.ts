import { type Tool } from '../../engine/types.js'
export class PushNotificationTool implements Tool {
  name = 'push_notification'
  description = 'Push notification'
  parameters = { type: 'object', properties: {}, required: [] }
  validate = () => ({ valid: true })
  execute = async () => ({ content: [{ type: 'text', text: 'Not available in this build' }] })
}
