import { type Tool } from '../../engine/types.js'
export class WebBrowserTool implements Tool {
  name = 'web_browser'
  description = 'Web browser'
  parameters = { type: 'object', properties: {}, required: [] }
  validate = () => ({ valid: true })
  execute = async () => ({ content: [{ type: 'text', text: 'Not available in this build' }] })
}
