import { type Tool } from '../../engine/types.js'

export class TerminalCaptureTool implements Tool {
  name = 'terminal_capture'
  description = 'Capture terminal output'
  isEnabled = () => false
  inputSchema = { type: 'object', properties: {}, required: [] }
  execute = async () => ({ content: [{ type: 'text', text: 'Not available in this build' }] })
}
