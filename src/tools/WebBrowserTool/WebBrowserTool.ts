import { type Tool } from '../../engine/types.js'
export class WebBrowserTool implements Tool {
  name = 'web_browser'
  description = 'Web browser'
  isEnabled = () => false
  inputSchema = { type: 'object', properties: {}, required: [] }
  execute = async () => ({ content: [{ type: 'text', text: 'Not available in this build' }] })
}
